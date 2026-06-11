# Feature Roadmap: CodeRabbit / Copilot-Review-Bot Parity

> Brainstorm captured 2026-06-11. Goal: evolve AI-PR-AutoReview from a single-summary-comment
> pipeline task into a full PR review bot comparable to GitHub Copilot code review and CodeRabbit.

## Current State (v1.1.5)

- Azure DevOps pipeline task (branch policy build validation) with GitHub auto-detection.
- One AI-generated **summary comment** per PR; **inline suggestions on GitHub only**
  (`src/index.ts:428-584`, `src/services/github-devops.service.ts`).
- Multi-provider LLM support (Gemini, OpenAI, Grok, Claude, GitHub Copilot, custom OpenAI-compatible)
  via strategy pattern (`src/services/ai-provider.service.ts`).
- Throttle mode (diff hunks only), incremental diff mode (latest push only), extension-based file filtering.
- Single-shot prompting, no chunking; response truncated at 15,000 chars.
- Custom system instructions (inline or file-based); no per-repo config file.
- No conversation/replies, no comment dedup across pushes, no severity model, no vote/gating.

Where CodeRabbit / Copilot review differ most: **inline comments everywhere, codebase context
beyond the diff, conversational follow-up, rich PR summaries, and per-repo configurability.**

---

## Tier 1 — Table Stakes (biggest visible gaps)

### 1. Inline comments on Azure DevOps PRs
The single biggest gap. Suggestion parsing and `[L<N>]` line mapping already exist for GitHub —
reuse them and post via ADO PR threads with `threadContext` (file path + right-side line range).
Most of the work is already done.

### 2. Structured findings schema
Move from free-text output to a schema:

```json
{ "file": "...", "line": 0, "severity": "critical|warning|nit",
  "category": "bug|security|perf|style", "finding": "...", "suggestion": "..." }
```

Unlocks filtering ("only post warnings and above"), vote/approve decisions, dedup, and metrics.
CodeRabbit's perceived quality largely comes from this filtering layer, not the model.
**Foundation for everything else — build first.**

### 3. PR summary block ("walkthrough")
High-level summary: what changed, file-by-file walkthrough table, optional sequence diagram.
One extra prompt over data already fetched. Post as a single **updatable** comment
(find and edit the bot's previous comment instead of stacking new ones on every push).

### 4. Review state across pushes (dedup + auto-resolve)
Pair existing incremental diff mode with comment dedup:
- Fingerprint each finding (file + line + rule) stored in a hidden HTML comment or thread properties.
- Skip re-posting known findings on the next iteration.
- **Resolve threads whose finding disappeared** in the new iteration.

This is what makes the bot feel stateful instead of spammy.

---

## Tier 2 — Context Quality (where review accuracy comes from)

### 5. Beyond-the-diff context (pragmatic ladder)
1. Include full file content when the file is under N lines; hunks otherwise.
2. Include PR title/description + linked work item text, so the model can check
   "does the change match the intent."
3. Lightweight symbol context — grep the repo for definitions of functions touched in the diff.
   (Full embeddings/RAG is Tier 4 territory.)

### 6. Chunked review for large PRs
Split per file (or per ~3 related files), review chunks in parallel, then run a final
aggregation pass to dedupe and write the summary. Fixes the silent-truncation quality cliff
on big PRs.

### 7. Per-repo config file (`.aireview.yml`)
Like `.coderabbit.yaml` — lets each team (not just the pipeline author) control:
- Path include/exclude filters
- Severity threshold for posting
- Custom instructions per path glob (e.g. `src/api/** → "check authz on every endpoint"`)
- Language and ignore rules

File-based system instruction loading already exists, so the plumbing half-exists.

---

## Tier 3 — Conversational + Agentic

### 8. Reply-to-comment / Q&A
Users @-mention the bot in a thread ("why is this a problem?") and it answers in-thread.
**Architecture decision required:** the extension is purely a pipeline task today; real-time
replies need a webhook component (service hook → Azure Function) or a comment-triggered pipeline.
Partial fallback: on each new iteration build, re-read threads and respond to unanswered mentions.

### 9. Commands
`@bot review`, `@bot resolve`, `@bot summarize`, `@bot ignore` — parsed from comments.
Falls out of #8.

### 10. Static-analysis fusion
Feed linter/SAST findings into the LLM to verify, explain, and dedupe. Cheap path: ingest
existing pipeline lint output or SARIF artifacts instead of running tools ourselves.
Azure DevOps Advanced Security alerts are reachable via API.

### 11. Auto-vote / approve gate
Map findings to an ADO PR vote (approve / approve-with-suggestions / wait-for-author) and a
configurable "fail the build if critical findings" policy. Trivial once #2 exists; very visible
value in a branch-policy world.

---

## Tier 4 — Polish / Scale

- **Learnings/memory:** when a user pushes back on a finding ("we do this intentionally"),
  persist it (wiki page, repo file, or extension storage) and inject into future prompts.
- **PR description generation:** auto-suggest titles/descriptions.
- **Metrics:** findings by severity over time, suggestion acceptance rate.
- **Rate limiting / retry with backoff** for LLM calls (currently relies on provider limits).

---

## Suggested Build Order

| Order | Feature | Why |
|-------|---------|-----|
| 1 | Structured findings schema (#2) | Foundation for everything else |
| 2 | ADO inline comments (#1) | Biggest visible gap; code mostly exists |
| 3 | Updatable summary/walkthrough (#3) | High wow-per-effort |
| 4 | Dedup + thread resolution (#4) | Makes repeat reviews feel smart |
| 5 | Per-repo config (#7) + context ladder (#5) | Quality + team adoption |
| 6 | Chunking (#6), then conversational (#8/#9) | Conversational needs the architecture decision below |

## Key Strategic Decision

**Stay pipeline-task-only, or add a webhook/service component?**
Everything in Tiers 1–2 works as a pipeline task. Real-time conversation (#8/#9) does not.
Decide before starting Tier 3; capture as an openspec proposal.

## Assumptions / Risks / Next Steps

- **Assumptions:** ADO PR thread API supports right-side line anchoring for all diff cases;
  LLM providers in use can reliably emit valid JSON for the findings schema.
- **Risks:** noisy inline comments hurt adoption more than no comments — severity filtering (#2)
  must ship before or with inline ADO comments (#1); large-PR chunking increases token cost.
- **Next steps:** draft an openspec proposal for the findings schema + ADO inline comments
  (build-order items 1–2).
