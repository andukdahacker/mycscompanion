# Story 3.1: Execution Environment Image & Registry

Status: done

## Story

As a **developer**,
I want a versioned Docker image with the Go toolchain for Fly.io Machines,
So that code execution has a reproducible, maintained environment.

## Acceptance Criteria

1. **Given** the execution environment needs to compile and run learner Go code, **When** the Docker image is built, **Then** a Dockerfile in `infra/fly-execution/` builds a minimal image with Go toolchain (specific version pinned)
   - _Note: Epics reference `packages/execution` as the Dockerfile location. Architecture doc overrides this to `infra/fly-execution/` (separating Docker artifacts from TypeScript source). Architecture is authoritative._
2. **And** the image is pushed to the Fly.io registry (`registry.fly.io/<app-name>:<tag>`)
   - _Fly.io registry chosen over GitHub Container Registry because Fly Machines pull directly from the Fly registry -- eliminates cross-registry latency and authentication complexity._
3. **And** the image version is tagged and referenced in Fly Machine configuration (`packages/execution/src/fly-config.ts`)
4. **And** image build is automated in CI (rebuild on Dockerfile changes via GitHub Actions workflow)
5. **And** the image includes only compilation and execution tooling -- no persistent storage, no network utilities
6. **And** a local development fallback exists (Docker-based execution for local testing without Fly.io)

## Tasks / Subtasks

