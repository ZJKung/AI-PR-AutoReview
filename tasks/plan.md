# Implementation Plan: CodeRabbit-Parity Review Bot (Tiers 1–2)

> Derived from `docs/feature-roadmap.md` (2026-06-11). Covers build-order items 1–6 plus a
> design spike for the conversational tier. Each task is a vertical slice that leaves the
> system shippable.

## Overview

Evolve AI-PR-AutoReview from "one summary comment + GitHub-only suggestions" into a stateful
review bot: structured findings with severity filtering, inline comments on Azure DevOps,
an updatable walkthrough summary, deduplication across pushes with auto-resolution, per-repo
configuration, richer context, and chunked review for large PRs.

## Current-State Facts (verified in code)

- Suggestion flow: `src/index.ts:497-583` (`generateSuggestions`) parses a `{file, line, comment, suggestion}`
  JSON array (`parseSuggestionsResponse`, `src/index.ts:462-486`) produced under
  `SUGGESTION_SYSTEM_INSTRUCTION` (`src/index.ts:23-46`), using `[L<N>]` annotated diffs
  (`parsePatchWithLineNumbers`, `src/index.ts:428-457`).
- **Azure DevOps inline comments already half-exist**: `azure-devops.service.ts:194`
  (`addInlineSuggestionComment` via `createThread` + `threadContext`) and `:246` (`getRawPatches`
  via local diff of old/new blob content). `run()` gates on function existence
  (`src/index.ts:671`), so ADO may already pass the gate — Phase 2 is *verify + finish*, not greenfield.
- No comment **update/read-back** capability exists anywhere (no `updateThread`/`getThreads` usage) —
  required for walkthrough upsert (Phase 3) and dedup/resolution (Phase 4).
- `src/task.json` has 21 inputs; must stay synchronized with `dist/task.json` (project convention).
- Tests: mocha + sinon; gates: `npm run typecheck`, `npm test`; local simulation: `npm run devscripts:ai`.

## Architecture Decisions

- **Findings schema is the foundation.** Extend the existing suggestion JSON contract to
  `ReviewFinding {file, line, severity, category, finding, suggestion?}` rather than inventing a
  parallel pipeline — `generateSuggestions` becomes `generateFindings` and all later phases
  (filtering, vote, dedup, metrics) consume the same type.
- **Suggestion optional per finding.** Not every finding has a mechanical fix; `suggestion` becomes
  optional so the model can flag issues without forcing a replacement line (GitHub: plain review
  comment when absent; ADO: thread without "Suggested change" block).
- **State lives in the PR, not external storage.** Fingerprints embedded as hidden HTML comments
  (`<!-- ai-review:fp:... -->`) in thread bodies; the bot re-reads its own threads each run.
  No new infrastructure.
- **Per-repo config overrides task inputs** (`.aireview.yml` at repo root), because repo owners,
  not pipeline authors, know their codebase. Task inputs remain the defaults.
- **Stay pipeline-task-only through Phase 6.** The webhook/service decision (conversational tier)
  is deferred to a design spike (Task 13) — everything before it works as a build-validation task.

---

## Task List

### Phase 1 — Structured Findings Foundation (roadmap #2)

#### Task 1: `ReviewFinding` type + parser + prompt contract

**Description:** Introduce `ReviewFinding` interface (`file`, `line`, `severity: 'critical'|'warning'|'nit'`,
`category: 'bug'|'security'|'perf'|'style'`, `finding`, `suggestion?`) in a new
`src/interfaces/review-finding.interface.ts`. Rewrite `SUGGESTION_SYSTEM_INSTRUCTION` to demand the
new fields (suggestion optional). Replace `parseSuggestionsResponse` with `parseFindingsResponse`
that validates severity/category enums, tolerates missing `suggestion`, and drops malformed items
with a warning.

