# Todo: CodeRabbit-Parity Review Bot

> Checklist view of `tasks/plan.md`. Work top-to-bottom; stop at each checkpoint for verification + human review.

## Phase 1 — Structured Findings Foundation
- [x] Task 1: `ReviewFinding` type + `parseFindingsResponse` + new prompt contract (S) — done 2026-06-11, 10 unit tests
- [x] Task 2: Severity threshold + max-findings filtering, new task inputs (S) — done 2026-06-11, 8 unit tests
- [ ] **Checkpoint A:** typecheck + tests clean; `devscripts:ai` emits typed filtered findings; schema frozen after human review

## Phase 2 — Azure DevOps Inline Comments
- [x] Task 3: Verify + finish ADO inline flow, optional suggestion, path normalization, gate warning fixed (M) — done 2026-06-11, 6 unit tests; ⚠️ manual line-anchor check on a real ADO test PR still pending
- [x] Task 4: Shared severity-aware thread formatter for ADO + GitHub (S) — done 2026-06-11, 3 unit tests
- [ ] **Checkpoint B:** both providers show correct severity-tagged inline comments on test PRs

## Phase 3 — Updatable Walkthrough Summary
- [x] Task 5: `findBotComment` + `updatePullRequestComment` in both providers (M) — done 2026-06-11, 7 unit tests
- [x] Task 6: Walkthrough prompt (status + file table) with upsert via hidden marker; upsert default-on when suggestion mode enabled (M) — done 2026-06-11, 8 unit tests
- [ ] **Checkpoint C:** repeated runs edit one summary comment, never stack

## Phase 4 — Dedup + Thread Resolution
- [x] Task 7: Finding fingerprints (`<!-- ai-review:fp:... -->`) + skip re-posting (M) — done 2026-06-11, 9 unit tests
- [x] Task 8: Auto-resolve fixed findings; never touch threads with human replies (M) — done 2026-06-11, 7 unit tests; Azure DevOps only (GitHub REST API cannot resolve review threads)
- [ ] **Checkpoint D:** full lifecycle — review → fix → re-review shows dedup + resolution

## Phase 5 — Per-Repo Config + Context Ladder
- [x] Task 9: `.aireview.yml` loader with precedence + safe fallback (M) — done 2026-06-11, 10 unit tests; bundle 4.05 MB after js-yaml
- [x] Task 10: Full file content for small files (≤200 lines) appended after diff in throttle mode (S) — done 2026-06-11, 2 unit tests
- [x] Task 11: PR intent block (title/description) in both prompts (S) — done 2026-06-11, 5 unit tests; linked work items deferred
- [ ] **Checkpoint E:** pilot repo end-to-end; token-cost delta measured

## Phase 6 — Chunked Review
- [ ] Task 12a: Chunk splitter + size budget (M)
- [ ] Task 12b: Parallel chunk execution + aggregation pass (M)
- [ ] **Checkpoint F:** 50-file synthetic PR reviewed without truncation; regression pass A–E

## Phase 7 — Conversational (design only)
- [ ] Task 13: OpenSpec proposal — webhook service vs. iteration-time replies (S, no code)

## Decisions (resolved 2026-06-11)
- [x] Default severity threshold: `warning`
- [x] Upsert summary: default-on only when suggestion mode is enabled; append behavior otherwise
- [x] Config filename confirmed: `.aireview.yml`
- [x] Versioning: single jump to v2.0.0 after all phases complete (work on feature branch until Checkpoint F)
