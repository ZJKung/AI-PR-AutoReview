# Design: Conversational Replies — Webhook Service vs Iteration-Time Replies

## Context

The extension runs as an Azure Pipelines task inside branch-policy build validation. All
Tier 1–2 features (inline findings, dedup, auto-resolve, summary upsert) work within that
model because they only need to act *when a build runs*. Conversation does not fit: a human
replies to a thread and expects an answer in seconds-to-minutes, not on the next push.

## Options

### Option A — Webhook service (real-time)

ADO **service hook** on "Pull request commented on" → **Azure Function** → reply via the
same DevOps/LLM service code (extracted to a shared package or duplicated bundle).

| Aspect | Assessment |
|---|---|
| Latency | Seconds — true conversational feel |
| Infra | New: Function app, service-hook provisioning per project, monitoring |
| Auth | Needs its own identity/PAT with PR-comment scope; secret rotation story required |
| Security surface | New public ingress; must validate event signatures/source; security review required |
| Cost | Function consumption plan ≈ negligible; LLM per-reply |
| Code reuse | Requires extracting `src/services/*` into a shared lib (build change) |
| GitHub support | Equivalent via GitHub webhook/App — separate provisioning path |

### Option B — Iteration-time replies (no new infrastructure)

On each task run, after the review: list threads (capability already exists —
`listInlineThreads`), find comments that @mention the bot and have no bot reply after them,
generate answers with thread + diff context, and reply in-thread. New service capability:
`replyToThread`.

| Aspect | Assessment |
|---|---|
| Latency | Replies arrive on the next push **or** manual re-queue of the validation build |
| Infra | None — same task, same pipeline, same permissions |
| Auth | Existing build-service token; no new secrets |
| Security surface | Unchanged |
| Code reuse | Direct — lives next to the existing flow |
| GitHub support | Same approach via existing Octokit client |

## Recommendation

**Ship Option B first.** It delivers the user-visible behavior (the bot answers questions
and obeys commands) with zero new infrastructure, no new secrets, and no new security
surface, and every line of it is reusable by Option A later. Teams that want real-time
replies can manually re-queue the validation build as an interim trigger.

**Option A follows** once there is an owner for the Function app and the security review is
done. The decision to build it should be driven by observed demand (how often users @mention
the bot and wait).

## Open Questions

1. Mention token: `@ai-review`? The build-service account name differs per org — likely a
   configurable input with a sensible default.
2. Command set v1: `review` (re-run findings), `ignore` (resolve thread + remember), or
   answers-only first?
3. `ignore` persistence: thread-local (resolve only) vs repo-level learning store
   (`.aireview.yml` additions) — learning store is its own proposal.
