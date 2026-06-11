# Tasks: Conversational Replies (Option B — iteration-time)

> Blocked on proposal approval. Option A (webhook service) is a separate follow-up change.

- [ ] 1. Add `replyToThread` capability to `DevOpsService` (+ Azure DevOps and GitHub implementations, unit tests)
- [ ] 2. Mention detection: scan `listInlineThreads` output for unanswered @mentions of the configured bot name (new input `inputBotMentionName`, default documented)
- [ ] 3. Reply prompt: thread conversation + the file's diff hunks; answer-only v1 (no commands)
- [ ] 4. Command parsing: `resolve`, `ignore` (fingerprint exclusion persisted via thread state), `review`
- [ ] 5. Wire into `run()` behind `inputEnableConversationalReplies` (default false)
- [ ] 6. Verification: unit tests for mention detection/command parsing; manual scenario on an Azure DevOps test PR