**Acceptance criteria:**
- [ ] Valid LLM output parses into typed `ReviewFinding[]`; invalid severity/category items are dropped, not fatal
- [ ] Missing `suggestion` is accepted; missing `file`/`line`/`finding` rejects the item
- [ ] Old-format responses (no severity) fail gracefully to an empty array with a clear log line

**Verification:**
- [ ] Unit tests for parser (valid, partial, malformed, empty, old-format) pass: `npm test`
- [ ] `npm run typecheck` clean
- [ ] `npm run devscripts:ai` shows the model emitting the new schema

**Dependencies:** None
**Files likely touched:** `src/interfaces/review-finding.interface.ts` (new), `src/index.ts`, `test/` (new parser tests)
**Estimated scope:** S

#### Task 2: Severity threshold filtering + new task inputs

**Description:** Add `inputSeverityThreshold` (default `warning`) and `inputMaxFindings` (default 20)
to `src/task.json` (+ `dist/task.json` sync) and `PipelineInputs`. Filter parsed findings before
posting: below-threshold findings are logged but not posted; cap total posted findings, keeping
highest severity first.

**Acceptance criteria:**
- [ ] `nit` findings are not posted when threshold is `warning`; all severities post when threshold is `nit`
- [ ] More than `maxFindings` parsed → only top-N by severity posted, log states how many were withheld
- [ ] Defaults apply when inputs are absent (existing pipelines unaffected)

**Verification:**
- [ ] Unit tests for the filter (ordering, cap, threshold boundaries) pass: `npm test`
- [ ] `npm run typecheck` clean; `src/task.json` and `dist/task.json` diff-identical for the new inputs

**Dependencies:** Task 1
**Files likely touched:** `src/task.json`, `dist/task.json`, `src/interfaces/pipeline-inputs.interface.ts`, `src/index.ts`, tests
**Estimated scope:** S

### Checkpoint A — Foundation
- [ ] `npm run typecheck` + `npm test` clean
- [ ] `devscripts:ai` round-trip produces filtered, typed findings against a synthetic diff
- [ ] Human review of schema + prompt before building consumers on top

---

### Phase 2 — Azure DevOps Inline Comments (roadmap #1)

#### Task 3: Verify + finish ADO inline flow end-to-end

