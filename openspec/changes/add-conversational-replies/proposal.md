# Proposal: Conversational Replies (@mention Q&A on PR threads)

## Why

The review bot now posts inline findings, an updatable walkthrough summary, deduplicates
across pushes, and auto-resolves fixed findings (roadmap Tiers 1–2, shipped). The remaining
gap to CodeRabbit/Copilot-review parity is conversation: a reviewer asks "@bot why is this a
problem?" in a thread and gets an answer in-thread, plus commands like `@bot ignore` or
`@bot review`.

The extension is currently a **pipeline task** triggered by branch-policy build validation.
It only runs when a build runs, so it cannot answer a comment in real time. This proposal
decides the architecture before any Tier-3 code is written.

## What Changes

- New capability `conversational-replies`: the bot answers @mentions on its own threads and
  supports a small command set (`review`, `ignore`, `resolve`, `summarize`).
- An architecture decision between two delivery options (see `design.md`):
  - **Option A — webhook service**: Azure Function + ADO service hook on comment events;
    real-time replies.
  - **Option B — iteration-time replies**: on each new PR build, the existing task re-reads
    threads and answers unanswered mentions; no new infrastructure, but replies arrive only
    on the next push or manual queue.

## Impact

- Affected specs: new `conversational-replies` capability (no changes to existing
  `github-copilot-provider` or `system-prompt-config` specs).
- Affected code (later, after approval): `src/index.ts` thread scanning; new reply prompt;
  Option A additionally requires a hosted Azure Function, service-hook provisioning, and a
  secret-management story for its PAT/identity.
- Cost/compliance: every reply sends thread text + relevant diff context to the configured
  LLM provider. Same data boundary as today's reviews; no new data classes. PHI must never
  appear in PRs per org policy — unchanged assumption. Based on available information this
  aligns with the current review flow's data handling; security review required before
  Option A ships (new ingress + stored credential).

## Decision Requested

Approve Option B as the first increment (no new infrastructure, ships in the existing task),
with Option A as a follow-up once a hosting/owner for the Azure Function is settled.
