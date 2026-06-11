# Conversational Replies

## ADDED Requirements

### Requirement: Bot answers @mentions on PR threads

The system SHALL detect comments that @mention the bot on pull request threads and post an
in-thread reply generated from the thread conversation and the relevant diff context.

#### Scenario: Reviewer asks about a finding

- **WHEN** a reviewer replies to a bot finding thread with "@ai-review why is this a problem?"
  and the review task runs again
- **THEN** the bot posts a reply in the same thread explaining the finding, and does not
  create a new top-level comment

#### Scenario: Mention already answered

- **WHEN** a thread contains a bot reply posted after the latest @mention
- **THEN** the bot does not reply again

### Requirement: Bot command set

The system SHALL support commands addressed to the bot in thread replies: `review`
(regenerate findings for the PR), `resolve` (mark the thread resolved), and `ignore`
(resolve the thread and exclude its fingerprint from future runs).

#### Scenario: Ignore command

- **WHEN** a reviewer replies "@ai-review ignore" on a bot finding thread and the task runs
- **THEN** the thread is resolved and the finding's fingerprint is not reposted on
  subsequent runs of the same PR

### Requirement: Reply data boundary

Reply generation SHALL send only thread text and the diff context of the thread's file to
the configured LLM provider, matching the data boundary of the existing review flow.

#### Scenario: No cross-PR context

- **WHEN** the bot generates a reply for a thread on PR A
- **THEN** the prompt contains no content from other pull requests or repositories
