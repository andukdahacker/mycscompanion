---
title: 'M2 Storage Engine Content Authoring'
slug: 'm2-storage-engine-content'
created: '2026-03-19'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Go 1.23', 'YAML', 'SVG', 'Markdown']
files_to_modify:
  - 'content/milestones/02-storage-engine/brief.md'
  - 'content/milestones/02-storage-engine/acceptance-criteria.yaml'
  - 'content/milestones/02-storage-engine/benchmark-config.yaml'
  - 'content/milestones/02-storage-engine/metadata.yaml'
  - 'content/milestones/02-storage-engine/starter-code/main.go'
  - 'content/milestones/02-storage-engine/starter-code/harness.go'
  - 'content/milestones/02-storage-engine/starter-code/kv.go'
  - 'content/milestones/02-storage-engine/starter-code/wal.go'
  - 'content/milestones/02-storage-engine/starter-code/go.mod'
  - 'content/milestones/02-storage-engine/reference-impl/main.go'
  - 'content/milestones/02-storage-engine/reference-impl/harness.go'
  - 'content/milestones/02-storage-engine/reference-impl/kv.go'
  - 'content/milestones/02-storage-engine/reference-impl/wal.go'
  - 'content/milestones/02-storage-engine/reference-impl/go.mod'
  - 'content/milestones/02-storage-engine/assets/manifest.yaml'
  - 'content/milestones/02-storage-engine/assets/wal-append-flow.svg'
  - 'content/milestones/02-storage-engine/assets/crash-recovery-sequence.svg'
code_patterns:
  - 'Go 1.23 stdlib only — encoding/binary, os, io, fmt, sync (hash/crc32 optional for stretch)'
  - 'Single package main across all files'
  - 'WAL record format: [op_type:1][key_len:4][val_len:4][key_bytes][val_bytes]'
  - 'Op types: 0x01=Put, 0x02=Delete (tombstone with val_len=0)'
  - 'M1 KVStore in kv.go as read-only reference'
  - 'WALStore in wal.go — learner implements append, replay, compaction'
  - 'File split: main.go (CLI dispatch ~30 lines) + harness.go (tests + benchmarks ~450 lines)'
  - 'harness.go: runTests prints PASS/FAIL per criterion, runBenchmark outputs JSON'
  - 'kv.go used by criterion 1 (kv-baseline) AND as read-only reference for learner'
  - 'editableFiles: [wal.go] — only file learner modifies'
test_patterns:
  - 'Acceptance criteria use stdout-contains with command_args: test'
  - 'Benchmarks use command_args: benchmark with JSON output'
  - 'Reference impl must pass all 10 core + 1 stretch criteria'
  - 'Reference impl must hit 1,000 ops/sec (sequential-inserts-wal) and 50,000 ops/sec (crash-recovery-replay)'
---

# Tech-Spec: M2 Storage Engine Content Authoring

**Created:** 2026-03-19

## Overview

### Problem Statement

Milestone 2 directory has placeholder content — brief says "coming soon", acceptance criteria is empty, starter-code and reference-impl directories are empty. Learners completing M1 hit a dead end. The multi-file execution pipeline (Epic 11) is shipped but has no M2 content to serve. This blocks the 3-month MVP gate (5 milestones live).

### Solution

Author complete M2 (Storage Engine) curriculum content. Multi-file project: `main.go` (read-only CLI dispatch), `harness.go` (read-only test/benchmark runner), `kv.go` (read-only M1 reference), `wal.go` (learner implements). Includes 7-section brief, 10 core + 1 stretch acceptance criteria, 2 benchmarks, ~65-70% scaffolded starter code, complete reference implementation, metadata with `editableFiles`, and 2 SVG concept explainers.

### Scope

**In Scope:**
- `brief.md` — 7-section curriculum brief (What Changed / Why / Building / Learn / How / Files / Constraints)
- `acceptance-criteria.yaml` — 10 core + 1 stretch criteria matching PRD spec
- `benchmark-config.yaml` — 2 benchmarks (sequential-inserts-wal, crash-recovery-replay)
- `metadata.yaml` — csConceptLabel, stuckDetection, editableFiles
- `starter-code/` — main.go (dispatch), harness.go (tests/benchmarks), kv.go (M1 reference), wal.go (TODOs), go.mod
- `reference-impl/` — complete working implementation of all files
- `assets/` — 2 SVGs (wal-append-flow, crash-recovery-sequence) + manifest.yaml
- All content must compile with `go build .`, reference impl must pass all criteria and hit benchmark targets

**Out of Scope:**
- Content CI pipeline changes (already supports multi-file via Epic 11)
- Platform code changes (execution pipeline, frontend, backend)
- M3-5 content authoring
- Dogfood friction log execution (separate activity after content ships)

## Context for Development

### Codebase Patterns

