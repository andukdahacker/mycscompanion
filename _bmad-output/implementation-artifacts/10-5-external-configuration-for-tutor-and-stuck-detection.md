# Story 10.5: External Configuration for Tutor & Stuck Detection

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **admin**,
I want to update AI tutor prompts and stuck detection thresholds without deploying code,
So that I can tune the learning experience based on observed behavior.

**Requirements Traced:** FR56, ARCH-24

## Acceptance Criteria

1. **Given** the platform is deployed **When** the admin updates external configuration files **Then** AI tutor system prompts (Socratic guidelines, persona instructions, context formatting) are loaded from external configuration files, not hardcoded (FR56)
2. **And** stuck detection inactivity thresholds are loaded from external configuration, configurable per milestone (FR56)
3. **And** model routing rules (when to use Haiku vs Sonnet) are configurable via external config
4. **And** configuration changes take effect on next request or server restart — no code deployment required
5. **And** invalid configuration is validated on load with clear error messages logged to Sentry
6. **And** a default configuration is bundled with the codebase as a fallback if external config is missing

## Critical Context: What Already Exists vs What Needs to Change

This story is NOT about creating a configuration system from scratch. Significant parts already exist. The work is about adding hot-reload capability, externalizing the model routing rules, and adding validation.

### What Already Exists (DO NOT recreate)

| Component | File | Status |
|---|---|---|
| Tutor base prompt template | `content/prompts/tutor-base.md` | DONE — loaded via `context-assembler.ts` |
| Stuck intervention prompt | `content/prompts/stuck-intervention.md` | DONE — loaded via `stuck-context-assembler.ts` |
| Test fixture prompts | `apps/backend/src/plugins/tutor/services/__fixtures__/prompts/` | DONE — simpler versions for tests |
| Per-milestone stuck detection config | `content/milestones/{slug}/metadata.yaml` | DONE — `thresholdMinutes`, `stage2OffsetSeconds` |
| Stuck detection frontend hook | `apps/webapp/src/hooks/use-stuck-detection.ts` | DONE — reads thresholds from milestone API |
| Frontend fallback defaults | `apps/webapp/src/hooks/use-workspace-data.ts` | DONE — `{ thresholdMinutes: 10, stage2OffsetSeconds: 60 }` |
| Content loader with Redis caching | `apps/backend/src/plugins/curriculum/content-loader.ts` | DONE — 3600s cache TTL |
| Context assembler (loads prompts) | `apps/backend/src/plugins/tutor/services/context-assembler.ts` | DONE — caches in memory |
| Stuck context assembler | `apps/backend/src/plugins/tutor/services/stuck-context-assembler.ts` | DONE — extends regular context |
| Model selection logic | `apps/backend/src/plugins/tutor/services/anthropic.ts` | DONE — hardcoded `selectModel()` |
| Admin plugin with basic auth | `apps/backend/src/plugins/admin/index.ts` | DONE — Bull Board at `/admin/queues` |
| StuckDetectionConfig type | `packages/shared/src/types/curriculum.ts` | DONE — `thresholdMinutes`, `stage2OffsetSeconds` |

### What NEEDS to Change

| Change | Why | Scope |
|---|---|---|
| Add `POST /admin/reload-prompts` route | Hot-reload prompt templates without restart (ARCH specifies this exact endpoint) | New admin route |
| Add `POST /admin/reload-config` route | Hot-reload model routing + stuck detection config | New admin route |
| Externalize model routing rules to config file | Currently hardcoded in `anthropic.ts` — `selectModel()` has inline logic | New config file + refactor |
| Add config validation on load | Invalid configs should log to Sentry with clear error messages | New validation logic |
| Add cache invalidation for content-loader | Stuck detection thresholds cached in Redis for 3600s — need invalidation on admin reload | Modify content-loader |
| Make prompt cache invalidatable | `context-assembler.ts` caches prompt in memory — need reset method | Modify context-assembler |

### Data Model

No database changes. All configuration is file-based:

