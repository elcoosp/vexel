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

let args = CommandLine.arguments
let downloadsURL = URL(fileURLWithPath: args[1])
let outDirURL = URL(fileURLWithPath: args[2])
let fm = FileManager.default

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
    guard let image = NSImage(contentsOf: png),
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
        let dest = outDirURL.appendingPathComponent("banner-\(version).png")
        try? fm.removeItem(at: dest)
        try fm.moveItem(at: png, to: dest)
        print("✅ OCR detected \(version) in \(png.lastPathComponent) -> docs/releases/banner-\(version).png")
        imported += 1
    }
}

if imported == 0 {
    print("No recent Stitch release banners with a vX.Y.Z label found in \(downloadsURL.path)")
}
SWIFT
