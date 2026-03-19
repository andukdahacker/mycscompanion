---
title: 'Multi-File Execution Support'
slug: 'multi-file-execution'
created: '2026-03-18'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Go 1.23', 'TypeScript', 'Fastify', 'Kysely', 'React 19', 'Zustand', 'TanStack Query']
files_to_modify:
  # Go execution server
  - 'infra/fly-execution/server/main.go'
  - 'infra/fly-execution/server/executor.go'
  # Execution client package
  - 'packages/execution/src/execution-service-client.ts'
  # Backend - content loader
  - 'apps/backend/src/plugins/curriculum/content-loader.ts'
  # Backend - execution
  - 'apps/backend/src/plugins/execution/routes/submit.ts'
  - 'apps/backend/src/worker/processors/execution-processor.ts'
  - 'apps/backend/src/shared/queue.ts'
  # Backend - progress/snapshots
  - 'apps/backend/src/plugins/progress/routes/auto-save.ts'
  - 'apps/backend/src/plugins/progress/routes/latest-snapshot.ts'
  - 'apps/backend/src/plugins/progress/routes/resume.ts'
  # Backend - tutor (null-code safety)
  - 'apps/backend/src/plugins/tutor/services/context-helpers.ts'
  - 'apps/backend/src/plugins/tutor/services/stuck-context-assembler.ts'
  # Backend - curriculum API
  - 'apps/backend/src/plugins/curriculum/routes/'
  # Database migration (new)
  - 'apps/backend/migrations/NEW_multi_file_support.ts'
  # Deployment
  - 'infra/fly-execution/Dockerfile'
  # Frontend
  - 'apps/webapp/src/stores/editor-store.ts'
  - 'apps/webapp/src/hooks/use-auto-save.ts'
  - 'apps/webapp/src/hooks/use-submit-code.ts'
  - 'apps/webapp/src/hooks/use-workspace-data.ts'
  - 'apps/webapp/src/components/workspace/CodeEditor.tsx'
  # Shared types
  - 'packages/shared/src/types/curriculum.ts'
  - 'packages/shared/src/types/api.ts'
  # Content schema
  - 'content/schema/milestone-metadata.schema.json'
code_patterns:
  - 'Fastify plugin isolation: imports only from shared/ and packages/*'
  - 'DB→API conversion: toCamelCase() on all route responses'
  - 'Editor store: Zustand (useEditorStore) — exactly 2 stores rule'
  - 'Auto-save: 30s debounce, append-only code_snapshots'
  - 'Submission flow: POST submit → BullMQ job → Go execution → SSE stream'
  - 'Content loader: filesystem reads from content/milestones/{slug}/'
  - 'Go server: base64 decode → tmpdir → go build -o main . → ./main [args]'
test_patterns:
  - 'Backend routes: fastify.inject() — never supertest'
  - 'Mocks: vi.fn(), vi.mock() — never jest'
  - 'DB tests: real PostgreSQL, Kysely transaction per test, rollback in afterEach'
  - 'External services: msw v2 for HTTP, mock factories from @mycscompanion/config/test-utils'
---

# Tech-Spec: Multi-File Execution Support

**Created:** 2026-03-18

## Overview

### Problem Statement

The execution pipeline (Go server, backend processor, frontend editor) is hardcoded for single-file Go programs. M2+ milestones require multi-file projects (`main.go` + `kv.go` + `wal.go`). Without multi-file support, M2 content cannot be authored or executed on the platform. This blocks the 3-month MVP gate (5 milestones live).

### Solution

Extend the execution pipeline end-to-end to support multi-file Go projects. The `code` field (single string) becomes a `files` field (`Record<string, string>`) across all layers: frontend editor, submission API, database, execution processor, and Go execution server. Backward-compatible with M1's single-file approach.

### Scope

**In Scope:**
- Go execution server: accept and write multiple files to tmpdir with filename sanitization
- Execution service client: new `files` request field
- Content loader: read all files from `starter-code/` and `reference-impl/` directories, extend cache shape
- Curriculum API: return starter files as `Record<string, string>` + `editableFiles` from metadata
- Submission API: accept `files` field alongside existing `code` field
- Database migration: add `files` JSONB column to `submissions` and `code_snapshots`, relax `code` NOT NULL
- Execution processor: assemble full project (editable + read-only files), send to Go server; early-branch on `files` vs `code` before any `Buffer` operations
- Benchmark refactor: replace Go harness template with two `/execute` calls + TypeScript comparison, update `RunBenchmarkFn` signature
- Frontend editor store: multi-file state with active file selection
- Frontend file tabs UI: tab bar with read-only indicators
- Auto-save + resume: multi-file JSON storage and restoration with content-hash dirty checking
- Metadata schema: `editableFiles` field in `milestone-metadata.schema.json`
- Resume endpoint: include `files` column in snapshot query