**Description:** The ADO implementation exists (`azure-devops.service.ts:194`, `:246`) but is
unproven: confirm `run()`'s capability gate passes for ADO, fix the misleading
"only supported for GitHub" warning (`src/index.ts:672`), verify `[L<N>]` line numbers from
locally-generated diffs anchor correctly in `threadContext` (right-side line), and handle
path normalization (ADO paths lead with `/`, LLM echoes the prompt's path form). Add a
devscript to exercise the flow against a test PR.

**Acceptance criteria:**
- [ ] Suggestion mode on an ADO test PR posts inline threads at the correct file + line for added and context lines
- [ ] Findings without `suggestion` post as a plain comment thread (no empty "Suggested change" block)
- [ ] A finding referencing a file path variant (leading `/` or not) still anchors correctly

**Verification:**
- [ ] Manual check on a synthetic test PR in ADO (synthetic code only — no real customer data)
- [ ] Existing GitHub suggestion path still works (regression check via devscript or test PR)
- [ ] `npm test` + `npm run typecheck` clean

**Dependencies:** Task 1 (posts `ReviewFinding`s)
**Files likely touched:** `src/index.ts`, `src/services/azure-devops.service.ts`, `devscripts/`
**Estimated scope:** M

#### Task 4: Severity-aware thread formatting

**Description:** Format inline thread bodies from finding metadata: severity emoji + category tag
(`🔴 [bug]`, `⚠️ [security]`, `💡 [style]`…) above the explanation, "Suggested change" block only
when `suggestion` present. Same formatter shared by ADO and GitHub services.

**Acceptance criteria:**
- [ ] Thread body shows severity emoji + category consistently on both providers
- [ ] Formatter is a single shared function (no provider-specific duplication)

**Verification:**
- [ ] Unit test for formatter output per severity/category/suggestion-presence: `npm test`
- [ ] Visual check on test PRs (both providers)

**Dependencies:** Tasks 1, 3
**Files likely touched:** `src/index.ts` (or new `src/services/finding-formatter.ts`), both devops services, tests
**Estimated scope:** S

### Checkpoint B — Inline parity
- [ ] ADO and GitHub test PRs both show filtered, severity-tagged inline comments
- [ ] No duplicate or mis-anchored comments on a multi-file synthetic PR
- [ ] Human review before adding stateful behavior

---

### Phase 3 — Updatable Walkthrough Summary (roadmap #3)

#### Task 5: Comment read-back + update capability in both providers

**Description:** Extend `DevOpsService` with `findBotComment(marker)` and `updatePullRequestComment(commentId, content)`.
ADO: `getThreads` + `updateComment`; GitHub: list issue comments + `octokit.issues.updateComment`.
Bot comments carry a hidden marker (`<!-- ai-review:summary -->`) for discovery.

**Acceptance criteria:**
- [ ] `findBotComment` returns the bot's prior summary comment ID or null on both providers
- [ ] `updatePullRequestComment` replaces content in place (same comment ID, no new comment)

**Verification:**
- [ ] Unit tests with mocked APIs (sinon) for find/update on both services: `npm test`
- [ ] `npm run typecheck` clean

**Dependencies:** None (parallel-safe with Phase 2)
**Files likely touched:** `src/interfaces/devops-service.interface.ts`, both devops services, tests
**Estimated scope:** M

#### Task 6: Walkthrough summary prompt + upsert behavior

**Description:** Replace the free-form summary with a structured walkthrough: status line
(🟢/🟡/🔴), "what changed" paragraph, file-by-file table. On re-run, find the existing summary via
marker and update it instead of posting a new one (fall back to create). Upsert defaults **on when
suggestion mode is enabled**; summary-only pipelines keep append behavior unless they opt in via
`inputUpdateExistingComment`.

**Acceptance criteria:**
- [ ] First run posts one summary comment with status + walkthrough table
- [ ] With suggestion mode on, second run on the same PR edits that comment; comment count does not grow
- [ ] With suggestion mode off and no explicit opt-in, old append behavior is preserved
- [ ] Explicit `inputUpdateExistingComment` value overrides the suggestion-mode-derived default

**Verification:**
- [ ] Two consecutive runs against an ADO test PR: exactly one bot summary exists, content reflects latest push
- [ ] `npm test` + `npm run typecheck` clean; `task.json`/`dist/task.json` in sync

**Dependencies:** Task 5
**Files likely touched:** `src/index.ts`, `src/task.json`, `dist/task.json`, `src/interfaces/pipeline-inputs.interface.ts`
**Estimated scope:** M

### Checkpoint C — Stateless → stateful boundary
- [ ] Repeated runs do not stack summary comments
- [ ] Human review: walkthrough content quality on a real-ish (synthetic) PR

---

### Phase 4 — Dedup + Thread Resolution (roadmap #4)

#### Task 7: Finding fingerprints + skip re-posting

**Description:** Fingerprint each finding (hash of normalized file + line-bucket + category +
normalized finding text) embedded as `<!-- ai-review:fp:<hash> -->` in the thread body. Before
posting, read existing bot threads, collect fingerprints, and skip findings already present.

**Acceptance criteria:**
- [ ] Re-running review on an unchanged PR posts zero new inline threads
- [ ] A genuinely new finding on the next push still posts
- [ ] Fingerprint survives minor LLM re-phrasings (normalization tested)

**Verification:**
- [ ] Unit tests for fingerprint stability/normalization: `npm test`
- [ ] Manual: run task twice on the same ADO test PR iteration → no duplicates

**Dependencies:** Tasks 3, 5 (thread read-back)
**Files likely touched:** new `src/services/finding-state.ts`, `src/index.ts`, both devops services, tests
**Estimated scope:** M

#### Task 8: Auto-resolve fixed findings

**Description:** After a new iteration's findings are computed, close bot threads whose fingerprint
no longer appears and whose anchored line changed in the new diff (ADO: thread status → fixed/closed;
GitHub: resolve review thread). Conservative rule: only resolve threads the bot created.

**Acceptance criteria:**
- [ ] Pushing a commit that fixes a flagged line resolves that thread on the next run
- [ ] Threads with human replies are **not** auto-resolved (left for humans)
- [ ] Non-bot threads are never touched

**Verification:**
- [ ] Manual scenario on ADO test PR: flag → fix → re-run → thread resolved
- [ ] Unit tests for the resolve-decision logic: `npm test`

**Dependencies:** Task 7
**Files likely touched:** `src/services/finding-state.ts`, both devops services, `src/index.ts`, tests
**Estimated scope:** M

### Checkpoint D — Stateful bot
- [ ] Full lifecycle on one PR: review → push fix → re-review shows dedup + resolution working
- [ ] Human review before adoption-facing config work

---

### Phase 5 — Per-Repo Config + Context Ladder (roadmap #7, #5)

#### Task 9: `.aireview.yml` loader

**Description:** Load optional `.aireview.yml` from repo root (via existing file-content APIs or
build checkout): path include/exclude globs, severity threshold, per-glob extra instructions,
language. Config overrides task inputs; absence = no behavior change. Add `js-yaml`
(esbuild-bundled; watch package size constraint).

**Acceptance criteria:**
- [ ] Repo with `.aireview.yml` overrides threshold/filters; repo without it behaves exactly as before
- [ ] Per-glob instructions are injected only for findings prompts covering matching files
- [ ] Malformed YAML logs a warning and falls back to task inputs (never fails the build)

**Verification:**
- [ ] Unit tests: precedence, glob matching, malformed file fallback: `npm test`
- [ ] Bundle still packages: `npm run build` + extension package step succeeds

**Dependencies:** Task 2 (threshold plumbing)
**Files likely touched:** new `src/services/repo-config.service.ts`, `src/index.ts`, `package.json`, tests
**Estimated scope:** M

#### Task 10: Context ladder — full file content for small files

**Description:** In throttle mode, when a changed file is under N lines (default 200, configurable),
send full file content instead of hunks so the model sees surrounding context.

**Acceptance criteria:**
- [ ] Small changed files appear in the prompt in full; large files remain hunks-only
- [ ] Token usage logged per mode so the cost delta is observable

**Verification:**
- [ ] Unit test for the size-based selection; `devscripts:ai` comparison run
- [ ] `npm test` + `npm run typecheck` clean

**Dependencies:** None (parallel-safe with Task 9)
**Files likely touched:** both devops services, `src/index.ts`, tests
**Estimated scope:** S

#### Task 11: Context ladder — PR intent (title/description, linked work items)

**Description:** Fetch PR title + description (both providers; ADO optionally linked work-item
titles) and prepend an "intent" block to the review prompt so the model can flag
change-vs-intent mismatches.

**Acceptance criteria:**
- [ ] Prompt includes PR title/description when present; gracefully omits when empty
- [ ] Walkthrough summary references intent ("matches/doesn't match stated goal")

**Verification:**
- [ ] Manual check on a test PR with a deliberate intent mismatch
- [ ] `npm test` + `npm run typecheck` clean

**Dependencies:** Task 6 (summary prompt)
**Files likely touched:** both devops services, `src/index.ts`
**Estimated scope:** S

### Checkpoint E — Quality + adoption
- [ ] A pilot repo configured via `.aireview.yml` runs end-to-end with intent-aware review
- [ ] Token-cost delta measured and acceptable

---

### Phase 6 — Chunked Review (roadmap #6)

#### Task 12: Per-file chunking + aggregation pass

**Description:** When the assembled prompt exceeds a size budget, split changes into per-file
(or small file-group) chunks, request findings per chunk in parallel (bounded concurrency),
then run one aggregation call to dedupe cross-chunk findings and produce the walkthrough summary.
Removes the silent 15,000-char truncation cliff.

**Acceptance criteria:**
- [ ] A synthetic 50-file PR produces findings for late files (currently truncated away)
- [ ] Small PRs take the single-request path unchanged
- [ ] Chunk failures degrade gracefully (other chunks still post; failure logged)

**Verification:**
- [ ] Unit tests for chunk splitting + budget math; integration run via `devscripts:ai` on a large synthetic diff
- [ ] Token usage and request count logged per run

**Dependencies:** Tasks 1, 6
**Files likely touched:** new `src/services/chunking.service.ts`, `src/index.ts`, tests
**Estimated scope:** L → split during implementation into (a) splitter + budget, (b) parallel execution + aggregation

### Checkpoint F — Scale
- [ ] Large-PR synthetic benchmark reviewed end-to-end without truncation
- [ ] Full regression: Checkpoints A–E scenarios re-verified

---

### Phase 7 — Conversational Tier (roadmap #8/#9) — design spike only

#### Task 13: Architecture spike: webhook service vs. iteration-time replies

**Description:** Write an OpenSpec proposal (per project convention, `openspec/changes/...`)
comparing (a) Azure Function + service hook for real-time @mention replies vs. (b) pipeline-task
fallback that answers unanswered mentions on each new iteration build. Cover auth, hosting,
cost, and PHI/compliance posture (no repo code leaves approved LLM providers). **No code.**

**Acceptance criteria:**
- [ ] Proposal documents both options with trade-offs and a recommendation
- [ ] Validated against OpenSpec conventions; reviewed by the team before any Tier-3 build

**Dependencies:** Checkpoint D complete (thread read-back machinery informs feasibility)
**Estimated scope:** S (document only)

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM emits invalid/old-format JSON for findings | High | Strict parser with per-item validation + graceful empty fallback (Task 1); keep summary comment as independent path |
| Noisy inline comments hurt adoption | High | Severity threshold + max-findings cap ship **before** ADO inline enablement (Phase 1 before 2) |
| ADO `threadContext` line anchoring off-by-one (local diff vs. server view) | Medium | Dedicated manual verification matrix in Task 3 (added/context/first/last lines) |
| `task.json` ↔ `dist/task.json` drift | Medium | Sync check in every task touching inputs; consider a CI guard |
| Token cost growth (full files, chunking) | Medium | Log token usage per feature (Tasks 10, 12); thresholds configurable |
| Bundle size limit (new deps: js-yaml) | Low | Single small dep; verify package step in Task 9 |
| Auto-resolving threads a human is using | Medium | Conservative rule: never resolve threads with human replies (Task 8) |

## Parallelization

- **Parallel-safe:** Task 5 alongside Phase 2; Task 10 alongside Task 9.
- **Sequential:** Tasks 1→2 (schema before filter), 5→6 (capability before upsert), 7→8 (fingerprints before resolution).
- **Contract-first:** `ReviewFinding` (Task 1) is the shared contract — freeze it at Checkpoint A before parallel work begins.

## Decisions (resolved 2026-06-11)

1. **Default severity threshold: `warning`** — `nit` findings are withheld unless the user lowers the threshold.
2. **Walkthrough upsert defaults on only when suggestion mode is enabled** (`enableSuggestionMode = true`).
   Pipelines running plain summary-only mode keep today's append behavior unless they opt in via
   `inputUpdateExistingComment`. (Task 6 acceptance criteria updated accordingly.)
3. **Config filename confirmed: `.aireview.yml`** — now public API; document in README when Task 9 ships.
4. **Single version jump to v2.0.0** once all phases (1–6) are complete and verified. No intermediate
   minor releases; keep work on a feature branch / pre-release until Checkpoint F passes.
