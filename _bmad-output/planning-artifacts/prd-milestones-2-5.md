---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
classification:
  projectType: web_app
  domain: edtech
  complexity: medium
  projectContext: brownfield
  scope: milestone-2-focus
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/planning-artifacts/product-brief-tycs-2026-02-21.md'
  - 'content/milestones/01-kv-store/brief.md'
  - 'content/milestones/01-kv-store/acceptance-criteria.yaml'
  - 'content/milestones/01-kv-store/benchmark-config.yaml'
  - 'content/milestones/01-kv-store/starter-code/main.go'
  - 'content/milestones/01-kv-store/reference-impl/main.go'
  - 'content/milestones/01-kv-store/metadata.yaml'
  - 'content/milestones/02-storage-engine/brief.md'
  - 'content/milestones/03-btree-indexing/brief.md'
  - 'content/milestones/04-query-parser/brief.md'
  - 'content/milestones/05-transactions/brief.md'
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 0
  existingPrd: 1
  architecture: 1
  epics: 1
  projectContext: 1
  milestoneContent: 9
workflowType: 'prd'
---

# Product Requirements Document — Milestone 2: Storage Engine

**Author:** Ducdo
**Date:** 2026-03-18
**Scope:** Content authoring for Milestone 2 of the "Build Your Own Database" track

---

## Executive Summary

This PRD defines the content requirements for **Milestone 2: Storage Engine** of the "Build Your Own Database" track in mycscompanion. M2 replaces Milestone 1's naive full-rewrite persistence with a Write-Ahead Log (WAL), teaching learners crash recovery, append-only file formats, and durability guarantees through hands-on Go implementation.

This is a **content authoring** PRD — the platform is fully built (11 engineering epics shipped). The deliverables are curriculum artifacts: a learning brief, acceptance criteria, benchmarks, multi-file starter code, reference implementation, and visual assets, following the pattern established by Milestone 1. Key design decisions include a multi-file project structure (new precedent for M2+) and milestone chaining via M1's reference implementation rather than the learner's own code.

---

## Success Criteria

### User Success

- **Visceral moment:** Learner kills their process mid-write, restarts, and all committed data survives — *"My database just survived something that would have destroyed my M1 implementation"*
- **Performance narrative:** Benchmark jumps from M1's ~100 ops/sec to 1,000+ ops/sec — a visible 10x improvement
- **Emotional arc:** "My thing works → oh wait, it doesn't survive crashes → now it does AND it's 10x faster"
- **Real-world connection:** Learner understands that every "transaction committed" in PostgreSQL is a WAL promise

### Business Success

- M2 shipping expands the track from 1 to 2 milestones — prerequisite for the 3-month MVP gate (5 milestones live, 100 users, >40% completion)
- Establishes the multi-file milestone pattern that M3-5 will follow, accelerating subsequent content authoring
- Validates milestone chaining (building on previous work) — core to the mega-project spine thesis

### Technical Success

- Reference implementation passes all 10 core acceptance criteria + 1 stretch
- Starter code compiles with `go build .` out of the box (TODOs return nil/empty)
- Multi-file structure: `main.go` (harness) + `kv.go` (M1 working code) + `wal.go` (learner implements)
- Benchmark target of 1,000 ops/sec achievable with correct fsync-per-commit on Fly.io execution hardware
- Content CI validates compilation, criteria, and benchmarks automatically
- No platform changes required — execution service already handles multi-file `package main`

### Quality Gates (Definition of Done)

| Gate | Description |
|---|---|
| 1. Compilation | Starter code compiles with `go build .` — zero warnings |
| 2. Reference passes | Reference impl passes all 10 core criteria |
| 3. Benchmark verified | Reference impl hits 1,000 ops/sec on execution service hardware (not local dev) |
| 4. Founder dogfood | Ducdo completes M2 using only starter code + brief, no peeking at reference impl (budget: 2-4 hours) |
| 5. Content CI green | YAML validates against schemas, code compiles, criteria pass |

### Measurable Outcomes