- **Go stdlib only**: encoding/binary, os, io, fmt, sync, time, math/rand, strings, sort, encoding/json, flag
- **Single `package main`** across all Go files in a milestone
- **M1 binary format**: `[key_len:4][key_bytes][val_len:4][val_bytes]` using `encoding/binary.BigEndian`
- **M2 WAL record format**: `[op_type:1][key_len:4][val_len:4][key_bytes][val_bytes]` — adds op-type tagging
- **Stretch goal — graceful truncation handling in replay**: Both starter and reference use the SAME base wire format (no CRC prefix). The stretch goal is about **error handling in replay**, not changing the format. Base `replayWAL()` treats non-EOF read errors as fatal (`return err`). Stretch `replayWAL()` catches `io.ErrUnexpectedEOF` and short reads, stopping replay gracefully (`break` instead of `return err`) — earlier valid entries are preserved. CRC32 is mentioned in the error_hint as an advanced approach the learner can optionally add, but it is NOT required to pass the stretch test. Simple truncation detection via short reads is sufficient.
- **Test harness pattern**: `runTests()` prints `PASS: criterion-name` / `FAIL: criterion-name` per criterion
- **Benchmark output**: JSON `{ "type": "benchmark_iteration", "target": "self", "iteration": 1, "total": 1, "ops_per_sec": N, "p50_latency_us": N, "p99_latency_us": N }`. Reference impl uses `flag.NewFlagSet()` for `-ops`, `-key-size`, `-value-size` CLI args. Starter code has simpler plain-text benchmark output.
- **Test output format**: `=== test-name ===` header, `PASS: test-name` / `FAIL: message`, final `=== done ===` marker
- **SVG assets**: 720x400 viewBox, color scheme: cyan (#22d3ee), green (#4ade80), red (#f87171), orange (#f59e0b), purple (#a78bfa). Arrow markers with custom IDs. Legend text at bottom.
- **Multi-file execution**: `editableFiles` in metadata.yaml controls which files the learner can edit. Backend merges read-only files from content with learner's editable files at execution time.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `content/milestones/01-kv-store/brief.md` | M1 brief — template for M2 brief structure |
| `content/milestones/01-kv-store/acceptance-criteria.yaml` | M1 criteria — format reference |
| `content/milestones/01-kv-store/benchmark-config.yaml` | M1 benchmark — format reference |
| `content/milestones/01-kv-store/metadata.yaml` | M1 metadata — format reference |
| `content/milestones/01-kv-store/starter-code/main.go` | M1 starter — harness pattern reference |
| `content/milestones/01-kv-store/reference-impl/main.go` | M1 reference impl — complete implementation reference |
| `content/schema/acceptance-criteria.schema.json` | YAML validation schema for criteria |
| `content/schema/benchmark-config.schema.json` | YAML validation schema for benchmarks |
| `content/schema/milestone-metadata.schema.json` | YAML validation schema for metadata |
| `content/schema/concept-explainer-manifest.schema.json` | YAML validation schema for asset manifest |
| `_bmad-output/planning-artifacts/prd-milestones-2-5.md` | PRD with M2 requirements, criteria, user journeys |
| `_bmad-output/project-context.md` | Project conventions and constraints |

### Technical Decisions

- **PRD refinement — `kv.go` is read-only, not editable**: The PRD mentions "learner wires WAL into kv.go," but this spec resolves that differently. `WALStore` is a standalone struct — it does not modify or extend `KVStore`. The learner builds `WALStore` independently in `wal.go`, seeing the contrast with `KVStore` in `kv.go`. This is a deliberate design choice: cleaner separation, no wiring confusion. `editableFiles` is `["wal.go"]` only. The PRD's wiring language is superseded by this spec. Specifically: PRD Measurable Outcomes table ("Files touched by learner: wal.go + kv.go"), PRD FR16 ("kv.go...learner can read but doesn't need to modify except WAL wiring"), and PRD file tree ("kv.go — given, learner wires WAL into it") are all superseded. The PRD file tree also omits `harness.go` which this spec adds as a new M2+ pattern.
- **kv.go is a copy of M1 reference impl**: Stripped of `main()`, `printUsage()`, `runTests()`, `runBenchmark()`, `percentileFloat()`, `randomString()`, and all imports only used by those functions. Keep ONLY: `KVStore` struct definition with all fields (`mu`, `data`, `filePath`, `file`), `NewKVStore()`, `Get()`, `Put()`, `Delete()`, `Close()`, `saveToDisk()`, `loadFromDisk()`, and their imports (`encoding/binary`, `fmt`, `io`, `os`, `sync`). Read-only but actively used by criterion 1 (`kv-baseline`) as a confidence-builder, and serves as a readable reference showing "the old way" for contrast.
- **File split — main.go + harness.go (new pattern for M2+, not in M1)**: M1 puts everything in a single `main.go`. M2 introduces a file split because multi-file milestones need to separate read-only harness code from learner-editable code. `main.go` is ~30 lines (CLI dispatch only). `harness.go` has all test functions + benchmark workload generators (~450 lines). Avoids `_test.go` suffix (Go excludes those from `go build .`). Both read-only. This is a new pattern — do NOT reference M1's single-file structure as a template for M2's file layout.
- **Crash-recovery test skips Close() — leaked fd is intentional and harmless**: Criterion 5 writes data then opens a NEW `WALStore` on the same file without calling `Close()` on the first. The first store's file descriptor is leaked. This is intentional: on Unix, two open fds to the same file is legal. Since `Put()`/`Delete()` call `walFile.Sync()` after every append, all data is on disk before the second store opens. The leaked fd is harmless for a single test — it does not interfere with the second store's operations. The test is deterministic because it depends only on Sync-per-write, not on fd lifecycle.
- **Compaction verified via correctness + strategic reopens**: No file size checks or exposed methods. Test: Put keys → Delete some → Compact() → Close → Reopen (replay) → verify data → Put new key → Close → Reopen again → verify new key + old keys survive. Catches fake compaction implementations.
- **WALStore in wal.go wraps KVStore concepts**: Learner builds `WALStore` with in-memory map + WAL file. `Put`/`Delete` append to WAL (not full rewrite). `Get` reads from memory. `replayWAL()` on startup. `Compact()` rewrites WAL with only live entries.
- **Learner does the wiring**: `wal.go` has TODOs for all WALStore methods. The learner implements append-only writes, replay logic, and compaction. This teaches integration thinking — not just implementing an algorithm but understanding why the architecture changed.
- **Record-based WAL format**: Different from M1's simple key-value serialization. Introduces op-type byte (Put=0x01, Delete=0x02), teaching structured record formats and tombstone patterns.
- **Stretch goal (partial-write-safety) — truncation detection, not CRC**: Both reference and starter use the same base format `[op:1][keyLen:4][valLen:4][key][value]`. No CRC in the wire format. The reference impl's `replayWAL()` handles `io.ErrUnexpectedEOF` gracefully — if a record is truncated (e.g., crash mid-write left partial bytes), it stops replay and returns nil (preserving all valid entries read so far). The starter's base `replayWAL()` returns the error (fatal). The stretch goal: the learner modifies `replayWAL()` to catch `io.ErrUnexpectedEOF` and break gracefully instead of erroring. CRC is mentioned in the error_hint as an optional advanced approach but is NOT required. **This means one `harness.go` works for both starter and reference — no format-awareness needed.**
- **Two benchmarks (supersedes PRD counts)**: The PRD specifies 10,000 inserts / 10,000 replay entries. This spec refines those to: (1) sequential-inserts-wal: 1,000 inserts, 1,000 ops/sec target — measures append throughput with per-entry fsync. (2) crash-recovery-replay: 50,000 entries, 50,000 ops/sec target — measures sequential read throughput. The PRD counts were initial estimates; these are calibrated for the benchmark to be meaningful (1K is enough to measure append perf; 50K exercises replay at scale).
- **Benchmark workload for crash-recovery-replay**: Pre-write 50,000 Put entries to WAL (untimed setup), close store. Run multiple replay iterations: each iteration copies the WAL file to a fresh path, times `NewWALStore()` which triggers `replayWAL()`, computes entries/second. Report `ops_per_sec` as the median entries/second across iterations. Set `p50_latency_us` and `p99_latency_us` to `0` for this benchmark — per-entry latency is not meaningful for a bulk replay operation. The JSON output still includes these fields (required by the platform schema) but they are zeroed.

## Implementation Plan

### Tasks

#### Phase 1: Reference Implementation (build the working solution first)

- [x] Task 1: Write reference `go.mod`
  - File: `content/milestones/02-storage-engine/reference-impl/go.mod`
  - Action: Create module file: `module tycs/storage-engine-reference` with `go 1.23`. Note: the execution service runs `go build -o main .`, so the module name does not affect the binary name in production. Locally, `go build .` produces a binary named after the module's last path element (`storage-engine-reference`), but this is only for local testing.

- [x] Task 2: Write reference `kv.go`
  - File: `content/milestones/02-storage-engine/reference-impl/kv.go`
  - Action: Copy M1 reference impl (`content/milestones/01-kv-store/reference-impl/main.go`) and strip ALL of the following: `main()`, `printUsage()`, `runTests()`, `runBenchmark()`, `percentileFloat()`, `randomString()`, and all imports only used by those functions (`encoding/json`, `flag`, `math`, `math/rand`, `sort`, `strings`, `time`). Keep ONLY: `KVStore` struct definition with all fields (`mu`, `data`, `filePath`, `file`), `NewKVStore()`, `Get()`, `Put()`, `Delete()`, `Close()`, `saveToDisk()`, `loadFromDisk()`, and their imports (`encoding/binary`, `fmt`, `io`, `os`, `sync`).
  - Notes: This file is identical in starter-code and reference-impl. Read-only in both.

- [x] Task 3: Write reference `wal.go`
  - File: `content/milestones/02-storage-engine/reference-impl/wal.go`
  - Action: Implement complete `WALStore` with:
    - **Struct**: `WALStore { mu sync.Mutex, data map[string]string, walPath string, walFile *os.File }`
    - **Constants**: `opPut byte = 0x01`, `opDelete byte = 0x02`
    - **`NewWALStore(walPath string) (*WALStore, error)`**: Open/create WAL file with `os.O_RDWR|os.O_CREATE|os.O_APPEND, 0644`. Call `replayWAL()` to rebuild in-memory state. Return store.
    - **`Get(key string) (string, bool)`**: Lock, read from `data` map.
    - **`Put(key, value string) error`**: Lock, update `data` map, call `appendEntry(opPut, key, value)`, call `walFile.Sync()`.
    - **`Delete(key string) error`**: Lock, delete from `data` map, call `appendEntry(opDelete, key, "")`, call `walFile.Sync()`.
    - **`appendEntry(op byte, key, value string) error`**: Write WAL record in base format: `[op:1 byte][keyLen:4 bytes BigEndian][valLen:4 bytes BigEndian][key bytes][value bytes]`. Use `binary.Write()` for op byte and lengths, `walFile.Write()` for key/value bytes. No CRC — same format as starter.
    - **`replayWAL() error`**: Seek to start. Loop reading records: read op byte, key length, key, value length, value. If `opPut`: set `data[key] = value`. If `opDelete`: delete `data[key]`. Break on `io.EOF`. **EOF handling:** check for `io.EOF` ONLY on the first read of each record (op byte) — this is the normal end-of-file condition. Any error on subsequent reads within a record (keyLen, valLen, key, value) — including `io.EOF` or `io.ErrUnexpectedEOF` — indicates a truncated record. **Base behavior:** return the error (fatal). **Stretch behavior:** break gracefully — return nil, preserving all valid entries read so far. This distinction is what makes the `partial-write-safety` test differentiate base from stretch implementations.
    - **`Compact() error`**: Lock mutex for the entire operation (`s.mu.Lock(); defer s.mu.Unlock()`). Create temp file (`walPath + ".tmp"`). Write one `opPut` record per live `data` entry directly to the temp file (do NOT use `appendEntry` — it writes to `s.walFile`, not the temp file; inline the binary write logic). Close temp file. Close current `walFile`. Rename temp over original (`os.Rename`). Reopen WAL file in append mode. Mutex must be held throughout to prevent concurrent Put/Delete from writing to the old file between close and reopen.
    - **`Close() error`**: Lock, sync, close file.
  - Notes: `walFile.Sync()` on every Put/Delete is critical — this is what makes the crash-recovery test pass. Without it, data only survives clean shutdowns.

- [x] Task 4: Write reference `harness.go`
  - File: `content/milestones/02-storage-engine/reference-impl/harness.go`
  - Action: Implement test runner + benchmark runner. Follow M1 patterns.
    - **`runTests()`**: 11 test functions (10 core + 1 stretch), each printing `PASS: criterion-name` or `FAIL: message`. Tests:
      1. `kv-baseline`: Create `KVStore`, Put/Get/Delete, verify. Uses `kv.go`.
      2. `wal-append`: Create `WALStore`, Put key, Get key, verify value returned.
      3. `wal-format`: Create `WALStore`, Put key="hi" value="there", close. Read raw WAL file bytes. Verify: byte 0 is `0x01` (opPut), bytes 1-4 are `uint32(2)` BigEndian (key length), bytes 5-8 are `uint32(5)` BigEndian (value length), bytes 9-10 are `"hi"`, bytes 11-15 are `"there"`. This validates the base format `[op:1][keyLen:4][valLen:4][key][value]`.
      4. `delete-via-wal`: Create `WALStore`, Put key, Delete key, Get key returns not-found.
      5. `crash-recovery`: Create `WALStore`, Put 3 keys. Do NOT call Close (skip it). Create NEW `WALStore` on same file. Verify all 3 keys survive via Get.
      6. `replay-ordering`: Create `WALStore`, Put key="x" value="first", Put key="x" value="second" (overwrite), Delete key="x", Put key="x" value="third". Close + reopen. Verify Get("x") == "third".
      7. `compaction`: Put keys A,B,C,D,E. Delete B,D. Compact(). Close. Reopen. Verify A,C,E present, B,D absent. Put F. Close. Reopen again. Verify A,C,E,F present, B,D absent.
      8. `post-compaction-reads`: Put 100 keys, delete 50 (even-numbered). Compact(). Verify all 50 odd keys readable, all 50 even keys absent.
      9. `performance-improvement`: Run 1,000 sequential Puts on `WALStore`, measure ops/sec. Assert > 500 ops/sec (sanity check — should be well above M1's ~100).
      10. `exit-clean`: (Implicitly tested — if runTests completes without os.Exit(1), exit code is 0.)
      11. `partial-write-safety` (stretch): Create `WALStore`, Put 3 keys. Close the store. Open the WAL file directly with `os.OpenFile(..., os.O_WRONLY|os.O_APPEND, ...)` and write 3 garbage bytes (simulating an incomplete record from a crash mid-write — 3 bytes ensures `io.ErrUnexpectedEOF` on the keyLen read since only 2 of 4 bytes are available). Close the raw file. Create new `WALStore` on the same path — its `replayWAL()` should read the 3 valid entries, then encounter the garbage tail (partial record causes `io.ErrUnexpectedEOF` or unexpected op byte), and stop replay gracefully without erroring. Verify all 3 keys present via Get. **Note:** This test only passes if the learner's `replayWAL()` catches `io.ErrUnexpectedEOF` and breaks gracefully. The base implementation returns the error, causing `NewWALStore` to fail.
    - **`runBenchmark()`**: Two benchmark modes dispatched by flag or second arg:
      - `sequential-inserts-wal`: Generate 1,000 keys (16-byte keys, 64-byte values). Time all Puts. Output JSON with `ops_per_sec`, `p50_latency_us`, `p99_latency_us`. Use `flag.NewFlagSet("benchmark", ...)` for `-ops`, `-key-size`, `-value-size`.
      - `crash-recovery-replay`: Pre-write 50,000 Put entries to WAL via `WALStore`. Close store. Time `NewWALStore()` on same file (triggers replayWAL). Compute entries/second. Output JSON.
    - **Output format**: Same JSON structure as M1 reference: `{ "type": "benchmark_iteration", "target": "self", "iteration": 1, "total": 1, "ops_per_sec": N, "p50_latency_us": N, "p99_latency_us": N }`
    - **Cleanup**: `defer os.Remove()` at top. Explicit removes between tests. Each test uses unique filenames (e.g., `test_kv_baseline.db`, `test_wal_append.db`).

- [x] Task 5: Write reference `main.go`
  - File: `content/milestones/02-storage-engine/reference-impl/main.go`
  - Action: Minimal CLI dispatch (~30 lines). `os.Args[1]` switch: `"test"` → `runTests()`, `"benchmark"` → `runBenchmark()`. Print usage and exit(1) on unknown command. Same pattern as M1.

- [x] Task 6: Verify reference impl compiles and runs
  - Action: `cd content/milestones/02-storage-engine/reference-impl && go build .` must succeed. `./storage-engine-reference test` must print `PASS` for all 11 criteria. `./storage-engine-reference benchmark` must produce valid JSON.
  - Notes: This is the validation gate before authoring starter code. If reference impl doesn't work, nothing else matters.

#### Phase 2: Starter Code (scaffold from reference)

- [x] Task 7: Create starter `go.mod`
  - File: `content/milestones/02-storage-engine/starter-code/go.mod`
  - Action: `module tycs/storage-engine-starter` with `go 1.23`

- [x] Task 8: Create starter `kv.go`
  - File: `content/milestones/02-storage-engine/starter-code/kv.go`
  - Action: Identical to reference `kv.go` (Task 2). Same file, read-only.

- [x] Task 9: Create starter `wal.go` with TODOs
  - File: `content/milestones/02-storage-engine/starter-code/wal.go`
  - Action: Scaffold `WALStore` at ~65-70% completion. Include:
    - **Complete (no TODOs)**: Package declaration, imports, constants (`opPut`, `opDelete`), `WALStore` struct definition, `Close()` method.
    - **Scaffolded with TODOs**:
      - `NewWALStore()`: File opening provided. TODO: call `replayWAL()`.
      - `Get()`: Locking provided. TODO: read from data map and return.
      - `Put()`: Locking + `data[key] = value` provided. TODO: call `appendEntry(opPut, key, value)` and `walFile.Sync()`.
      - `Delete()`: Locking + `delete(s.data, key)` provided. TODO: call `appendEntry(opDelete, key, "")` and `walFile.Sync()`.
      - `appendEntry()`: Signature provided. TODO: write op byte, key length, key bytes, value length, value bytes using `binary.Write()`.
      - `replayWAL()`: Seek-to-start provided. TODO: loop reading records — read op byte, key len, key, val len, val. Apply Put/Delete to `data` map. Handle `io.EOF`. **Base version returns error on unexpected read failures.** Stretch goal: catch `io.ErrUnexpectedEOF` and break gracefully instead of erroring (one-line change — `break` instead of `return err`).
      - `Compact()`: Temp file creation provided. TODO: iterate `data` map, write `opPut` record per entry. Close temp, close current, rename, reopen.
    - **Hints in TODOs**: Each TODO has a 1-2 line comment hinting at the approach. Example: `// TODO: Write the operation type byte, then key length (4 bytes, BigEndian), then key bytes, then value length, then value bytes.`
  - Notes: The scaffold ratio means ~65-70% of lines are provided (struct, imports, method signatures, locking, some logic). ~30-35% is TODO implementation.

- [x] Task 10: Create starter `harness.go`
  - File: `content/milestones/02-storage-engine/starter-code/harness.go`
  - Action: Identical to reference `harness.go` (Task 4). All tests + benchmarks provided. Read-only.
  - Notes: Starter `harness.go` may have simpler benchmark output (plain text) matching M1 starter pattern, while reference has JSON output. Decision: keep both identical with JSON output since the platform's benchmark evaluation expects JSON.

- [x] Task 11: Create starter `main.go`
  - File: `content/milestones/02-storage-engine/starter-code/main.go`
  - Action: Identical to reference `main.go` (Task 5). Read-only.

- [x] Task 12: Verify starter code compiles
  - Action: `cd content/milestones/02-storage-engine/starter-code && go build .` must succeed. The program should compile even though TODOs in `wal.go` mean tests will fail. Scaffold must be syntactically valid Go — no `// TODO` inside function bodies that break compilation. Use empty returns for TODO methods: `return "", false` for Get, `return nil` for error-returning methods.

#### Phase 3: Curriculum Content (brief, criteria, benchmarks, metadata)

- [x] Task 13: Write `brief.md`
  - File: `content/milestones/02-storage-engine/brief.md`
  - Action: 7-section brief following PRD requirements:
    1. **What Changed Since Milestone 1**: Explain M1's full-rewrite flaw. "Every Put rewrote the entire file. With 10,000 keys, that's 10,000 full rewrites." Set up why WAL is needed.
    2. **Why This Matters**: PostgreSQL WAL, SQLite WAL mode, cloud database durability. Every transaction in a real database starts with a WAL write.
    3. **What You're Building**: WALStore with append-only log, crash recovery via replay, compaction to reclaim space.
    4. **What You'll Learn**: Write-ahead logging, append-only file formats, crash recovery, tombstones, compaction (analogous to git squash), trade-off between write amplification and read performance.
    5. **How This Works**: WAL record format diagram reference. Append flow. Replay on startup. Compaction = rewrite WAL with only live entries.
    6. **Your Files**: Explain multi-file structure. `kv.go` = M1 reference (read-only, used by first test). `wal.go` = your implementation. `harness.go` = tests that exercise your code. `main.go` = entry point.
    7. **Constraints**: Go stdlib only. Single `package main`. `wal.go` is the only file you edit.
  - Notes: Tone: conversational, not textbook. Use concrete numbers. Reference real-world systems. ~60-80 lines.

- [x] Task 14: Write `acceptance-criteria.yaml`
  - File: `content/milestones/02-storage-engine/acceptance-criteria.yaml`
  - Action: 11 criteria matching PRD + harness tests. **Content convention: all criteria MUST include `description` and `error_hint` fields** (even though the schema marks them optional) for learner experience quality:
    ```yaml
    milestone: 02-storage-engine
    criteria:
      - name: kv-baseline
        order: 1
        description: M1 KVStore tests pass against provided kv.go reference.
        assertion:
          type: stdout-contains
          expected: "PASS: kv-baseline"
          command_args: test
        error_hint: >
          This test uses the provided kv.go (M1 reference). If it fails,
          something may have changed in kv.go. It should be untouched.

      - name: wal-append
        order: 2
        description: Put writes a log entry and Get retrieves it.
        assertion:
          type: stdout-contains
          expected: "PASS: wal-append"
          command_args: test
        error_hint: >
          Check that Put stores the key in the data map AND calls
          appendEntry to write the WAL record.

      - name: wal-format
        order: 3
        description: WAL entries use the correct binary record format.
        assertion:
          type: stdout-contains
          expected: "PASS: wal-format"
          command_args: test
        error_hint: >
          The WAL record format is: [op_type:1 byte][key_len:4 bytes][val_len:4 bytes][key bytes][value bytes].
          Check that you're writing the op byte first, then lengths as BigEndian uint32.

      - name: delete-via-wal
        order: 4
        description: Delete appends a tombstone entry to the WAL.
        assertion:
          type: stdout-contains
          expected: "PASS: delete-via-wal"
          command_args: test
        error_hint: >
          Delete should remove the key from the in-memory map AND append
          a WAL entry with opDelete (0x02). The value can be empty.

      - name: crash-recovery
        order: 5
        description: Data survives unclean shutdown via WAL replay.
        assertion:
          type: stdout-contains
          expected: "PASS: crash-recovery"
          command_args: test
        error_hint: >
          This test does NOT call Close() before reopening the store.
          Your Put/Delete must call walFile.Sync() after every append
          so data reaches disk immediately, not just on close.

      - name: replay-ordering
        order: 6
        description: WAL replay applies entries in chronological order.
        assertion:
          type: stdout-contains
          expected: "PASS: replay-ordering"
          command_args: test
        error_hint: >
          Replay must process entries from start to end. If the same key
          is written multiple times, the last write wins. If it's deleted
          then re-written, the final value should be present.

      - name: compaction
        order: 7
        description: Post-compaction, WAL is reset and data remains correct.
        assertion:
          type: stdout-contains
          expected: "PASS: compaction"
          command_args: test
        error_hint: >
          Compact should create a new WAL containing only live entries
          (one Put per key in the data map). After compaction, closing
          and reopening the store should recover all live data. New writes
          after compaction should also survive a reopen.

      - name: post-compaction-reads
        order: 8
        description: All data accessible after compaction with many keys.
        assertion:
          type: stdout-contains
          expected: "PASS: post-compaction-reads"
          command_args: test
        error_hint: >
          This test puts 100 keys, deletes 50, compacts, then verifies
          the remaining 50 are still readable and the deleted 50 are gone.

      - name: performance-improvement
        order: 9
        description: Sequential inserts significantly faster than M1 approach.
        assertion:
          type: stdout-contains
          expected: "PASS: performance-improvement"
          command_args: test
        error_hint: >
          WAL append should be much faster than M1's full rewrite.
          If your ops/sec is below 500, check that you're appending
          to the file (not rewriting it) and not calling Sync too often
          in the wrong place.

      - name: exit-clean
        order: 10
        description: Program exits with code 0 after all tests pass.
        assertion:
          type: exit-code-equals
          expected: 0  # Must be bare integer 0, NOT quoted string "0"
          command_args: test
        error_hint: >
          If any test calls os.Exit(1) or panics, the exit code will be
          non-zero. Check that all previous tests pass without crashing.

      - name: partial-write-safety
        order: 11
        description: Incomplete WAL entry at tail does not corrupt store (stretch).
        assertion:
          type: stdout-contains
          expected: "PASS: partial-write-safety"
          command_args: test
        error_hint: >
          Your replayWAL must handle truncated records gracefully. When
          io.ReadFull or binary.Read returns io.ErrUnexpectedEOF, stop
          replay (break) instead of returning an error. Earlier valid
          entries are safe. Advanced: use hash/crc32 to checksum records
          for even stronger corruption detection.
    ```

- [x] Task 15: Write `benchmark-config.yaml`
  - File: `content/milestones/02-storage-engine/benchmark-config.yaml`
  - Action:
    ```yaml
    milestone: 02-storage-engine
    benchmarks:
      - name: sequential-inserts-wal
        description: >
          Sequential insertion of 1,000 key-value pairs via WAL append.
          Measures write throughput with per-entry fsync for durability.
          Target: 10x improvement over M1's full-rewrite approach.
        warmup_iterations: 2
        measured_iterations: 10
        workload:
          type: inserts
          num_operations: 1000
          key_size_bytes: 16
          value_size_bytes: 64
        target_metrics:
          ops_per_sec: 1000
        reference_version: milestone-2-v1

      - name: crash-recovery-replay
        description: >
          Replay 50,000 WAL entries on store startup. Measures sequential
          read throughput of the binary WAL format. Validates replay
          implementation is not accidentally quadratic.
        warmup_iterations: 1
        measured_iterations: 5
        workload:
          type: inserts  # Describes the SETUP phase (pre-writing entries). The measured phase is replay (reads). Schema has no "replay" enum.
          num_operations: 50000
          key_size_bytes: 16
          value_size_bytes: 64
        target_metrics:
          ops_per_sec: 50000
        reference_version: milestone-2-v1
    ```

- [x] Task 16: Update `metadata.yaml`
  - File: `content/milestones/02-storage-engine/metadata.yaml`
  - Action:
    ```yaml
    csConceptLabel: "Storage Engines & Durability"
    stuckDetection:
      thresholdMinutes: 10
      stage2OffsetSeconds: 60
    editableFiles:
      - "wal.go"
    ```

#### Phase 4: SVG Assets

- [x] Task 17: Create `wal-append-flow.svg`
  - File: `content/milestones/02-storage-engine/assets/wal-append-flow.svg`
  - Action: Diagram showing the WAL append flow:
    - Left: "Application" box with `Put("name", "Alice")` call
    - Center: "WAL File" showing sequential append of records: `[PUT|4|5|name|Alice]`, `[PUT|3|3|age|30]`, `[DEL|4|0|name|]`
    - Right: "In-Memory Map" showing current state after replay
    - Arrows: Put → append to WAL → update map (two arrows from Put)
    - Legend: "Append-only: new entries always added to the end. Never overwrite."
    - Follow M1 SVG patterns: 720x400 viewBox, cyan/green/orange color scheme, arrow markers.

- [x] Task 18: Create `crash-recovery-sequence.svg`
  - File: `content/milestones/02-storage-engine/assets/crash-recovery-sequence.svg`
  - Action: Sequence diagram showing crash recovery:
    - Timeline with 4 phases: (1) Normal Writes → (2) Crash! → (3) Restart → (4) Replay
    - Phase 1: Shows Puts going to WAL + memory (green arrows)
    - Phase 2: Red X — memory lost, WAL on disk survives (red/orange)
    - Phase 3: New process starts, empty memory
    - Phase 4: WAL replayed entry-by-entry into fresh memory map (purple arrows)
    - Key insight label: "Memory is volatile. The WAL is the source of truth."
    - Follow M1 SVG patterns: 720x400 viewBox, color scheme.

- [x] Task 19: Create `assets/manifest.yaml`
  - File: `content/milestones/02-storage-engine/assets/manifest.yaml`
  - Action:
    ```yaml
    - filename: wal-append-flow.svg
      altText: "Diagram showing how Put and Delete operations append binary records to the write-ahead log file"
      title: "WAL Append Flow"
    - filename: crash-recovery-sequence.svg
      altText: "Sequence diagram showing how data survives a crash through WAL replay on startup"
      title: "Crash Recovery Sequence"
    ```

#### Phase 5: Validation

- [x] Task 20: Compile and run reference impl
  - Action: In `reference-impl/` directory: `go build .` → must compile. `./storage-engine-reference test` → all 11 PASS. `./storage-engine-reference benchmark` → valid JSON with ops_per_sec above targets.

- [x] Task 21: Compile starter code
  - Action: In `starter-code/` directory: `go build .` → must compile. `./storage-engine-starter test` → criterion 1 (kv-baseline) should PASS, others may FAIL (TODOs). Program should not crash/panic.

- [x] Task 22: Validate YAML against schemas
  - Action: Validate `acceptance-criteria.yaml` against `content/schema/acceptance-criteria.schema.json`. Validate `benchmark-config.yaml` against `content/schema/benchmark-config.schema.json`. Validate `metadata.yaml` against `content/schema/milestone-metadata.schema.json`. Validate `assets/manifest.yaml` against `content/schema/concept-explainer-manifest.schema.json`. All must pass.

### Acceptance Criteria

- [x] AC 1: Given the reference implementation files, when `go build .` is run in `reference-impl/`, then compilation succeeds with zero errors.
- [x] AC 2: Given the reference implementation, when `./binary test` is run, then all 11 criteria print `PASS` and exit code is 0.
- [x] AC 3: Given the reference implementation, when `./binary benchmark` is run for sequential-inserts-wal, then `ops_per_sec` exceeds 1,000.
- [x] AC 4: Given the reference implementation, when `./binary benchmark` is run for crash-recovery-replay, then `ops_per_sec` exceeds 50,000.
- [x] AC 5: Given the starter code files, when `go build .` is run in `starter-code/`, then compilation succeeds with zero errors (TODOs use valid placeholder returns).
- [x] AC 6: Given the starter code, when `./binary test` is run, then criterion `kv-baseline` prints `PASS` (kv.go is complete) and the program does not panic.
- [x] AC 7: Given `acceptance-criteria.yaml`, when validated against the JSON schema, then validation passes with 11 criteria entries.
- [x] AC 8: Given `benchmark-config.yaml`, when validated against the JSON schema, then validation passes with 2 benchmark entries.
- [x] AC 9: Given `metadata.yaml`, when validated against the JSON schema, then validation passes and `editableFiles` contains exactly `["wal.go"]`.
- [x] AC 10: Given the `brief.md`, when read by a learner, then it contains all 7 sections (What Changed, Why, Building, Learn, How, Files, Constraints) with no placeholder text.
- [x] AC 11: Given the WAL format test (criterion `wal-format`), when the reference impl's WAL file is read raw, then byte 0 is `0x01` (opPut), bytes 1-4 are the key length as BigEndian uint32, followed by key bytes, then value length, then value bytes — matching the base format `[op:1][keyLen:4][valLen:4][key][value]` with no CRC prefix.
- [x] AC 12: Given the crash-recovery test (criterion `crash-recovery`), when the store is abandoned without `Close()` and reopened, then all previously written keys are recovered.
- [x] AC 13: Given the compaction test (criterion `compaction`), when data is written after compaction and the store is reopened twice, then both pre-compaction live data and post-compaction new data survive.
- [x] AC 14: Given both SVG files, when loaded in a browser, then they render correctly with the project's color scheme and contain accessible alt text in the manifest.

## Additional Context

### Dependencies

- **No external dependencies.** Go stdlib only.
- **Multi-file execution pipeline** (Epic 11) must be deployed — already shipped.
- **M1 reference implementation** (`content/milestones/01-kv-store/reference-impl/main.go`) is the source for `kv.go`. Any bugs found in M1's reference impl during M2 authoring should be fixed in M1 first.
- **Milestone 2 metadata must already exist in database** — the seed script includes it. Verify prod has been seeded.

### Testing Strategy

- **Reference impl is the primary test**: If the reference impl passes all criteria and hits benchmark targets, the content is correct. Run locally before committing.
- **Starter code compilation check**: `go build .` in starter-code directory. Must not panic when run with `test` arg (TODOs return zero values, not panics).
- **YAML schema validation**: Use a JSON Schema validator (e.g., `ajv` or online tool) to check all YAML files against their schemas before committing.
- **Manual SVG review**: Open SVGs in browser to verify rendering, readability, and color consistency.
- **Dogfood validation**: After deployment, Ducdo completes M2 using only the brief + starter code (no peeking at reference impl). Target: 2-4 hours. Record friction log.

### Notes

- **High risk — benchmark targets**: The 1,000 ops/sec (inserts with fsync) and 50,000 ops/sec (replay) targets are estimates. Fsync latency on Fly.io shared VMs can range from 0.1ms to 10ms, which means insert throughput could be anywhere from 100 to 10,000 ops/sec. **Must validate on actual Fly.io hardware in Task 20 before committing.** If the 1,000 ops/sec target is unreachable with per-entry fsync, options: (a) lower the target to 500 ops/sec, (b) batch syncs (sync every N writes), or (c) accept slower ops/sec and update criterion 9's threshold accordingly. The `performance-improvement` test (criterion 9) uses 500 ops/sec as its threshold — this is intentionally lower than the benchmark target to account for hardware variance.
- **Medium risk — starter scaffold ratio**: 65-70% scaffold is a design target. Too much scaffold = learner copies without understanding. Too little = learner gets stuck on boilerplate instead of concepts. Dogfood will calibrate.
- **Medium risk — crash-recovery test without Close()**: The test leaks a file descriptor intentionally. This is harmless for a single test on Unix (two fds to the same file is legal). The test relies on `walFile.Sync()` being called in `Put()`/`Delete()`. If the learner forgets `Sync()`, data loss is the teaching moment — the error hint explicitly calls this out.
- **Low risk — kv.go naming conflicts**: `KVStore` and `WALStore` are distinct type names. Both in `package main`. No method name conflicts since they're on different receiver types. Go handles this cleanly.
- **Stretch goal (partial-write-safety)**: This is intentionally harder. The learner must modify `replayWAL()` to catch `io.ErrUnexpectedEOF` and break gracefully instead of returning an error. This is a one-line change conceptually but requires understanding why truncated records happen and what "graceful degradation" means in a storage engine. CRC32 checksumming is an optional advanced approach mentioned in the error_hint but NOT required — simple truncation detection is sufficient. Not required for milestone completion.
- **Future**: This content pattern (multi-file, harness + editable file, read-only reference) establishes the template for M3-5. B-tree, query parser, and transactions will follow the same structure.
