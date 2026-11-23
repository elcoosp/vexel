#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/docs/releases"
DOWNLOADS_DIR="${1:-$HOME/Downloads}"

mkdir -p "$OUT_DIR"

swift - "$DOWNLOADS_DIR" "$OUT_DIR" << 'SWIFT'
import Foundation
import Vision
import AppKit

var argIter = CommandLine.arguments.dropFirst().makeIterator()
guard let downloadsPath = argIter.next(), let outDirPath = argIter.next() else {
    fputs("Missing arguments\n", stderr)
    exit(1)
}
let downloadsURL = URL(fileURLWithPath: downloadsPath)
let outDirURL = URL(fileURLWithPath: outDirPath)
let fm = FileManager.default
try? fm.createDirectory(at: outDirURL, withIntermediateDirectories: true)

let cutoff = Date().addingTimeInterval(-3600)
let files = (try? fm.contentsOfDirectory(
    at: downloadsURL,
    includingPropertiesForKeys: [.creationDateKey, .contentModificationDateKey],
    options: [.skipsHiddenFiles]
)) ?? []

let pngs = files.filter { url in
    guard url.pathExtension.lowercased() == "png" else { return false }
    let vals = try? url.resourceValues(forKeys: [.creationDateKey, .contentModificationDateKey])
    let date = vals?.contentModificationDate ?? vals?.creationDate ?? .distantPast
    return date >= cutoff
}.sorted { a, b in
    let da = (try? a.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
    let db = (try? b.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
    return da > db
}

let versionRegex = try! NSRegularExpression(pattern: #"\bv\d+\.\d+\.\d+\b"#, options: [.caseInsensitive])
var imported = 0

for png in pngs {
    guard fm.fileExists(atPath: png.path),
          let image = NSImage(contentsOf: png),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        continue
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try? handler.perform([request])

    let observations = request.results ?? []
    let fullText = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")

    let range = NSRange(fullText.startIndex..<fullText.endIndex, in: fullText)
    if let match = versionRegex.firstMatch(in: fullText, options: [], range: range),
       let swiftRange = Range(match.range, in: fullText) {
        let version = fullText[swiftRange].lowercased()
        let dest = outDirURL.appendingPathComponent("release-\(version).png")
        try? fm.removeItem(at: dest)
        do {
            try fm.copyItem(at: png, to: dest)
            try? fm.removeItem(at: png)
            print("✅ OCR detected \(version) in \(png.lastPathComponent) -> docs/releases/release-\(version).png")
            imported += 1
        } catch {
            print("⚠️ Failed to copy \(png.lastPathComponent): \(error)")
        }
    }
}

if imported == 0 {
    print("No recent Stitch release banners with a vX.Y.Z label found in \(downloadsURL.path)")
}
SWIFT
