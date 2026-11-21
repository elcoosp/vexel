import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { i18n } from '../i18n'

export interface BuiltinSkillDef {
  id: string
  name: string
  readonly description: string
  smartContent: string
  smartLength: number
  fullContent: string
  fullLength: number
  refCount: number
  refs: never[]
  isBuiltin: true
}

const RAW_BUILTINS: Array<{ id: string; name: string; descMsg: MessageDescriptor; body: string }> =
  [
    {
      id: 'builtin-review-pr',
      name: 'review-pr',
      descMsg: msg`Senior code review focusing on bugs, security edge cases, race conditions, and maintainability.`,
      body: [
        '# Skill: Senior Code Review',
        '',
        'Review the provided code or diff with high rigor:',
        '1. **Correctness & Edge Cases**: Flag logic bugs, null/undefined paths, async race conditions, and off-by-one errors.',
        '2. **Security & Performance**: Identify injection risks, auth gaps, N+1 queries, memory leaks, or unnecessary re-renders.',
        '3. **Actionable Fixes**: For each issue, provide severity (`Critical` / `High` / `Medium`), exact location, and a minimal copy-paste patch.',
        '4. Skip nitpicks unless they impact readability or reliability.',
      ].join('\n'),
    },
    {
      id: 'builtin-debug-root-cause',
      name: 'debug-root-cause',
      descMsg: msg`Systematic root-cause diagnosis from stack traces, logs, and code without guesswork.`,
      body: [
        '# Skill: Systematic Root-Cause Debugging',
        '',
        'Analyze the error, logs, and code using structured elimination:',
        '1. **Symptom vs Root Cause**: Separate the surface failure from the underlying invariant violation.',
        '2. **Ranked Hypotheses**: List the top 3 causes ordered by probability with exact evidence from the context.',
        '3. **Verification & Fix**: Give the exact minimal fix and a verification step to prove the bug cannot regress.',
      ].join('\n'),
    },
    {
      id: 'builtin-architect',
      name: 'architect',
      descMsg: msg`Design pragmatic, scalable system architecture with clear trade-offs and data flow.`,
      body: [
        '# Skill: Pragmatic System Architecture',
        '',
        'Propose a concrete, production-ready technical design:',
        '1. **Core Components & Data Flow**: Define boundaries, state ownership, and interfaces clearly.',
        '2. **Trade-Off Matrix**: Compare at least 2 viable approaches across latency, complexity, cost, and failure modes.',
        '3. **Implementation Plan**: Break delivery into small, testable milestones with zero over-engineering.',
      ].join('\n'),
    },
    {
      id: 'builtin-refactor-clean',
      name: 'refactor-clean',
      descMsg: msg`Simplify complex functions, remove dead code, and improve type safety without behavior changes.`,
      body: [
        '# Skill: Clean Behavior-Preserving Refactor',
        '',
        'Refactor the provided code while preserving 100% of external behavior:',
        '1. Flatten deep nesting with early returns and small, single-responsibility helpers.',
        '2. Tighten TypeScript/static types and eliminate unsafe casts.',
        '3. Remove dead branches and duplicated state while keeping diffs minimal and readable.',
      ].join('\n'),
    },
    {
      id: 'builtin-test-suite',
      name: 'test-suite',
      descMsg: msg`Generate high-signal unit and integration tests covering happy paths, boundaries, and failures.`,
      body: [
        '# Skill: High-Signal Test Suite Generator',
        '',
        'Write focused, deterministic tests for the provided code:',
        '1. Cover core happy paths, boundary conditions, empty/malformed inputs, and error recovery.',
        '2. Mock only external I/O boundaries; test real business logic directly.',
        '3. Use clear Arrange-Act-Assert structure with descriptive test names.',
      ].join('\n'),
    },
    {
      id: 'builtin-sql-perf',
      name: 'sql-perf',
      descMsg: msg`Optimize slow SQL queries, composite indexes, and execution plans.`,
      body: [
        '# Skill: SQL & Query Performance Optimization',
        '',
        'Analyze and optimize the provided schema and queries:',
        '1. Identify full table scans, non-sargable predicates, N+1 patterns, and lock contention.',
        '2. Recommend exact composite indexes (`CREATE INDEX ...`) with column order rationale.',
        '3. Provide the rewritten query and explain expected `EXPLAIN ANALYZE` improvements.',
      ].join('\n'),
    },
  ]

export const BUILTIN_SKILLS: BuiltinSkillDef[] = RAW_BUILTINS.map((s) => ({
  id: s.id,
  name: s.name,
  get description() {
    return i18n._(s.descMsg)
  },
  smartContent: s.body,
  smartLength: s.body.length,
  fullContent: s.body,
  fullLength: s.body.length,
  refCount: 0,
  refs: [],
  isBuiltin: true,
}))