- [x] Task 1: Create the execution Dockerfile (AC: #1, #5)
  - [x] 1.1 Create `infra/fly-execution/` directory
  - [x] 1.2 Create `infra/fly-execution/Dockerfile` with `golang:1.23-alpine` base image (pinned version per architecture spec)
  - [x] 1.3 Configure minimal image: remove unnecessary Alpine packages, ensure no `curl`, `wget`, `git`, `ssh` or network utilities are present, use `apk --no-cache` only, strip package caches and documentation
  - [x] 1.4 Set up workspace directory `/workspace` for user code injection (must be writable -- benchmark execution runs user then reference implementation sequentially on the same Machine)
  - [x] 1.5 Create non-root `runner` user for code execution
  - [x] 1.6 Add `infra/fly-execution/.dockerignore` excluding `fly.toml`, `*.sh`, `*.md`
  - [x] 1.7 Verify image builds successfully: `docker build -t mcc-execution:local infra/fly-execution/`
  - [x] 1.8 Verify Go compilation works inside container: `docker run --rm mcc-execution:local go version`

- [x] Task 2: Create Fly.io registry configuration (AC: #2)
  - [x] 2.1 Create `infra/fly-execution/fly.toml` -- minimal config for registry purposes only (not a deployed app): `app = "mcc-execution"` and `primary_region = "ord"`. No `[services]`, `[http_service]`, or `[checks]` sections -- Machines are created via API, not `fly deploy`.
  - [x] 2.2 Document the Fly app creation step in a comment in `fly.toml`: `fly apps create mcc-execution` (manual one-time setup)
  - [x] 2.3 Document the manual image push workflow in a comment: `fly auth docker && docker push registry.fly.io/mcc-execution:<tag>` (CI automates this in Task 4)

- [x] Task 3: Create typed Fly Machine configuration in packages/execution (AC: #3)
  - [x] 3.1 Expand `FlyMachineConfig` type in `packages/execution/src/index.ts`: add `cpuKind`, `region`, `autoDestroy`, `restartPolicy` fields inside the existing `Readonly<{...}>` wrapper. See expanded type definition in Dev Notes.
  - [x] 3.2 Set up test infrastructure for `packages/execution`:
    - Add `vitest` as a devDependency: `pnpm --filter @mycscompanion/execution add -D vitest`
    - Create `packages/execution/vitest.config.ts` extending base config from `@mycscompanion/config` (follow `packages/shared/vitest.config.ts` pattern)
    - Add `"test": "vitest run"` script to `packages/execution/package.json`
  - [x] 3.3 Create `packages/execution/src/fly-config.ts` with `EXECUTION_IMAGE_REF` constant and `DEFAULT_FLY_MACHINE_CONFIG` object using `satisfies FlyMachineConfig`
  - [x] 3.4 Make image ref configurable: read `process.env.MCC_EXECUTION_IMAGE` with fallback to registry constant, so local dev can use `mcc-execution:local`
  - [x] 3.5 Create `packages/execution/src/fly-config.test.ts` with configuration validation tests
  - [x] 3.6 Update `packages/execution/src/index.ts` barrel file to re-export from `fly-config.ts`

- [x] Task 4: Create CI workflow for image builds (AC: #4)
  - [x] 4.1 Create `.github/workflows/execution-image.yml` triggered on `push` to `main` AND `pull_request` to `main` with path filter `infra/fly-execution/**`. Also trigger on `workflow_dispatch` for manual rebuilds. Include `concurrency` group matching the pattern in `ci.yml`.
  - [x] 4.2 Build the Docker image in CI
  - [x] 4.3 Tag image with git SHA and `latest`
  - [x] 4.4 Push to Fly.io registry on `push` to `main` only (skip push on `pull_request` -- build-only validation). Requires `FLY_API_TOKEN` secret in GitHub.
  - [x] 4.5 Verify Go version inside built image matches expected pinned version
  - [x] 4.6 Verify `/workspace` directory exists in the image
  - [x] 4.7 Verify non-root `runner` user exists in the image
  - [x] 4.8 Verify no network utilities: `which curl` and `which wget` should fail
  - [x] 4.9 Add `FLY_API_TOKEN` to required repository secrets documentation in CI comments

- [x] Task 5: Create local development fallback (AC: #6)
  - [x] 5.1 Add `execution` service to `docker-compose.yml` as a build-only target (`build: ./infra/fly-execution`) using `profiles: [execution]` so it only builds when explicitly requested via `docker compose --profile execution build`. This is NOT a long-running service -- the image is used by the execution worker to create ephemeral containers.
  - [x] 5.2 Create `infra/fly-execution/test-local.sh` that builds the image and runs a Go compilation test (build image, run `go version`, compile a hello-world program, verify output)
  - [x] 5.3 Document local usage in `.env.example` comments: set `MCC_EXECUTION_IMAGE=mcc-execution:local` for local dev

- [x] Task 6: Update environment configuration (AC: #2, #3)
  - [x] 6.1 Add `MCC_EXECUTION_IMAGE` env var to `.env.example` with comment: default `registry.fly.io/mcc-execution:latest` in prod, `mcc-execution:local` for local dev (Story 3.1)
  - [x] 6.2 Add `MCC_FLY_APP_NAME` env var to `.env.example` with default `mcc-execution` (Story 3.1)
  - [x] 6.3 Document env vars with story reference comments

- [x] Task 7: Integration verification
  - [x] 7.1 Build image locally: `docker build -t mcc-execution:local infra/fly-execution/`
  - [x] 7.2 Run `pnpm --filter @mycscompanion/execution test` -- all tests pass
  - [x] 7.3 Run `pnpm typecheck` -- no type errors from expanded `FlyMachineConfig`
  - [x] 7.4 Verify `fly-config.ts` image ref reads `MCC_EXECUTION_IMAGE` env var correctly

## Dev Notes

### Architecture Compliance

**Dockerfile location:** `infra/fly-execution/Dockerfile` -- per architecture doc's complete project directory structure. NOT in `packages/execution/` (the package holds TypeScript config/types, not Docker artifacts).

**Image specification from architecture (ARCH-9, NFR-S1, NFR-S2):**

| Constraint | Configuration |
|---|---|
| Base image | `golang:1.23-alpine` (pinned per architecture spec) |
| Isolation | Firecracker microVM (kernel-level) -- provided by Fly.io |
| CPU | 1 shared CPU |
| Memory | 256 MB |
| Network | Disabled (`--network=none` at Machine creation) |
| Timeout | 60s hard kill (worker destroys Machine) |
| Process limit | `--pids-limit` enforced at Machine creation |
| Filesystem | Ephemeral (destroyed with Machine) |
| Lifecycle | Created per submission, destroyed after completion |

**Critical -- scope boundary for this story:** Network isolation (`--network=none`), read-only filesystem, and `--pids-limit` are all enforced at Fly Machine creation time (Story 3.2), NOT in the Dockerfile. The Dockerfile provides the Go toolchain only. The Fly Machine config in `packages/execution/src/fly-config.ts` defines the resource constraints that Story 3.2 will pass to the Machines API.

**Registry:** Architecture specifies image is "pre-pushed to Fly registry" at `registry.fly.io/<app-name>:<tag>`. Use `fly auth docker` + `docker push` in CI. Content CI (FR44) also uses this same image to validate milestone content -- the image serves both the submission worker and content validation pipelines.

### Go Version Consideration

Architecture doc specifies `golang:1.23-alpine`. Verify whether Go 1.23 is still the latest maintained version at implementation time. If a newer stable Go version is available, discuss with the team before updating. The Go version must be explicitly pinned (never `latest`). If updating, sync the version across:
- `infra/fly-execution/Dockerfile`
- `packages/execution/src/fly-config.ts` (EXECUTION_IMAGE_REF constant)
- CI workflow image verification step

### Existing Codebase State

**`packages/execution/src/index.ts` already exists** with placeholder types:
- `FlyMachineConfig` type wrapped in `Readonly<{...}>` with `image`, `cpus`, `memoryMb`, `timeoutSeconds` fields
- `ExecutionEvent` discriminated union (placeholder -- will be expanded in Story 3.2)

This story expands `FlyMachineConfig` and adds a concrete `fly-config.ts` module. Do NOT modify the `ExecutionEvent` type -- that belongs to Story 3.2.

**`packages/execution` has NO test infrastructure** -- no vitest config, no test script, no vitest devDependency. Must set up before writing tests (Task 3.2).

**`infra/` directory does NOT exist yet** -- needs to be created.

**`docker-compose.yml`** currently has `postgres`, `redis`, and `metabase` (profile) services. Add `execution` as a build-only target under a profile.

### Technical Requirements

**Dockerfile design principles:**
- Single-stage image (NOT multi-stage) -- the image IS the Go toolchain, not a compiled binary
- `golang:1.23-alpine` as the base (includes `go build`, `go test`, `go run`)
- Create `/workspace` directory where user code will be injected (writable -- benchmarks run user + reference implementation sequentially on the same Machine)
- Create a non-root `runner` user for executing user code
- Do NOT install: `curl`, `wget`, `git`, `ssh`, any network utilities
- Do NOT include: package caches, documentation, man pages
- Strip unnecessary Alpine packages: `apk --no-cache` only

**Expanded `FlyMachineConfig` type (in `packages/execution/src/index.ts`):**
```typescript
export type CpuKind = 'shared' | 'performance'
export type RestartPolicy = 'no' | 'always' | 'on-failure'

export type FlyMachineConfig = Readonly<{
  image: string
  cpuKind: CpuKind
  cpus: number
  memoryMb: number
  timeoutSeconds: number
  autoDestroy: boolean
  restartPolicy: RestartPolicy
  region?: string  // optional -- set at Machine creation time, defaults to app's primary region
}>
```

The existing `Readonly<{...}>` wrapper MUST be preserved. Use union types for `cpuKind` and `restartPolicy` per project-context rule (never TS `enum`, never loose `string`).

**`fly-config.ts` design:**
```typescript
// packages/execution/src/fly-config.ts
import type { FlyMachineConfig } from './index'

const FLY_REGISTRY_IMAGE = 'registry.fly.io/mcc-execution:latest' as const

/** Reads MCC_EXECUTION_IMAGE env var with fallback to Fly registry.
 *  Local dev: set MCC_EXECUTION_IMAGE=mcc-execution:local */
export const getExecutionImageRef = (): string =>
  process.env.MCC_EXECUTION_IMAGE ?? FLY_REGISTRY_IMAGE

export const DEFAULT_FLY_MACHINE_CONFIG = {
  image: FLY_REGISTRY_IMAGE,
  cpuKind: 'shared',
  cpus: 1,
  memoryMb: 256,
  timeoutSeconds: 60,
  autoDestroy: true,
  restartPolicy: 'no',
} as const satisfies FlyMachineConfig
```

Use `satisfies` (NOT `as`) per project-context anti-patterns. `FLY_REGISTRY_IMAGE` uses `:latest` as the initial placeholder -- CI builds will push tagged versions (git SHA). `getExecutionImageRef()` enables local dev override via `MCC_EXECUTION_IMAGE` env var.

**`fly.toml` contents (minimal -- not a deployed app):**
```toml
# Fly.io app for execution environment image registry.
# This app hosts the Docker image only -- Machines are created via API.
# One-time setup: fly apps create mcc-execution
app = "mcc-execution"
primary_region = "ord"

# No [services], [http_service], or [checks] -- Machines are ephemeral,
# created by the worker via Fly Machines REST API (Story 3.2).
```

**CI workflow design:**
- Trigger: `push` to `main` AND `pull_request` to `main` with path filter `infra/fly-execution/**`. Also `workflow_dispatch`.
- Concurrency group: `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` (matches `ci.yml` pattern)
- On `push` to `main`: build -> tag (git SHA + `latest`) -> push to Fly registry -> verify image
- On `pull_request`: build -> verify image (no push -- validation only)
- Requires `FLY_API_TOKEN` GitHub secret

### File Structure Requirements

Files to CREATE:
```
infra/
└── fly-execution/
    ├── Dockerfile              # golang:1.23-alpine + workspace setup
    ├── .dockerignore           # Exclude fly.toml, *.sh, *.md
    ├── fly.toml                # Minimal: app name + region (registry only)
    └── test-local.sh           # Local build + smoke test script

packages/execution/
    ├── vitest.config.ts        # Extends base config from @mycscompanion/config
    └── src/
        ├── fly-config.ts       # Typed Fly Machine config + image ref
        └── fly-config.test.ts  # Configuration validation tests

.github/workflows/
    └── execution-image.yml     # CI for image builds + validation
```

Files to MODIFY:
```
packages/execution/src/index.ts    # Expand FlyMachineConfig type, export fly-config module
packages/execution/package.json    # Add vitest devDep + "test" script
docker-compose.yml                 # Add execution build target (profile: execution)
.env.example                       # Add MCC_EXECUTION_IMAGE, MCC_FLY_APP_NAME
```

### Testing Requirements

**Unit tests for `fly-config.ts`:**
- Validate `DEFAULT_FLY_MACHINE_CONFIG` has all required fields with correct types
- Validate resource limits are within expected ranges (cpus >= 1, memoryMb >= 128, timeoutSeconds > 0)
- Validate `DEFAULT_FLY_MACHINE_CONFIG` satisfies `FlyMachineConfig` type
- Validate `getExecutionImageRef()` returns registry URL when env var is not set
- Validate `getExecutionImageRef()` returns env var value when `MCC_EXECUTION_IMAGE` is set
- Use `it()` not `test()`, co-locate as `fly-config.test.ts`
- Include `afterEach(() => { vi.restoreAllMocks() })` per project-context standards
- No `any` type in test files -- use properly typed objects
- If adding any new test patterns, contribute to `@mycscompanion/config/test-utils/`

**CI validation (in execution-image.yml workflow):**
- Verify image builds successfully
- Verify `go version` outputs expected Go version inside the container
- Verify `/workspace` directory exists
- Verify non-root `runner` user exists
- Verify no network utilities installed (`which curl` should fail, `which wget` should fail)

**No database tests needed** for this story. No backend routes, no migrations.

**Test command:** `pnpm --filter @mycscompanion/execution test`

### Library/Framework Requirements

**npm dependencies to add:**
- `vitest` (devDependency) to `packages/execution` -- for running `fly-config.test.ts`

**Docker tools (CI only):**
- `docker/setup-buildx-action@v3` -- for efficient Docker builds in GitHub Actions
- `docker/build-push-action@v6` -- for build + push in CI
- `flyctl` -- for Fly.io registry authentication (install via `superfly/flyctl-actions/setup-flyctl@master`)

### Previous Story Intelligence

**From Epic 2 code reviews -- patterns to follow:**
- Every type field should use `Readonly` wrapper for shared configuration data (existing `FlyMachineConfig` already has this -- preserve it)
- Use `satisfies` for config validation, never `as` casting
- Named exports only, no default exports
- Co-locate test files: `fly-config.test.ts` next to `fly-config.ts`
- Use `it()` not `test()`, describe behavior not implementation
- No `any` type including in test files
- Union types for constrained string values, never loose `string` or TS `enum`

**From Epic 2 -- problems to avoid:**
- Don't use `as` casts in tests -- use properly typed objects
- Don't leave `TODO` without a story reference
- Verify CI workflow works end-to-end before marking done

### Git Intelligence

**Recent commit pattern:** `Implement Story X.Y: <title> with code review fixes`

**Files from recent stories follow these patterns:**
- Backend plugins: `apps/backend/src/plugins/<domain>/index.ts`
- Shared types: `packages/shared/src/types/domain.ts`, `packages/shared/src/types/api.ts`
- Test utilities: `packages/config/test-utils/`
- CI workflows: `.github/workflows/*.yml`
- Environment vars: `.env.example` with story reference comments

### Project Structure Notes

- `infra/` is a NEW top-level directory -- architecture specifies it but it doesn't exist yet
- `packages/execution/` exists with placeholder types from Epic 1 scaffold
- No new packages directory should be created (exactly 4: `ui`, `shared`, `execution`, `config`)
- No new Zustand stores
- No database migrations needed for this story

### References

- [Source: architecture.md#Code-Execution-Pipeline] -- Fly Machine specification, execution flow
- [Source: architecture.md#Infrastructure-Deployment] -- Hybrid Railway + Fly.io topology
- [Source: architecture.md#Complete-Project-Directory-Structure] -- `infra/fly-execution/` directory structure
- [Source: architecture.md#Content-CI] -- Content CI uses same execution image (FR44)
- [Source: epics.md#Story-3.1] -- Acceptance criteria, user story, technical requirements
- [Source: project-context.md#Technology-Stack] -- Go 1.23, Fly.io Machines API, packages/execution
- [Source: project-context.md#Anti-Patterns] -- No `as` casting, no default exports, no `any`, no TS enum
- [Source: project-context.md#Code-Quality] -- Naming conventions, env var prefix `MCC_`
- [Source: architecture.md#API-Communication-Patterns] -- Fly Machine config in packages/execution
- [Source: architecture.md#Naming-Patterns] -- `SCREAMING_SNAKE_CASE` for constants, `kebab-case.ts` for utility files

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Dockerfile initial build failed: busybox provides `wget` as a symlink — `apk del wget` doesn't work. Fixed by explicitly removing `/usr/bin/wget`.

### Completion Notes List

- Created `infra/fly-execution/` directory with Dockerfile, .dockerignore, fly.toml, and test-local.sh
- Dockerfile uses `golang:1.23-alpine` (Go 1.23.12), creates non-root `runner` user, `/workspace` directory, strips network utilities
- Expanded `FlyMachineConfig` type with `cpuKind`, `autoDestroy`, `restartPolicy`, optional `region` — using union types per project-context
- Created `fly-config.ts` with `DEFAULT_FLY_MACHINE_CONFIG` (satisfies pattern) and `getExecutionImageRef()` for env-based image override
- Set up vitest test infrastructure for `packages/execution` (vitest.config.ts, test script, 10 unit tests)
- Created `.github/workflows/execution-image.yml` with build, verify, and conditional push to Fly registry
- Added `execution` build-only service to docker-compose.yml under `execution` profile
- Added `MCC_EXECUTION_IMAGE` and `MCC_FLY_APP_NAME` env vars to .env.example
- All 10 unit tests pass, full monorepo test suite passes (168 tests), typecheck clean (7/7 tasks)

### Change Log

- 2026-03-02: Implemented Story 3.1 — Execution environment Docker image, Fly Machine config types, CI workflow, local dev fallback
- 2026-03-02: Code review (Claude Opus 4.6) — 7 issues found (1H, 3M, 3L), all fixed:
  - H1: Pinned `superfly/flyctl-actions/setup-flyctl` from `@master` to `@1.5` (supply-chain risk)
  - M1: Added `git`/`ssh` checks to CI network utility verification (was only `curl`/`wget`)
  - M2: Added network utility absence checks to `test-local.sh`
  - M3: Replaced weak `toBeDefined()` assertions with exact value assertions in first test case
  - L1: Switched to `vi.stubEnv()` for env var test setup
  - L2: Added Docker layer caching (`cache-from`/`cache-to: type=gha`) to CI build
  - L3: Added `vi.unstubAllEnvs()` to top-level `afterEach`, removed redundant inner cleanup

### File List

New files:
- infra/fly-execution/Dockerfile
- infra/fly-execution/.dockerignore
- infra/fly-execution/fly.toml
- infra/fly-execution/test-local.sh
- packages/execution/vitest.config.ts
- packages/execution/src/fly-config.ts
- packages/execution/src/fly-config.test.ts
- .github/workflows/execution-image.yml

Modified files:
- packages/execution/src/index.ts
- packages/execution/package.json
- docker-compose.yml
- .env.example
- pnpm-lock.yaml