| Config Type | File Location | Format | Current State |
|---|---|---|---|
| Tutor base prompt | `content/prompts/tutor-base.md` | Markdown with `{{template_vars}}` | EXISTS — just needs reload capability |
| Stuck intervention prompt | `content/prompts/stuck-intervention.md` | Markdown with `{{template_vars}}` | EXISTS — just needs reload capability |
| Model routing rules | `content/prompts/model-routing.yaml` | YAML | NEW — extract from hardcoded logic |
| Stuck detection defaults | `content/milestones/{slug}/metadata.yaml` | YAML (per-milestone) | EXISTS — needs cache invalidation |

## Tasks / Subtasks

- [x] Task 1: Create model routing configuration file (AC: #3, #6)
  - [x] 1.1 Create `content/prompts/model-routing.yaml` with the current hardcoded logic externalized:
    ```yaml
    # Model routing configuration for AI tutor
    # Changes take effect on next request after admin reload or server restart

    models:
      haiku: "claude-haiku-4-5-20251001"
      sonnet: "claude-sonnet-4-6-20250514"

    default_model: haiku

    # Rules evaluated in order - first match wins
    # Each rule has a condition type and the model to use
    routing_rules:
      - condition: stuck_intervention
        model: sonnet
        description: "Use Sonnet for stuck interventions (deeper analysis needed)"

      - condition: compile_errors
        model: sonnet
        description: "Use Sonnet when submission has compile errors"

      - condition: explain_pattern
        model: sonnet
        description: "Use Sonnet for conceptual explanation requests"
        # Patterns matched using word boundaries (\b) to avoid false positives
        # e.g., "explain" matches "can you explain X" but NOT "explaining"
        patterns:
          - "explain"
          - "what is"
          - "how does"
          - "why does"
          - "what happens"
          - "how would"
    ```
  - [x] 1.2 Add TypeScript type for model routing config in `packages/shared/src/types/curriculum.ts`:
    ```typescript
    export type ModelRoutingCondition = 'stuck_intervention' | 'compile_errors' | 'explain_pattern'

    export interface ModelRoutingRule {
      readonly condition: ModelRoutingCondition
      readonly model: 'haiku' | 'sonnet'
      readonly description: string
      readonly patterns?: readonly string[]
    }

    export interface ModelRoutingConfig {
      readonly models: {
        readonly haiku: string
        readonly sonnet: string
      }
      readonly default_model: 'haiku' | 'sonnet'
      readonly routing_rules: readonly ModelRoutingRule[]
    }
    ```

- [x] Task 2: Add config loading and validation (AC: #1, #3, #5, #6)
  - [x] 2.1 Create `apps/backend/src/plugins/tutor/services/config-loader.ts`:
    - Load `model-routing.yaml` from `content/prompts/` directory
    - Parse YAML using `js-yaml` (already a dependency via content-loader)
    - Validate config structure: required fields (`models`, `default_model`, `routing_rules`), valid model references, pattern arrays for `explain_pattern` rules
    - On validation failure: log structured error to Fastify logger (which flows to Sentry), fall back to bundled default config
    - Cache parsed config in memory with a `resetCache()` method
    - Export `loadModelRoutingConfig()` and `resetModelRoutingConfigCache()`
  - [x] 2.2 Add validation for prompt template files in context assemblers:
    - On prompt load: verify file exists, is non-empty, contains expected template variables (warn if missing but don't fail)
    - On file read error: log error to Fastify logger, fall back to last-known-good cached version
    - If no cached version exists and file is missing: throw with clear error message

- [x] Task 3: Refactor model selection to use external config (AC: #3, #4)
  - [x] 3.1 Modify `apps/backend/src/plugins/tutor/services/anthropic.ts`:
    - Import `loadModelRoutingConfig` from config-loader
    - Replace hardcoded `HAIKU_MODEL` and `SONNET_MODEL` constants with config values
    - Replace hardcoded `selectModel()` logic with config-driven rule evaluation:
      ```typescript
      // IMPORTANT: selectModel() currently returns TutorModel type — preserve this return type
      function selectModel(context: TutorContext): TutorModel {
        const config = loadModelRoutingConfig()
        for (const rule of config.routing_rules) {
          if (matchesCondition(rule, context)) {
            return config.models[rule.model] as TutorModel
          }
        }
        return config.models[config.default_model] as TutorModel
      }

      function matchesCondition(rule: ModelRoutingRule, context: TutorContext): boolean {
        switch (rule.condition) {
          case 'stuck_intervention':
            return context.isStuckIntervention === true
          case 'compile_errors':
            return context.hasCompileErrors === true
          case 'explain_pattern':
            // CRITICAL: Use word-boundary regex to match current behavior
            // Current code uses /\b(explain|what is|...)\b/i
            // Do NOT use .includes() — it would false-positive on "explaining", "inexplicable", etc.
            if (!context.userMessage || !rule.patterns?.length) return false
            const pattern = new RegExp(`\\b(${rule.patterns.join('|')})\\b`, 'i')
            return pattern.test(context.userMessage)
          default:
            return false
        }
      }
      ```
    - Keep `TTFT_TIMEOUT_MS` and `STREAM_TIMEOUT_MS` as env-var-configurable (already done via `MCC_TUTOR_TTFT_TIMEOUT_MS`)
  - [x] 3.2 Update tests in `apps/backend/src/plugins/tutor/services/anthropic.test.ts`:
    - Mock `loadModelRoutingConfig` to return test config
    - Test that model selection follows config rules in order
    - Test fallback to default model when no rules match
    - Test that invalid config falls back to bundled defaults

- [x] Task 4: Add cache invalidation to prompt and content loaders (AC: #4)
  - [x] 4.1 Add `resetPromptCache()` method to `apps/backend/src/plugins/tutor/services/context-assembler.ts`:
    - Clear the in-memory cached prompt template
    - Next `assembleContext()` call will re-read from filesystem
  - [x] 4.2 Add `resetPromptCache()` method to `apps/backend/src/plugins/tutor/services/stuck-context-assembler.ts`:
    - Same pattern as regular context assembler
  - [x] 4.3 `invalidateCache()` and `invalidateAllCaches()` already exist in `content-loader.ts` — wired to admin reload via DI in `app.ts`:
    - Delete Redis cache keys for milestone metadata (stuck detection thresholds)
    - Redis cache key pattern: `curriculum:milestone:${slug}` with 3600s TTL
    - For specific milestone: `redis.del(`curriculum:milestone:${slug}`)`
    - For all milestones: use `redis.keys('curriculum:milestone:*')` then `redis.del(...keys)` (safe at MVP scale — few milestones)
    - Accept optional `milestoneSlug` parameter to invalidate specific milestone or all
    - Next API request will re-read from filesystem and re-cache
    - **Note:** `StuckDetectionMetadata` interface is defined locally in `content-loader.ts` (raw YAML shape), separate from the API-facing `StuckDetectionConfig` in `packages/shared/src/types/curriculum.ts`. Do not conflate these types.

- [x] Task 5: Create admin reload endpoints (AC: #4, #5)
  - [x] 5.1 Create `apps/backend/src/plugins/admin/routes/reload-config.ts`:
    - `POST /admin/reload-prompts` — reloads tutor prompt templates:
      - Call `resetPromptCache()` on both context assemblers
      - Validate prompt files exist and are non-empty
      - Return `{ reloaded: ['tutor-base.md', 'stuck-intervention.md'], timestamp: ISO8601 }`
      - Log reload event to Fastify logger
    - `POST /admin/reload-config` — reloads all external configuration:
      - Call `resetModelRoutingConfigCache()` to reload model routing
      - Call `invalidateContentCache()` to clear stuck detection threshold cache
      - Call `resetPromptCache()` on both context assemblers
      - Validate all configs, return validation results
      - Return `{ reloaded: ['model-routing', 'prompts', 'content-cache'], errors: [], timestamp: ISO8601 }`
    - Both routes protected by existing admin basic auth (same as Bull Board)
    - Use JSON Schema validation at the route level per project conventions
  - [x] 5.2 Register reload routes in `apps/backend/src/plugins/admin/index.ts`:
    - Extend `AdminPluginOptions` interface with `resetTutorCaches` and `invalidateContentCache` function options
    - Import and register the reload-config routes under `/admin/` prefix
    - Pass the injected functions to the route handler
    - Basic auth is inherited automatically — routes registered under the admin plugin scope are protected by `@fastify/basic-auth` (already configured)

- [x] Task 6: Add tests for new functionality (AC: #1-#6)
  - [x] 6.1 Create `apps/backend/src/plugins/tutor/services/config-loader.test.ts`:
    - Test loading valid model-routing.yaml
    - Test validation rejects invalid config (missing fields, invalid model refs)
    - Test fallback to default config on invalid file
    - Test fallback to default config on missing file
    - Test cache behavior: loads once, returns cached on subsequent calls
    - Test `resetModelRoutingConfigCache()` forces re-read
    - Test `explain_pattern` rule with custom patterns list
  - [x] 6.2 Create `apps/backend/src/plugins/admin/reload-config.test.ts`:
    - Test `POST /admin/reload-prompts` returns success with reloaded files
    - Test `POST /admin/reload-config` returns success with all reloaded components
    - Test both routes require basic auth (401 without credentials)
    - Test validation errors are returned in response
    - Use `fastify.inject()` for route testing (project convention)
  - [x] 6.3 Update existing context assembler tests to cover cache invalidation:
    - Test that `resetPromptCache()` causes re-read from filesystem
    - Test that invalid prompt file triggers fallback behavior

- [x] Task 7: Update documentation (AC: #1-#6)
  - [x] 7.1 Add "External Configuration" section to `docs/monitoring-setup.md`:
    - Document the three configuration files and their locations
    - Document the admin reload endpoints with curl examples:
      ```bash
      # Reload prompt templates only
      curl -X POST -u admin:$MCC_ADMIN_PASSWORD http://localhost:3001/admin/reload-prompts

      # Reload all configuration (prompts + model routing + stuck detection cache)
      curl -X POST -u admin:$MCC_ADMIN_PASSWORD http://localhost:3001/admin/reload-config
      ```
    - Document the model routing config format and how to add new rules
    - Document stuck detection threshold configuration per milestone
    - Document validation behavior and fallback defaults

## Dev Notes

### Architecture Compliance

- **Admin basic auth** reused from existing Bull Board setup — same `MCC_ADMIN_USER` / `MCC_ADMIN_PASSWORD` env vars
- **No custom admin UI** — configuration via file edits + curl to reload endpoint
- **Plugin isolation** — config-loader is within tutor plugin, reload routes within admin plugin. Admin plugin calls tutor services via injected references (dependency injection per project conventions)
- **File-based configuration** per architecture spec — NOT database tables

### Current Implementation Analysis

**Tutor Prompts (`content/prompts/`):**
- `tutor-base.md` — loaded by `context-assembler.ts` via `fs.readFile()`, cached in-memory as module-level variable `let cachedBasePrompt: string | null = null`
- `stuck-intervention.md` — loaded by `stuck-context-assembler.ts`, same pattern: `let cachedPromptTemplate: string | null = null`
- Path resolution: both assemblers use a `promptsRoot` parameter (typically `content/prompts/`) passed via tutor plugin options during registration — do NOT hardcode the path
- Template variables: `{{milestone_brief}}`, `{{current_code}}`, `{{criteria_status}}`, `{{user_background}}`, `{{available_explainers}}`, `{{stuck_criterion}}`, `{{time_stuck_minutes}}`, `{{recent_diffs}}`
- Test fixtures at `apps/backend/src/plugins/tutor/services/__fixtures__/prompts/`
- **What to change:** Add `resetPromptCache()` to clear the module-level cached template string

**Stuck Detection Thresholds (`content/milestones/{slug}/metadata.yaml`):**
- Loaded by `content-loader.ts` via `fs.readFile()`, cached in Redis with 3600s TTL
- Served via curriculum API → frontend reads on workspace mount
- Frontend fallback: `{ thresholdMinutes: 10, stage2OffsetSeconds: 60 }`
- **What to change:** Add Redis cache invalidation method. Thresholds are ALREADY external and per-milestone — just need cache bust on admin reload.

**Model Routing (`anthropic.ts`):**
- Constants: `HAIKU_MODEL = 'claude-haiku-4-5-20251001'`, `SONNET_MODEL = 'claude-sonnet-4-6-20250514'`
- Type: `TutorModel` — branded string type used as return type of `selectModel()`. Preserve this type in refactored version.
- `TutorContext` type: `{ readonly userMessage: string; readonly hasCompileErrors: boolean; readonly isStuckIntervention?: boolean }`
- `selectModel()` function with hardcoded if/else logic:
  1. `isStuckIntervention` → Sonnet
  2. `hasCompileErrors` → Sonnet
  3. message matches `EXPLAIN_PATTERNS` regex `/\b(explain|what is|how does|why does|what happens|how would)\b/i` → Sonnet
  4. else → Haiku
- `selectModel()` is called in `createTutorResponse()` and `createStreamingTutorResponse()` methods
- **What to change:** Extract to `content/prompts/model-routing.yaml`, load via config-loader, replace hardcoded logic with config-driven rule evaluation. MUST preserve word-boundary regex behavior and `TutorModel` return type.

### Dependency Injection Pattern for Admin → Tutor Communication

The admin plugin needs to call `resetPromptCache()` on tutor services. The existing admin plugin uses an options-based DI pattern (`AdminPluginOptions` accepts `executionQueue` and `exportQueue`). Extend this same pattern for cache reset functions — do NOT use Fastify decorations, as that creates a registration-order dependency (admin could register before tutor, causing the decoration to not exist).

**Preferred approach — extend `AdminPluginOptions`:**

```typescript
// In admin plugin options interface (apps/backend/src/plugins/admin/index.ts):
interface AdminPluginOptions {
  executionQueue?: Queue
  exportQueue?: Queue
  // NEW: Cache reset functions injected by the app bootstrap
  resetTutorCaches?: () => Promise<void>
  invalidateContentCache?: (milestoneSlug?: string) => Promise<void>
}

// In app.ts (or wherever plugins are registered), wire them up:
await fastify.register(adminPlugin, {
  executionQueue,
  exportQueue,
  resetTutorCaches: async () => {
    resetPromptCache()              // from context-assembler
    resetStuckPromptCache()         // from stuck-context-assembler
    resetModelRoutingConfigCache()  // from config-loader
  },
  invalidateContentCache: async (slug?) => {
    await contentLoader.invalidateCache(slug)
  }
})
```

This keeps plugins decoupled — admin plugin doesn't import from tutor or curriculum internals. The app bootstrap wires dependencies, matching the existing `executionQueue`/`exportQueue` pattern.

### Config Validation Strategy

**Model routing config validation:**
- `models` object must have `haiku` and `sonnet` string fields
- `default_model` must be `'haiku'` or `'sonnet'`
- `routing_rules` must be an array
- Each rule must have `condition` (valid enum value) and `model` (valid reference)
- `explain_pattern` rules must have non-empty `patterns` array
- Validation errors: log to Fastify logger (Sentry captures errors), return error list, use cached/default config

**Prompt template validation:**
- File must exist and be non-empty
- Warn (don't fail) if expected template variables are missing
- On read error: use last-known-good cached value, or throw if no cache exists

### Package Dependencies

- `js-yaml` — confirmed direct dependency of `apps/backend`: `"js-yaml": "^4.1.1"` in `apps/backend/package.json`, with `"@types/js-yaml": "^4.0.9"` as dev dependency. No installation needed.
- `@fastify/basic-auth` — already a dependency of the admin plugin. New admin routes registered under the admin plugin scope automatically inherit basic auth protection — no additional auth code needed.
- No new external dependencies required.

### Project Structure Notes

**Files to CREATE:**
```
content/prompts/model-routing.yaml                                    # NEW: Model routing configuration
apps/backend/src/plugins/tutor/services/config-loader.ts              # NEW: Config loading + validation
apps/backend/src/plugins/tutor/services/config-loader.test.ts         # NEW: Config loader tests
apps/backend/src/plugins/admin/routes/reload-config.ts                # NEW: Admin reload endpoints
apps/backend/src/plugins/admin/reload-config.test.ts                  # NEW: Admin reload tests
```

**Files to MODIFY:**
```
apps/backend/src/plugins/tutor/services/anthropic.ts                  # Refactor selectModel() to use config
apps/backend/src/plugins/tutor/services/context-assembler.ts          # Add resetPromptCache()
apps/backend/src/plugins/tutor/services/stuck-context-assembler.ts    # Add resetPromptCache()
apps/backend/src/plugins/curriculum/content-loader.ts                 # Add invalidateContentCache()
apps/backend/src/plugins/admin/index.ts                               # Register reload routes + decorations
apps/backend/src/plugins/tutor/index.ts                               # Add Fastify decoration for cache reset
packages/shared/src/types/curriculum.ts                               # Add ModelRoutingConfig types
docs/monitoring-setup.md                                              # Add external configuration docs
```

**Files NOT to touch:**
- `apps/webapp/` — no frontend changes (thresholds already served via API)
- `apps/website/` — no landing page changes
- Database migrations — no schema changes
- `apps/backend/src/plugins/tutor/routes/` — no route logic changes (model selection is in service layer)

### Testing Strategy

- Config loader tests: mock filesystem reads, test validation logic, test caching and reset
- Admin route tests: `fastify.inject()` per project convention, test auth enforcement, test reload responses
- Context assembler tests: verify `resetPromptCache()` causes re-read
- Anthropic service tests: extend existing `apps/backend/src/plugins/tutor/services/anthropic.test.ts` — mock config-loader, verify config-driven model selection preserves `TutorModel` return type
- All tests use `it()`, `vi.fn()`, `vi.mock()`, `vi.restoreAllMocks()` in `afterEach`

### Constraints & Anti-Patterns

**Do NOT:**
- Create database tables for configuration — file-based per architecture
- Build a custom admin UI for config editing — file edits + curl per architecture
- Add hot-reloading via file watchers (chokidar) — admin endpoint is explicit and predictable
- Create new Fastify plugins — add routes within existing admin plugin
- Import from tutor plugin internals in admin plugin — use Fastify decorations
- Use `any` types for parsed YAML — define proper TypeScript interfaces

**Do:**
- Follow existing content-loader patterns for YAML parsing
- Use existing admin basic auth mechanism
- Keep fallback defaults bundled with codebase
- Log all validation errors to Fastify logger (flows to Sentry)
- Test against real filesystem (mock only for error cases)

### Previous Story (10.4) Intelligence

Key learnings from Story 10.4:
- Added 6 database views via migration — different pattern from this story (no migrations needed here)
- Documented in `docs/monitoring-setup.md` — add configuration section there
- Code review findings: add type guards before `.map()`, add `toBeDefined()` before property assertions
- All Epic 10 stories follow pattern of minimal application code, leveraging existing infrastructure

### Git Intelligence

Recent commits follow pattern: `Implement Story X.Y: Brief description with code review fixes`

Files from recent commits relevant to this story:
- `apps/backend/src/plugins/admin/index.ts` — existing admin plugin to extend
- `apps/backend/src/plugins/tutor/services/` — services to modify for cache invalidation
- `content/prompts/` — existing prompt directory to add model-routing.yaml
- `docs/monitoring-setup.md` — existing docs to extend

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-10, Story 10.5 — Acceptance criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md#Configuration-Management — File-based config, MCC_ prefix]
- [Source: _bmad-output/planning-artifacts/architecture.md#AI-Tutor-Integration — Tutor prompt loading, model routing, stuck detection]
- [Source: _bmad-output/planning-artifacts/architecture.md#Admin-Toolkit — POST /admin/reload-prompts endpoint]
- [Source: _bmad-output/planning-artifacts/prd.md#FR56 — External configuration for tutor and stuck detection]
- [Source: _bmad-output/project-context.md#Framework-Rules — Plugin isolation, Fastify decoration pattern]
- [Source: _bmad-output/project-context.md#Testing-Rules — Co-located tests, it() not test(), fastify.inject()]
- [Source: apps/backend/src/plugins/tutor/services/anthropic.ts — Current hardcoded model selection]
- [Source: apps/backend/src/plugins/tutor/services/context-assembler.ts — Current prompt caching]
- [Source: apps/backend/src/plugins/tutor/services/stuck-context-assembler.ts — Stuck prompt caching]
- [Source: apps/backend/src/plugins/curriculum/content-loader.ts — Content loading with Redis cache]
- [Source: apps/backend/src/plugins/admin/index.ts — Admin plugin with basic auth]
- [Source: content/prompts/tutor-base.md — Tutor base prompt template]
- [Source: content/prompts/stuck-intervention.md — Stuck intervention prompt template]
- [Source: content/milestones/01-kv-store/metadata.yaml — Per-milestone stuck detection config]
- [Source: packages/shared/src/types/curriculum.ts — StuckDetectionConfig type]
- [Source: apps/webapp/src/hooks/use-stuck-detection.ts — Frontend stuck detection hook]
- [Source: _bmad-output/implementation-artifacts/10-4-analytics-and-reporting.md — Previous story patterns]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Externalized model routing rules from hardcoded `selectModel()` in `anthropic.ts` to `content/prompts/model-routing.yaml` with config-driven rule evaluation
- Added `ModelRoutingConfig`, `ModelRoutingRule`, `ModelRoutingCondition` types to `@mycscompanion/shared`
- Created config-loader service with YAML parsing, validation, in-memory caching, and bundled default fallback
- Added `resetPromptCache()` to both `ContextAssembler` and `StuckContextAssembler` interfaces + implementations
- Added prompt template validation: checks for empty files and missing template variables (warn, don't fail)
- Created `POST /admin/reload-prompts` and `POST /admin/reload-config` endpoints in admin plugin
- Refactored admin plugin from `/admin/queues` prefix to `/admin` prefix; Bull Board routes now at sub-prefix `/queues`
- Used DI pattern: context assemblers created in `app.ts`, cache reset functions passed to admin plugin via `AdminPluginOptions`
- Content-loader cache invalidation (`invalidateCache`/`invalidateAllCaches`) already existed — wired to admin reload
- 535 tests pass (0 regressions), 65 new test assertions across 3 new test files + 2 updated test files

### Change Log

- 2026-03-15: Implemented Story 10.5 — External configuration for tutor and stuck detection

### File List

**Created:**
- `content/prompts/model-routing.yaml` — Model routing configuration (externalized from hardcoded logic)
- `apps/backend/src/plugins/tutor/services/config-loader.ts` — Config loading, validation, caching
- `apps/backend/src/plugins/tutor/services/config-loader.test.ts` — Config loader tests (18 tests)
- `apps/backend/src/plugins/admin/routes/reload-config.ts` — Admin reload route handlers
- `apps/backend/src/plugins/admin/reload-config.test.ts` — Admin reload route tests (6 tests)

**Modified:**
- `packages/shared/src/types/curriculum.ts` — Added ModelRoutingConfig types
- `apps/backend/src/plugins/tutor/services/anthropic.ts` — Refactored selectModel() to use config-loader
- `apps/backend/src/plugins/tutor/services/anthropic.test.ts` — Added config-driven model selection tests (5 new tests)
- `apps/backend/src/plugins/tutor/services/context-assembler.ts` — Added resetPromptCache(), prompt validation, logger
- `apps/backend/src/plugins/tutor/services/context-assembler.test.ts` — Added cache invalidation test
- `apps/backend/src/plugins/tutor/services/stuck-context-assembler.ts` — Added resetPromptCache(), prompt validation, logger
- `apps/backend/src/plugins/tutor/services/stuck-context-assembler.test.ts` — Added cache invalidation test
- `apps/backend/src/plugins/admin/index.ts` — Extended AdminPluginOptions, registered reload routes, refactored prefix
- `apps/backend/src/app.ts` — Created assemblers externally, wired DI for admin cache reset, changed admin prefix
- `apps/backend/src/plugins/tutor/routes/degradation.test.ts` — Added resetPromptCache to mocks
- `apps/backend/src/plugins/tutor/routes/health.test.ts` — Added resetPromptCache to mocks
- `apps/backend/src/plugins/tutor/routes/history.test.ts` — Added resetPromptCache to mocks
- `apps/backend/src/plugins/tutor/routes/message.test.ts` — Added resetPromptCache to mocks
- `apps/backend/src/plugins/tutor/routes/stream.test.ts` — Added resetPromptCache to mocks
- `apps/backend/src/plugins/tutor/routes/stuck-intervention.test.ts` — Added resetPromptCache to mocks
- `docs/monitoring-setup.md` — Added External Configuration section