**Out of Scope:**
- M2 content authoring (separate tech spec, depends on this one)
- Per-file diff/history view
- File creation/deletion by learner (files are defined by milestone content)
- Syntax-aware file dependency resolution
- Dynamic milestone assembly from learner's own code
- External benchmark iteration layer (binary's internal 10-iteration median is sufficient)

## Context for Development

### Codebase Patterns

**Go Execution Server** (`infra/fly-execution/server/`):
- `executor.go:88-100`: Currently base64-decodes single `req.Code` → writes as `main.go`
- `executor.go:109-112`: Hardcodes `go.mod` as `module workspace\n\ngo 1.23\n`
- `executor.go:126`: Compiles with `go build -o main .` — already handles all `.go` files in directory
- `main.go`: `ExecuteRequest` struct has `Code string` field

**Execution Client** (`packages/execution/src/execution-service-client.ts`):
- `ExecuteRequest = { code: string, args: string[], timeoutSeconds: number }`
- Sends JSON to `POST /execute` on Go server

**Content Loader** (`apps/backend/src/plugins/curriculum/content-loader.ts`):
- `loadStarterCode()` → hardcoded `readFile(..., 'starter-code', 'main.go')`
- `getStarterCodePath()` → returns directory path string or null
- `CachedMilestoneContent` (line 59-67) does NOT include `starterFiles` or `referenceFiles`
- Cache TTL is ~1 hour (line 112) — stale entries after content deploy will lack new fields
- Need to change to read ALL `.go` files + `go.mod` from the directory

**Execution Processor** (`apps/backend/src/worker/processors/execution-processor.ts`):
- Line 378: `Buffer.byteLength(code)` — **crashes if `code` is null** (multi-file submissions set `code` to null)
- Line 428: `Buffer.from(code).toString('base64')` — **also crashes if `code` is null**
- Lines 430-433: Sends `{ code: base64Code, args, timeoutSeconds }`
- Lines 58-297: `runBenchmarkOnService()` generates Go harness embedding user+ref code as single `main.go` each — **to be deleted and replaced**
- Lines 28-39: `RunBenchmarkFn` type takes `code: string`, `referenceMainGo: string`, `referenceGoMod: string` — **must be updated for multi-file**
- Lines 547-553: Callsite constructs benchmark args with single-file params — **must be updated**
- Line 522-527: Loads reference impl as single `main.go` + `go.mod`

**Submit API** (`apps/backend/src/plugins/execution/routes/submit.ts`):
- Request body: `{ milestoneId: string, code: string }`
- Has `additionalProperties: false` in JSON Schema (line 19) — **rejects unknown fields**
- Stores `code` in `submissions` table
- Fire-and-forget snapshot creation

**Auto-Save API** (`apps/backend/src/plugins/progress/routes/auto-save.ts`):
- Has `additionalProperties: false` in JSON Schema (line 23) — **rejects unknown fields**

**Resume API** (`apps/backend/src/plugins/progress/routes/resume.ts`):
- Line 26: hard-selects only `['id', 'code', 'created_at']` from `code_snapshots` — **missing `files` column, will silently lose multi-file snapshots**

**Database** (migrations 004 + 006):
- `submissions.code: text NOT NULL` — single string, **NOT NULL constraint must be relaxed for multi-file**
- `code_snapshots.code: text NOT NULL` — single string, **NOT NULL constraint must be relaxed for multi-file**

**Frontend Editor** (`apps/webapp/src/`):
- `stores/editor-store.ts`: `content: string` — single file, no file concept
- `hooks/use-auto-save.ts`: sends `{ milestoneId, code }` — single string; dirty check via `code !== lastSavedCodeRef.current` (reference comparison)
- `hooks/use-submit-code.ts`: sends `{ milestoneId, code }` — single string
- `hooks/use-workspace-data.ts`: loads `starterCode: string`, `latestSnapshot.code: string`
- `components/workspace/CodeEditor.tsx`: single Monaco instance, `defaultValue={initialContent}`

**Key constraint from project-context.md:**
- Exactly 2 Zustand stores (`useWorkspaceUIStore`, `useEditorStore`) — do NOT create a third
- File tab state goes in `useEditorStore` (extends existing store)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `infra/fly-execution/server/executor.go` | Go execution — file writing + compilation |
| `infra/fly-execution/server/main.go` | Go HTTP handler + request types |
| `packages/execution/src/execution-service-client.ts` | TS client for Go server |
| `apps/backend/src/plugins/curriculum/content-loader.ts` | Reads milestone content from filesystem |
| `apps/backend/src/plugins/execution/routes/submit.ts` | Submission API endpoint |
| `apps/backend/src/worker/processors/execution-processor.ts` | Job processor — sends code to Go server |
| `apps/backend/src/shared/queue.ts` | BullMQ job type definitions |
| `apps/backend/src/plugins/progress/routes/auto-save.ts` | Auto-save snapshot creation |
| `apps/backend/src/plugins/progress/routes/latest-snapshot.ts` | Snapshot retrieval |
| `apps/backend/src/plugins/progress/routes/resume.ts` | Session resume + snapshot retrieval |
| `apps/backend/migrations/004_add_submissions.ts` | Submissions table schema |
| `apps/backend/migrations/006_add_sessions_and_code_snapshots.ts` | Snapshots table schema |
| `apps/webapp/src/stores/editor-store.ts` | Frontend editor state |
| `apps/webapp/src/hooks/use-auto-save.ts` | Frontend auto-save hook |
| `apps/webapp/src/hooks/use-submit-code.ts` | Frontend submission hook |
| `apps/webapp/src/hooks/use-workspace-data.ts` | Frontend data loading |
| `apps/webapp/src/components/workspace/CodeEditor.tsx` | Monaco wrapper |
| `packages/shared/src/types/curriculum.ts` | Shared curriculum types |
| `content/schema/milestone-metadata.schema.json` | Metadata JSON schema |

### Technical Decisions

- **Backward compatibility:** New `files` JSONB column (nullable) alongside existing `code` column. If `files` is present, use it. Otherwise fall back to `code` (M1 behavior). No data migration needed. `code` column constraint relaxed to nullable for multi-file submissions.
- **File editability:** `editableFiles` string array in `metadata.yaml`. Frontend sends only editable files. Backend merges with read-only starter files from content loader at execution time. Content CI validates entries exist in `starter-code/`. `go.mod` must NOT appear in `editableFiles` — it is always read-only.
- **Go server encoding:** Each file in `files` map is individually base64-encoded. Go server iterates and writes each to tmpdir. `go.mod` included in files map (no more hardcoded generation). **Filenames are sanitized** — reject `..`, absolute paths, or anything resolving outside tmpdir.
- **Go server `go.mod` fallback:** When using the `files` path, if `go.mod` is not present in the files map, auto-generate the default `module workspace\ngo 1.23\n`. This ensures M1 files-path wrapping (`{ "main.go": code }`) works without explicitly including `go.mod`.
- **Benchmark refactor:** Delete the 240-line Go harness template. Replace with two sequential `/execute` calls (user files + reference files), comparison computed in TypeScript. Update `RunBenchmarkFn` type signature to accept `files: Record<string, string>` instead of single `code`/`referenceMainGo`/`referenceGoMod` params. The binary's internal benchmark (warmup + 10 measured iterations) is sufficient — drop the external iteration layer. Net code deletion. **Known trade-off:** Two sequential calls experience slightly different CPU/thermal states vs. the current interleaved approach. Acceptable at current scale (dogfooding). If benchmark variance becomes a concern, add a brief warmup `/execute` call before each measured call to normalize CPU state.
- **Submission stores editable files only.** Backend assembles full project at execution time by merging learner's editable files + read-only starter files from content loader. Harness updates propagate automatically.
- **Execution processor early-branch:** The processor must check `job.data.files` BEFORE any `Buffer.byteLength(code)` or `Buffer.from(code)` operations. When `files` is present, skip the `code` validation/encoding path entirely. This prevents null-reference crashes.
- **Editor store extension:** Add `files: Record<string, string>`, `activeFile: string`, `editableFiles: string[]` to existing `useEditorStore`. Single `content` field becomes derived from `files[activeFile]`. Non-editable files shown with `readOnly: true` on Monaco + lock icon.
- **Auto-save dirty checking:** Use `JSON.stringify(editableFiles)` content hash comparison instead of reference equality. Store `lastSavedHashRef` as a string. Only trigger save when hash changes.
- **Deploy ordering:** Go server → DB migration → Backend → Frontend. **Backend must deploy before frontend** because submit/auto-save schemas have `additionalProperties: false` — old backend rejects requests containing `files` field.
- **Content loader cache:** Extend `CachedMilestoneContent` to include `starterFiles` and `referenceFiles`. Handle deserialized cached entries missing new fields via null-coalescing. Invalidate cache on content deploy.
- **Max code size:** Increase `MAX_CODE_SIZE_BYTES` from 64KB to 128KB for multi-file projects (5+ files at M5 scale). Sum all decoded file sizes for validation.

## Implementation Plan

### Tasks

#### Phase 1: Go Execution Server (deploy first, independently)

- [x] Task 1: Extend Go server to accept multi-file requests
  - File: `infra/fly-execution/server/main.go`
  - Action: Add `Files map[string]string` field to `ExecuteRequest`. Keep `Code string` for backward compat. **Update the `req.Code == ""` guard (line 60-65)** to: reject only when BOTH `Code` is empty AND `Files` is empty/nil. Currently this guard returns 400 "code is required" for any request without `Code`, which blocks all multi-file requests.
  - Notes: `Files` values are base64-encoded. If `Files` is non-empty, use it. If empty/nil, fall back to `Code` (M1 path). Update `MAX_CODE_SIZE_BYTES` to 128KB and validate sum of all decoded file sizes.

- [x] Task 2: Write multiple files to tmpdir with filename sanitization and `go.mod` fallback
  - File: `infra/fly-execution/server/executor.go`
  - Action: Replace single `main.go` write with loop over `Files` map. For each filename: (1) validate — reject if contains `..`, starts with `/`, or `filepath.Join(tmpdir, filename)` does not have `tmpdir` as prefix after `filepath.Clean`. (2) Base64-decode value. (3) Write to `filepath.Join(tmpdir, filename)`. If `go.mod` is NOT present in `Files` map after writing all files, auto-generate the default: `module workspace\n\ngo 1.23\n`. This preserves M1 backward compat when code is wrapped as `{ "main.go": code }` without explicit `go.mod`.
  - Notes: Preserve existing single-file path when `Files` is empty. `go build -o main .` already compiles all `.go` files in directory — no change needed to build step. Return 400 with `invalid_filename` error code on path traversal attempt.

- [x] Task 2.5: Update Dockerfile pre-warm for module-based builds
  - File: `infra/fly-execution/Dockerfile`
  - Action: Update the pre-warm step (line 36-37) from single-file `go build warm.go` to a module-based directory build: write `go.mod` + `warm.go` to a temp dir, run `go build -o /dev/null .`. This matches the actual execution pattern and pre-warms module resolution.
  - Notes: Small but eliminates ~100-200ms cold-start overhead on first multi-file execution.

- [x] Task 3: Go server tests
  - File: `infra/fly-execution/server/executor_test.go` (new or extend existing)
  - Action: Test multi-file compilation: send 3 `.go` files + `go.mod`, verify successful build + execution. Test backward compat: send single `code` field, verify M1 behavior unchanged. Test path traversal rejection: send filename `../../etc/passwd`, verify 400 response. Test total size validation: send files exceeding 128KB, verify rejection. Test `go.mod` fallback: send files without `go.mod`, verify auto-generated module file and successful compilation.

- [x] Task 3.5: M1 regression gate (Phase 1)
  - Action: After Go server deploy, submit M1 single-file code via the legacy `code` path. Verify: compilation succeeds, all 8 acceptance criteria pass, benchmark returns valid results. **This must pass before proceeding to Phase 2.**

#### Phase 2: Backend — Content Loader & Types

- [x] Task 4: Extend content loader for multi-file reading
  - File: `apps/backend/src/plugins/curriculum/content-loader.ts`
  - Action: Add `loadStarterFiles(slug): Promise<Record<string, string> | null>` and `loadReferenceFiles(slug): Promise<Record<string, string> | null>` to the **exported `ContentLoader` interface** (lines 35-45) — this is the public contract that `ExecutionProcessorDeps` and mock factories depend on. Implement both: read all `.go` + `go.mod` files from `starter-code/` (or `reference-impl/`) directory via `readdir` + `readFile` loop. Extend `CachedMilestoneContent` interface to include `starterFiles` and `referenceFiles`. Handle deserialized cached entries missing new fields via null-coalescing (treat missing as cache miss, refetch). Keep existing `loadStarterCode()` for backward compat (M1 callers).
  - Notes: Filter to `.go` and `go.mod` files only. Cache results within existing `loadAndCache()` pattern.

- [x] Task 5: Add `editableFiles` to metadata schema and loader
  - File: `content/schema/milestone-metadata.schema.json`
  - Action: **First investigate whether Content CI currently validates `metadata.yaml` against this schema** — M1's `metadata.yaml` has `stuckDetection` but the schema only allows `csConceptLabel` with `additionalProperties: false`. Either CI is broken or not enforcing this schema. Fix the schema as a prerequisite: add `stuckDetection` object definition, add `editableFiles` (optional string array), and remove `additionalProperties: false` to allow extensibility. Verify existing M1 `metadata.yaml` passes validation after update.
  - File: `apps/backend/src/plugins/curriculum/content-loader.ts`
  - Action: Include `editableFiles` in `loadMetadata()` return type.
  - File: `packages/shared/src/types/curriculum.ts`
  - Action: Add `editableFiles?: readonly string[]` to `MilestoneMetadata` type. **Also update `MilestoneContent` type** (the API response type used by frontend) to include `starterFiles?: Record<string, string>` and `editableFiles?: readonly string[]`. Update `ResumeData.latestSnapshot` (in `packages/shared/src/types/api.ts`) to include `files?: Record<string, string> | null`. These shared types are what the frontend reads — without them, Tasks 14/17/18 cannot access the data type-safely (no-`any` rule).

- [x] Task 6: Update curriculum API to return starter files
  - File: `apps/backend/src/plugins/curriculum/routes/` (milestone detail route)
  - Action: Return `starterFiles: Record<string, string>` and `editableFiles: string[]` alongside existing `starterCode` field. If `starterFiles` is null (M1), derive from `starterCode`: `{ "main.go": starterCode }`.
  - Notes: Keep `starterCode` field for backward compat. Frontend uses `starterFiles` when available.

#### Phase 3: Backend — Submission & Execution Pipeline

- [x] Task 7: Database migration — add `files` column, relax `code` constraint
  - File: `apps/backend/migrations/NEW_multi_file_support.ts` (next sequence number)
  - Action: `ALTER TABLE submissions ADD COLUMN files jsonb;` and `ALTER TABLE code_snapshots ADD COLUMN files jsonb;`. Both nullable — existing rows untouched. `ALTER TABLE submissions ALTER COLUMN code DROP NOT NULL;` and `ALTER TABLE code_snapshots ALTER COLUMN code DROP NOT NULL;`. Update submit schema: remove `minLength: 1` from `code` when `files` is present (use conditional validation or make `code` optional).
  - Notes: Run `pnpm --filter shared db:types` after migration to regenerate Kysely types.

- [x] Task 8: Update submission API to accept `files`
  - File: `apps/backend/src/plugins/execution/routes/submit.ts`
  - Action: Remove `additionalProperties: false` from body schema (or add `files` to allowed properties). Add optional `files: Record<string, string>` to request body schema. Make `code` optional when `files` is present. Store `files` in `files` column. When `files` is present, set `code` to `null`. Update fire-and-forget snapshot to save `files`.
  - File: `apps/backend/src/shared/queue.ts`
  - Action: Update `ExecutionJobData`: make `code` optional (`code?: string`), add `files?: Record<string, string>`. Ensure at least one of `code` or `files` is present (type-level or runtime check).

- [x] Task 9: Update execution processor — file assembly & execution with early-branch
  - File: `apps/backend/src/worker/processors/execution-processor.ts`
  - Action: **Early-branch at the top of the processor** (before line 378's `Buffer.byteLength(code)`): check if `job.data.files` exists. If yes, skip the `code` size validation and `Buffer.from(code)` encoding — go directly to multi-file assembly path. Load read-only starter files via `contentLoader.loadStarterFiles(slug)`, merge with learner's editable files (learner's files override starter files by filename), base64-encode each file, send as `{ files: Record<string, string> }` to execution client. If `job.data.files` is absent AND `job.data.code` is present, use existing `code` path (M1). If neither is present, fail the job with an error.
  - File: `packages/execution/src/execution-service-client.ts`
  - Action: Make `code` optional (`code?: string`). Add `files?: Record<string, string>` to `ExecuteRequest`. Update the `execute()` method to conditionally include `code` and `files` in the serialized JSON body (omit `code` when undefined, omit `files` when undefined). Values in `files` are base64-encoded by the caller.

- [x] Task 10: Refactor benchmark execution — delete Go harness template
  - File: `apps/backend/src/worker/processors/execution-processor.ts`
  - Action: (1) Update `RunBenchmarkFn` type signature — replace `code: string`, `referenceMainGo: string`, `referenceGoMod: string` with `userFiles: Record<string, string>`, `referenceFiles: Record<string, string>`. (2) Delete `runBenchmarkOnService()` function (lines 58-297). (3) Replace with new implementation: load reference files via `contentLoader.loadReferenceFiles(slug)`. Assemble user files (merge editable from submission + read-only from starter). Call `executionClient.execute({ files: userFiles, args: ["benchmark", ...], timeoutSeconds })`. Call `executionClient.execute({ files: refFiles, args: ["benchmark", ...], timeoutSeconds })`. Parse JSON from each stdout, compute `normalizedRatio = userOps / refOps`. Publish `benchmark_complete` SSE event. (4) Update callsite at lines 547-553 to pass `userFiles` and `referenceFiles` instead of single-file params.
  - Notes: Sequential calls, not parallel (same hardware constraint). Net deletion of ~200 lines. The binary's internal 10-iteration benchmark is the measurement layer. For M1 backward compat: if single-file submission, wrap as `{ "main.go": code }` before calling. **Known trade-off:** Two sequential calls may experience slightly different CPU/thermal states vs. the current interleaved single-harness approach. Acceptable at current scale. If variance becomes a problem, add a brief no-op warmup call before each measured call.

#### Phase 4: Backend — Auto-Save & Resume

- [x] Task 11: Update auto-save to handle multi-file
  - File: `apps/backend/src/plugins/progress/routes/auto-save.ts`
  - Action: Remove `additionalProperties: false` from body schema (or add `files` to allowed properties). Accept optional `files: Record<string, string>` in request body alongside `code`. Make `code` optional when `files` is present. Store in `files` column. When `files` is present, set `code` to `null`.

- [x] Task 12: Update snapshot retrieval for multi-file
  - File: `apps/backend/src/plugins/progress/routes/latest-snapshot.ts`
  - Action: Include `files` column in SELECT. Return `files` in response alongside `code`. Frontend uses `files` when non-null.
  - Notes: **`toCamelCase()` warning** — this route applies `toCamelCase()` to the full result (line 36). The `files` JSONB value contains filenames as keys (`"main.go"`, `"wal.go"`) which must NOT be camelCased. Extract `files` before applying `toCamelCase` to the rest of the row, or exclude it from the transform.

- [x] Task 12.5: Update resume endpoint for multi-file
  - File: `apps/backend/src/plugins/progress/routes/resume.ts`
  - Action: Add `files` to the SELECT columns at line 26 (currently hard-selects only `['id', 'code', 'created_at']`). Return `files` in the response. Frontend uses `files` when non-null, falls back to `code`.
  - Notes: **This file was missing from the original spec.** Without this fix, users returning to a multi-file milestone would silently lose their saved work and see starter code instead.

#### Phase 4.5: Backend — Tutor Services & Test Infrastructure

- [x] Task 12.7: Update tutor context helpers for null-safe code access
  - File: `apps/backend/src/plugins/tutor/services/context-helpers.ts`
  - Action: Update `loadCurrentCode()` (line 98) to check `files` column first. If `files` is non-null, format as multi-file content for the AI prompt (e.g., concatenate with filename headers: `// === wal.go ===\n{content}\n// === kv.go ===\n{content}`). Fall back to `code` for M1. Handle `code: null` safely — use `'(No code submitted yet)'` fallback when both `code` and `files` are null.
  - Notes: The tutor needs to see all editable files to give meaningful help. Read-only files (main.go harness) can be omitted or summarized to save context.

- [x] Task 12.8: Update stuck detection context assembler for null-safe code access
  - File: `apps/backend/src/plugins/tutor/services/stuck-context-assembler.ts`
  - Action: Update `computeRecentDiffs()` (lines 106-128) — two fixes needed: (1) Add `'files'` to the `.select()` call on line 109 (currently only selects `['code', 'created_at']` — without this, `files` is always `undefined` even after the null-guard fix, and diffs for M2+ users are empty/useless). (2) Update diff logic on lines 122-123 — check `files` first; if present, concatenate all editable file contents (with filename headers) for diff computation. Fall back to `code` for M1. Guard against null with `(snapshot.code ?? '').split('\n')`.
  - Notes: **Without both fixes, stuck detection either crashes (null code) or produces empty diffs (missing files column) for all M2+ users.** This is a blocking issue.

- [x] Task 12.9: Update test mock factories for multi-file support
  - File: `apps/backend/src/worker/processors/execution-processor.test.ts`
  - Action: Update `createMockContentLoader()` to include the new `loadStarterFiles()` and `loadReferenceFiles()` methods (return mock file maps). Update `createTestJob()` to support optional `files` param alongside `code`. Update `seedUserAndSubmission()` to support nullable `code` and optional `files` JSONB. Add test cases for the multi-file execution path and the early-branch logic.
  - Notes: Existing tests must continue to pass unchanged. New tests add multi-file coverage.

#### Phase 5: Frontend — Editor & Workspace

- [x] Task 13: Extend editor store for multi-file state
  - File: `apps/webapp/src/stores/editor-store.ts`
  - Action: Add state: `files: Record<string, string>` (all files), `activeFile: string` (selected tab), `editableFiles: string[]` (from metadata). Add actions: `setActiveFile(name)`, `updateFileContent(name, content)`, `initFiles(files, editableFiles)`. Derive `content` getter from `files[activeFile]`. Add `getEditableFilesSnapshot(): Record<string, string>` that returns only editable files (used by auto-save and submit).
  - Notes: M1 backward compat: if `editableFiles` is empty/undefined, treat as single-file mode with `files: { "main.go": content }`.

- [x] Task 14: Update workspace data loading for multi-file
  - File: `apps/webapp/src/hooks/use-workspace-data.ts`
  - Action: Read `starterFiles` and `editableFiles` from curriculum API response. On snapshot resume, use `files` field if present (from either latest-snapshot or resume endpoint), otherwise fall back to `code` as `{ "main.go": code }`. Call `initFiles()` on editor store with resolved files + editableFiles list.

- [x] Task 15: Build file tab bar component
  - File: `apps/webapp/src/components/workspace/FileTabs.tsx` (new)
  - Action: Render tab for each file in `files`. Active tab highlighted. Non-editable files show lock icon. Click switches `activeFile` in editor store. Tab order: editable files first, then read-only.
  - Notes: Sibling of `CodeEditor`, not child. Part of workspace layout. For M1 (single file), render no tabs (or a single tab — match existing UX).

- [x] Task 16: Update CodeEditor for active file switching
  - File: `apps/webapp/src/components/workspace/CodeEditor.tsx`
  - Action: Read `activeFile`, `files`, `editableFiles` from editor store. Pass `files[activeFile]` as Monaco value. Set `readOnly: true` when `activeFile` is not in `editableFiles`. On content change, call `updateFileContent(activeFile, newContent)`.
  - Notes: Monaco instance stays mounted — update value on file switch, don't remount.

- [x] Task 17: Update auto-save hook for multi-file
  - File: `apps/webapp/src/hooks/use-auto-save.ts`
  - Action: Send `{ milestoneId, files }` (editable files via `getEditableFilesSnapshot()`) instead of `{ milestoneId, code }` when in multi-file mode. Dirty checking: compute `JSON.stringify(editableFilesSnapshot)` and compare to `lastSavedHashRef.current`. Only trigger save when hash differs. For M1 single-file mode, preserve existing `{ milestoneId, code }` path.

- [x] Task 18: Update submission hook for multi-file
  - File: `apps/webapp/src/hooks/use-submit-code.ts`
  - Action: Send `{ milestoneId, files }` (editable files via `getEditableFilesSnapshot()`) instead of `{ milestoneId, code }` when in multi-file mode. Backend handles merging with read-only files. For M1, preserve existing `{ milestoneId, code }` path.

#### Phase 6: Integration Testing

- [x] Task 19: M1 full-pipeline regression test
  - Action: Submit M1 single-file code through the fully updated pipeline (all phases deployed). Verify: compilation succeeds, all 8 acceptance criteria pass, benchmark runs and returns valid results. Test both the `code` path (legacy) and wrapping M1 code as `{ "main.go": code }` through the `files` path (verify `go.mod` fallback works). Test auto-save round-trip and snapshot resume via both latest-snapshot and resume endpoints.

- [x] Task 20: Multi-file integration test
  - Action: Create a test fixture with 3 Go files (`main.go` + `helper.go` + `impl.go`) in `package main`. Submit through the full pipeline. Verify: compilation, execution, criteria evaluation all work. Verify auto-save/resume round-trips multi-file state via both latest-snapshot and resume endpoints. Verify benchmark two-call flow produces valid `normalized_ratio`.

### Acceptance Criteria

- [x] AC 1: Given a multi-file Go project (3 files + go.mod), when submitted to `/execute` on the Go server, then all files are written to tmpdir and `go build -o main .` compiles successfully.
- [x] AC 2: Given a request with only the legacy `code` field (no `files`), when submitted to the Go server, then M1 single-file behavior is preserved exactly.
- [x] AC 3: Given a filename containing `..` or an absolute path in the `files` map, when submitted to the Go server, then the request is rejected with a 400 error and `invalid_filename` error code.
- [x] AC 4: Given a multi-file request where total decoded size exceeds 128KB, when submitted to the Go server, then the request is rejected with a `code_too_large` error.
- [x] AC 5: Given a files-path request without `go.mod` in the files map, when submitted to the Go server, then a default `go.mod` is auto-generated and compilation succeeds.
- [x] AC 6: Given a milestone with `editableFiles: ["wal.go", "kv.go"]` in metadata.yaml, when the curriculum API is called, then the response includes `starterFiles` (all files) and `editableFiles` (editable subset).
- [x] AC 7: Given a submission with `files: { "wal.go": "...", "kv.go": "..." }`, when the execution processor runs, then it merges editable files with read-only starter files from content loader and sends the complete project to the Go server. The processor does not crash on null `code`.
- [x] AC 8: Given a multi-file milestone, when the frontend loads, then file tabs render for all files with lock icons on non-editable files, and clicking a tab switches the Monaco editor content.
- [x] AC 9: Given a non-editable file tab is active, when the editor renders, then Monaco is in `readOnly: true` mode and edits are blocked.
- [x] AC 10: Given a multi-file workspace, when auto-save triggers, then all editable file contents are saved as a JSON object in the `files` column of `code_snapshots`. Dirty checking uses content hash — unchanged files do not trigger saves.
- [x] AC 11: Given a user returns to a multi-file milestone with a prior snapshot, when the workspace loads via either the latest-snapshot or resume endpoint, then all files are restored from the `files` column and the correct tab is active.
- [x] AC 12: Given a multi-file submission, when benchmarks run, then the processor makes two sequential `/execute` calls (user + reference), parses JSON from each, and computes `normalized_ratio` correctly.
- [x] AC 13: Given M1 content (no `editableFiles` in metadata, single-file starter code), when the full pipeline runs end-to-end, then all existing behavior is preserved — no regression.
- [x] AC 14: Given backend is deployed with `files` support but frontend has not yet deployed, when the old frontend sends `{ milestoneId, code }` to submit/auto-save, then the request succeeds (backward compat).

## Additional Context

### Dependencies

- No external service dependencies
- **Deploy order is strict:** Go server (Phase 1) → DB migration (Task 7) → Backend (Phases 2-4) → Frontend (Phase 5). **Backend must deploy before frontend** — submit/auto-save schemas have `additionalProperties: false` which rejects the `files` field until backend is updated.
- Phase 1 includes a regression gate (Task 3.5) — must pass before proceeding

### Testing Strategy

- **Go server (Task 3):** Integration test — send multi-file payload via HTTP, verify build + execution output. Test path traversal rejection. Test size limit. Test `go.mod` fallback.
- **Content loader (Task 4-5):** Unit test with fixture directory containing multiple `.go` files. Test cache miss on deserialized entries missing new fields.
- **Submit API (Task 8):** `fastify.inject()` tests — both `code` and `files` request shapes. Test that old frontend without `files` still works.
- **Execution processor (Task 9-10):** Unit test with mocked execution client — verify file assembly, merge logic, early-branch on `files` vs `code` (no crash on null code), and two-call benchmark flow. Verify `RunBenchmarkFn` signature accepts multi-file params.
- **Resume endpoint (Task 12.5):** `fastify.inject()` test — verify `files` column is returned in resume response.
- **Tutor services (Tasks 12.7-12.8):** Unit tests verifying null-safe code access — no crash on `code: null` with `files` present. Verify multi-file content is formatted for AI prompt.
- **Test factories (Task 12.9):** Verify mock factories compile with extended `ContentLoader` interface. Existing tests pass unchanged.
- **Frontend (Task 13-18):** Component tests with `@testing-library/react` — tab switching, read-only enforcement, auto-save payload shape, dirty-check hash comparison.
- **M1 regression (Task 3.5 + Task 19):** Regression gate after Go server deploy AND full-pipeline regression after all phases.
- **Multi-file integration (Task 20):** End-to-end — submit 3-file project, verify full pipeline including benchmark.

### Notes

- **High risk:** Benchmark refactor (Task 10) — net code deletion but changes a critical path and the injectable `RunBenchmarkFn` contract. Test thoroughly with both M1 single-file and M2 multi-file inputs. Known trade-off: two sequential calls may have slightly more variance than the interleaved single-harness approach. Acceptable at dogfooding scale.
- **Medium risk:** `additionalProperties: false` removal (Tasks 8, 11) — opens schemas to accept unknown fields. Acceptable trade-off for deploy flexibility. Can re-add strict validation later if needed.
- **Medium risk:** Execution processor null-code crash (Task 9) — early-branch is critical. Without it, any multi-file submission crashes the worker. This is the highest-priority fix in Phase 3.
- **Medium risk:** Tutor service crashes (Tasks 12.7-12.8) — `stuck-context-assembler.ts` calls `.split('\n')` on null `code`. Crashes stuck detection for all M2+ users. Must be fixed alongside DB migration.
- **Low risk:** Go server changes (Task 1-2) — compilation step unchanged, only file-writing loop changes. The `req.Code == ""` guard in `main.go` must be relaxed (Task 1) — without this, all multi-file requests are rejected.
- This spec establishes the multi-file pattern for M3-5 (`btree.go`, `parser.go`, `ast.go`, `txn.go`, etc.)
- M1 content requires zero changes — backward compatibility is mandatory.
- After this ships, a separate tech spec handles M2 content authoring (brief, criteria, benchmarks, Go code, SVGs).

## Review Notes

- Adversarial review completed (2026-03-19)
- Findings: 14 total, 12 fixed, 2 skipped (pre-existing/noise)
- Resolution approach: auto-fix all real findings
- Critical fixes: stale test signatures (F1), wrong error message assertions (F2), wrong mock return types (F3)
- High fixes: HTTP 200 for validation error in auto-save (F5), `as` casting cleanup (F4)
- Medium fixes: Go subdirectory creation (F6), stale closure in auto-save (F7), JSONB parse guard (F8), non-null assertions removed (F9)
- Low fixes: readonly interface properties (F13)
- Skipped: pre-existing `as` in execution-service-client (F11), noise finding (F12)