| Metric | Target | Rationale |
|---|---|---|
| Acceptance criteria | 10 core + 1 stretch | Slight escalation from M1's 8, matching reduced scaffolding |
| Benchmark target | 1,000 ops/sec (sequential inserts) | 10x over M1, realistic with fsync on Fly.io hardware |
| Scaffold level | ~65-70% | Learner writes ~160 lines of the interesting parts (WAL format, recovery, compaction) |
| Files touched by learner | `wal.go` (primary) + `kv.go` (wiring) | Clear separation — learner's work is isolated |
| Dogfood completion time | 2-4 hours | Validates difficulty is appropriate for target audience |

---

## Product Scope

### MVP Deliverables

**Must-Have (ships or it's not done):**

| Deliverable | Description | Why Must-Have |
|---|---|---|
| `brief.md` | 7 sections: What Changed / Why / Building / Learn / How / Files / Constraints | Learner can't start without orientation and instruction |
| `acceptance-criteria.yaml` | 10 core + 1 stretch criteria per schema | Platform can't validate submissions without criteria |
| `benchmark-config.yaml` | Sequential inserts (1,000 ops/sec) + crash recovery replay | Performance narrative is core to product thesis |
| `starter-code/` | `main.go` + `kv.go` + `wal.go` + `go.mod` (~65-70% scaffold) | Learner needs the scaffold to begin |
| `reference-impl/` | Complete working implementation + `go.mod` | Content CI can't validate without it; dogfood answer key |
| `metadata.yaml` | csConceptLabel + stuckDetection (10 min threshold) | Stuck detection won't fire without threshold config |

**Nice-to-Have (enhances but not blocking):**

| Deliverable | Why It Can Wait |
|---|---|
| `assets/` (2 SVGs + manifest) | Helpful for visual learners but M2 can ship text-only initially |
| `partial-write-safety` (stretch criterion) | Stretch by definition — core criteria are sufficient |
| Dogfood friction log template | Can be created ad-hoc during dogfood; formalize for M3+ |

### Key Design Decisions

**Multi-file structure (new precedent for M2+):**

```
starter-code/
├── go.mod
├── main.go    # CLI harness, tests, benchmarks (given — don't modify)
├── kv.go      # Working KV store from M1 reference impl (given — learner wires WAL into it)
└── wal.go     # WAL struct + TODOs (learner implements)
```

**Milestone chaining uses reference implementation, not learner's own M1 code:**
- MVP ships with M1 reference impl as `kv.go` — the only approach without platform changes
- Brief frames this as educational: *"Seeing a different implementation of the same interface is itself a lesson"*
- **Known trade-off:** Dynamic milestone assembly from learner's own code is a future platform feature

**Familiarization criterion (`kv-baseline`):**
- First acceptance criterion runs M1's test suite against the provided `kv.go`
- Builds confidence that the foundation works before the learner touches anything
- Addresses the trust gap from using reference impl instead of learner's own code

### Acceptance Criteria

| # | Name | Assertion Type | Priority | Description |
|---|---|---|---|---|
| 1 | `kv-baseline` | stdout-contains | Core | M1 tests pass against provided kv.go — foundation verified |
| 2 | `wal-append` | stdout-contains | Core | Put writes a log entry to WAL file (not full rewrite) |
| 3 | `wal-format` | stdout-contains | Core | WAL entries contain operation type, key, and value |
| 4 | `delete-via-wal` | stdout-contains | Core | Delete appends a tombstone entry to WAL |
| 5 | `crash-recovery` | stdout-contains | Core | Kill after writes, reopen, all committed data present |
| 6 | `replay-ordering` | stdout-contains | Core | WAL replay applies entries in order (later overwrites earlier) |
| 7 | `compaction` | stdout-contains | Core | After compaction, WAL is reset and data file is clean |
| 8 | `post-compaction-reads` | stdout-contains | Core | All data accessible after compaction |
| 9 | `performance-improvement` | stdout-contains | Core | Sequential inserts significantly faster than M1 full-rewrite |
| 10 | `exit-clean` | exit-code-equals | Core | Program exits with code 0 |
| 11 | `partial-write-safety` | stdout-contains | Stretch | Incomplete WAL entry on crash doesn't corrupt store |

### Benchmark Configuration

| Benchmark | Workload | Target | Purpose |
|---|---|---|---|
| `sequential-inserts-wal` | 10,000 inserts, 16B keys, 64B values | 1,000 ops/sec | 10x improvement over M1's full-rewrite |
| `crash-recovery-replay` | Replay WAL with 10,000 entries | 50,000 ops/sec | Recovery performance measurement |

### Growth (Post-MVP)

- "How the Pros Did It" SQLite WAL comparison diff view (starts at M3 per main PRD)
- Tuned Socratic prompts specific to WAL/crash-recovery stuck patterns
- Dynamic milestone assembly from learner's own M1 code (platform feature)
- Formalized friction log template reusable across milestones

### Vision (Future)

- Multiple WAL strategies (LSM-tree variant, group commit)
- Tunable durability levels (fsync-per-write vs. periodic flush)
- Cross-milestone performance regression tracking (M2 benchmark as baseline for M3+)
- Multi-file precedent scales to M3 (`btree.go`), M4 (`parser.go`, `ast.go`), M5 (`txn.go`, `lock.go`)

### Risk Mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| WAL concepts too hard for ~65% scaffold | Medium | Dogfood gate catches this; can increase scaffold % before ship |
| Reference impl benchmark misses target on Fly.io | Low | Test on actual execution service early; adjust target if needed |
| Brief insufficient for cold-return learners | Medium | "What Changed" section + `kv.go` as refresher; dogfood validates |
| Multi-file structure confuses learners | Low | "File Structure" section in brief; `kv-baseline` builds confidence |
| M2 content delays M3 | None | Parallel authoring confirmed; no dependency |

---

## User Journeys

### Journey 1: Marcus (Knowledge Seeker) — M2 Success Path

Marcus finished M1 last week. He opens M2, sees three files: `main.go`, `kv.go`, `wal.go`. He scans `kv.go` — a clean KV store implementation, slightly different from his but same interface. The brief's "What Changed" section explains: *"Your M1 KV store rewrites the entire data file on every Put. It's slow (~100 ops/sec) and fragile — a crash mid-write corrupts your data file."*

He opens `wal.go`, sees the WAL struct with clear TODOs. He implements `appendToWAL` first — append-only writes feel natural after M1's serialization work. Two hours in, he runs the crash recovery test: writes data, simulates a crash, reopens. Everything's there. The benchmark shows 1,200 ops/sec — 12x faster than M1. He implements compaction, runs the full suite. All green.

**Capabilities revealed:** Brief must orient to multi-file structure; benchmark must show dramatic improvement; `kv-baseline` builds confidence.

### Journey 1b: Marcus — The Cold Return

Marcus finished M1 two weeks ago. He opens M2 — three files instead of one, momentarily disorienting. He reads `kv.go` — *"Oh right, length-prefix encoding, BigEndian."* The "What Changed" section reminds him what he built and why it's flawed. Within 5 minutes, he's re-oriented. The multi-file structure becomes a feature — `kv.go` is a built-in refresher.

**Capabilities revealed:** Multi-file structure doubles as re-entry aid; "What Changed" is critical for gap returns; brief must be self-sufficient for re-orientation.

### Journey 2: Jake (Eager Leveler) — The Stuck Moment

Jake finished M1 but struggled with binary serialization. He opens M2 and `kv.go` looks different from his code — the brief acknowledges this: *"Seeing a different implementation of the same interface is itself a lesson."* He runs `kv-baseline`, tests pass, foundation verified.

He starts `wal.go` but gets confused about the log entry format. After 10 minutes, stuck intervention fires. The AI tutor asks: *"In M1, how did you know where one key-value pair ended and the next began?"* He connects it to M1's length-prefix approach. Unstuck.

Stuck again on compaction. The brief explains: *"Think of compaction as creating a clean snapshot from your log — like squashing git commits."* The analogy clicks.

**Capabilities revealed:** TODO comments need clear guidance; stuck detection at 10 min; brief analogies should reference engineering concepts (git, etc.).

### Journey 3: Priya (Career Upgrader) — The Real-World Connection

Priya implements crash recovery and runs the crash test. It passes. She reads "Why This Matters": *"Every time you've seen 'transaction committed' in PostgreSQL, a WAL made that promise possible."*

Two days later in a design review, someone proposes event sourcing. The tech lead asks about durability guarantees. Priya answers from experience: *"You'll want a write-ahead log — append-only writes for speed, replay for recovery. The trade-off is log growth, so you compact periodically."* M2 delivered career value.

**Capabilities revealed:** "Why This Matters" must connect WAL to production systems; real-world framing drives retention and career applicability.

### Journey 4: Ducdo (Founder Dogfood) — Content Validation

Ducdo opens M2 cold, using only the brief and starter code. The friction log captures:

| Checkpoint | What to Record |
|---|---|
| First 5 minutes | Did multi-file structure make sense? Was "What Changed" sufficient? |
| `kv-baseline` test | Did running M1 tests first build confidence? |
| WAL format design | Were TODO comments sufficient to guide log entry format? |
| Crash recovery | Was the "aha" moment visceral? Did the test demonstrate survival clearly? |
| Compaction | Was the concept clear from brief, or would you need the AI tutor? |
| Benchmark run | Did 1,000+ ops/sec feel rewarding? Was M1 comparison clear? |
| Stretch criterion | Is `partial-write-safety` achievable without excessive hints? |
| Overall timing | Did completion fall within 2-4 hours? Where did time cluster? |

Issues feed back into brief revisions, TODO improvements, and error hint refinements before shipping.

**Capabilities revealed:** Friction log template is a required deliverable; dogfood is the last gate before Content CI.

### Journey Requirements Summary

| Journey | Primary Insight |
|---|---|
| Marcus (success) | Multi-file orientation + benchmark payoff are the core experience |
| Marcus (cold return) | Multi-file structure doubles as re-entry refresher; "What Changed" is critical |
| Jake (stuck) | TODO comments and brief analogies must unstick without AI tutor |
| Priya (real-world) | "Why This Matters" drives career value — the brief's most important section |
| Ducdo (dogfood) | Structured friction log validates content quality before shipping |

---

## Content Design Specifications

### Brief Structure

The M2 brief serves three jobs — orientation, motivation, and instruction:

| Section | Job | Description |
|---|---|---|
| 1. What Changed From Milestone 1 | Orientation | "Previously on..." — names the flaw M2 fixes |
| 2. Why This Matters | Motivation | Real-world WAL connection (PostgreSQL, cloud databases, event sourcing) |
| 3. What You're Building | Scope | WAL, crash recovery, compaction — clear deliverables |
| 4. What You'll Learn | CS Concepts | Append-only logs, fsync/durability, log-structured storage |
| 5. How This Works | Instruction | Step-by-step approach, which TODOs to tackle in order |
| 6. File Structure | Navigation | Explanation of `main.go` / `kv.go` / `wal.go` and which to touch |
| 7. Constraints | Boundaries | Go, stdlib only, single package |

Target length: 60-80 lines. Structure scales to M3-5.

### Dogfood Friction Log Template

A blank friction log template is a **required deliverable**. It ensures the founder dogfood quality gate (Gate #4) is structured and repeatable. See Journey 4 for checkpoint definitions.

---

## Technical Requirements

### Go Code Constraints

- Go 1.23, standard library only (`encoding/binary`, `os`, `io`, `fmt`, `sync`, `time`, `math/rand`, `strings`, `sort`, `encoding/json`, `flag`)
- Single `package main` across all files in starter-code/ and reference-impl/
- Must compile with `go build .` and run with `go run . test` and `go run . benchmark`
- No external dependencies — learners should not need `go mod tidy` beyond initial setup

### Schema Compliance

- `acceptance-criteria.yaml` validates against `content/schema/acceptance-criteria.schema.json`
- `benchmark-config.yaml` validates against `content/schema/benchmark-config.schema.json`
- `metadata.yaml` validates against `content/schema/milestone-metadata.schema.json`
- `assets/manifest.yaml` validates against `content/schema/concept-explainer-manifest.schema.json`

### Asset Requirements

- SVG concept explainers: dark-first design system compatible
- All SVGs have descriptive alt text in manifest.yaml
- 2 explainer diagrams for M2: `wal-append-flow.svg`, `crash-recovery-sequence.svg`

### Execution Service Compatibility

- Starter code produces meaningful output with TODOs unimplemented (compile, run, show failing tests)
- Reference impl passes all acceptance criteria via the Go execution harness on Fly.io
- Benchmark output emits JSON matching M1's format (`ops_per_sec`, `p50_latency_us`, `p99_latency_us`)

### MVP Strategy

**Approach:** Pattern-replication — M1 is the proven template, M2 replicates with new CS content.

**Resource:** Solo founder + AI-assisted content generation. No team dependency.

**Timeline:** M2 and M3 authored in parallel. No blocking dependency.

---

## Functional Requirements

### Brief & Learning Content

- **FR1:** Content author can create a milestone brief with 7 structured sections (What Changed, Why This Matters, What You're Building, What You'll Learn, How This Works, File Structure, Constraints)
- **FR2:** Learner can read the brief and understand what to build, why it matters, and which files to modify without external reference
- **FR3:** Learner returning after a break can re-orient using "What Changed" and `kv.go` within 5 minutes

### Acceptance Criteria

- **FR4:** Content author can define acceptance criteria as YAML following `acceptance-criteria.schema.json`
- **FR5:** Each criterion specifies name, order, description, assertion (type + expected + command_args), and error_hint
- **FR6:** Content CI can validate acceptance criteria YAML against the JSON schema
- **FR7:** Learner can run `go run . test` and see pass/fail output per criterion with diagnostic hints on failure
- **FR8:** The `kv-baseline` criterion validates the provided M1 code works before the learner modifies anything

### Benchmark Configuration

- **FR9:** Content author can define benchmark workloads as YAML following `benchmark-config.schema.json`
- **FR10:** Learner can run `go run . benchmark` and see performance metrics (ops/sec, latency) as JSON
- **FR11:** Benchmark results demonstrate measurable improvement over M1's baseline

### Starter Code

- **FR12:** Content author can create multi-file starter code (`main.go`, `kv.go`, `wal.go`) in single `package main`
- **FR13:** Starter code compiles and runs with `go build .` out of the box with TODOs unimplemented
- **FR14:** Starter code produces meaningful failing test output when run before implementation
- **FR15:** Learner can identify which functions to implement via clearly marked TODO sections with guiding comments
- **FR16:** `kv.go` contains a working M1 reference implementation the learner can read but doesn't need to modify (except WAL wiring)
- **FR17:** `wal.go` contains the WAL struct skeleton and TODO methods the learner implements

### Reference Implementation

- **FR18:** Content author can create a complete reference implementation passing all core acceptance criteria
- **FR19:** Reference implementation achieves 1,000 ops/sec on execution service hardware
- **FR20:** Reference implementation demonstrates correct fsync usage for durability

### Content Validation

- **FR21:** Content CI can compile starter code and reference implementation via `go build .`
- **FR22:** Content CI can run reference implementation against all acceptance criteria and verify all pass
- **FR23:** Content CI can run benchmark and verify target metrics are met
- **FR24:** Content CI can validate all YAML files against their JSON schemas

### Visual Assets

- **FR25:** Content author can create SVG concept explainer diagrams with alt text metadata
- **FR26:** Asset manifest references all SVGs with filename, altText, and title per schema

### Quality Validation

- **FR27:** Founder can complete M2 using only starter code and brief within 2-4 hours (dogfood gate)
- **FR28:** Founder can capture friction points using structured friction log with defined checkpoints

---

## Non-Functional Requirements

### Content Quality

- **NFR1:** Brief uses terminology consistent with standard CS references (*Database Internals* by Petrov, SQLite documentation) — no invented jargon
- **NFR2:** TODO comments are sufficient for a mid-level engineer to understand expected behavior without reading the brief
- **NFR3:** Error hints guide toward the solution without revealing the implementation (Socratic: hint, don't tell)
- **NFR4:** Scaffolding ratio stays within 60-70% — enough ownership, not overwhelming
- **NFR5:** Brief analogies reference concepts working engineers know (git, HTTP, file systems) — not academic abstractions

### Performance

- **NFR6:** Starter code compiles in under 2 seconds on execution service hardware
- **NFR7:** Reference implementation completes full test suite in under 5 seconds
- **NFR8:** Benchmark target (1,000 ops/sec) achievable on Fly.io hardware, not just local dev

### Accessibility

- **NFR9:** All SVG explainers include descriptive alt text conveying diagram meaning to screen readers
- **NFR10:** Brief maintains readability at technical-but-accessible level (short sections, clear headers)

### Integration

- **NFR11:** All YAML files validate against JSON schemas with zero errors
- **NFR12:** Go code follows M1's CLI harness pattern (`go run . test` / `go run . benchmark`) — no execution service contract changes
- **NFR13:** Benchmark JSON output matches platform format (`ops_per_sec`, `p50_latency_us`, `p99_latency_us`)
