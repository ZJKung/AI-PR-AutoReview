## AI PR AutoReview — Local Development & Publishing Guide

This document explains how to test and develop this project (AI PR Auto Code Review) in a local environment, including commonly used scripts in package.json, the purpose of `devscripts/.env`, and the SOP for packaging and publishing to the Marketplace.


## Project Folder Structure
```
d:\Project\AiPrCodeReview
├── devscripts/              # Local test scripts
│   ├── .env                 # Environment variable config (do not commit real keys)
│   ├── ai-comment.ts        # Test AI services (Google/OpenAI/Grok/Claude)
│   ├── pr-changes.ts        # Test fetching PR changes
│   └── pr-comment.ts        # Test adding PR comments
├── images/                  # Extension icons
│   ├── extension-icon.png
│   └── extension-icon-small.png
├── packages/                # Package output folder (VSIX files)
├── screenshots/             # Documentation screenshots
├── scripts/                 # Build scripts
│   └── sync-taskjson.js     # Sync version numbers to task.json and package.json
├── src/                     # Main source code
│   ├── interfaces/          # TypeScript interface definitions
│   │   ├── ai-service.interface.ts           # AI service interface definitions
│   │   ├── devops-service.interface.ts       # DevOps service interface definitions
│   │   └── pipeline-inputs.interface.ts      # Pipeline input parameter interface definitions
│   ├── services/            # Service implementations
│   │   ├── ai-provider.service.ts            # AI service entry point, AI provider manager (unified management of all AI services)
│   │   ├── base-ai.service.ts                # AI service abstract base class (shared logic)
│   │   ├── base-http-ai.service.ts           # HTTP AI service base class (shared Axios logic)
│   │   ├── base-openai-compatible.service.ts # OpenAI-compatible service base class
│   │   ├── base-devops.service.ts            # DevOps service abstract base class (shared logic)
│   │   ├── azure-devops.service.ts           # Azure DevOps service implementation
│   │   ├── github-devops.service.ts          # GitHub service implementation
│   │   ├── devops-provider.service.ts        # DevOps service entry point, DevOps provider manager (unified Azure/GitHub management)
│   │   ├── google-ai.service.ts              # Google Gemini AI service implementation
│   │   ├── openai.service.ts                 # OpenAI service implementation
│   │   ├── grok.service.ts                   # Grok (xAI) service implementation
│   │   ├── claude.service.ts                 # Claude (Anthropic) service implementation
│   │   └── github-copilot.service.ts         # GitHub Copilot service implementation
│   ├── index.ts             # Main entry point
│   └── task.json            # Azure Pipeline Task definition file
├── package.json             # npm package configuration
├── tsconfig.json            # TypeScript compiler configuration
├── tsconfig.devscripts.json # devscripts compiler configuration
├── vss-extension.json       # Azure DevOps extension manifest
├── README.md                # Project documentation (English)
├── README.zh-TW.md          # Project documentation (Traditional Chinese)
├── README-Dev.md            # Developer documentation
└── LICENSE.txt              # License
```


## Main Scripts
- Use `npm run build` to run the full build process (sync version numbers, type checking, bundling, copying files).
- Use `npm run packaging:package` to build the Marketplace package.
- `devscripts/.env` — environment variables primarily used for local development testing.
- `devscripts` contains several test scripts and tools:
  + `npm run devscripts:ai` - Test AI services
  + `npm run devscripts:pr-changes` - Test fetching PR changes
  + `npm run devscripts:pr-comment` - Test adding PR comments
  + `npx ts-node DEVSCRIPTS/test-pr-review.ts` - Full PR review test tool (see details below)
- To simulate pipeline execution locally, edit `devscripts/.env` then run `npm run debug`.
- Run unit tests: `npm test` (uses `mocha` and `ts-node` to execute `test/**/*.spec.ts`).


## Scripts & Use Cases
- `npm run clean`: Clean the `dist/` output folder.
- `npm run typecheck`: Run TypeScript type checking (no output files generated).
- `npm run copy`: Copy `src/task.json` and `images/extension-icon-small.png` to `dist/`.
- `npm run bundle`: Bundle TypeScript to `dist/index.js` using `esbuild`.
- `npm run build`: Run the full build process, including version sync (`sync-taskjson.js`), clean, type check, bundle, and copy files.
- `npm run debug`: Compile then run in debug mode (package.json runs `tsc && node --env-file=./devscripts/.env ./dist/index.js --debug`), which reads input values from environment variables (convenient for local simulation).
- `npm run devscripts:ai`: Compile devscripts (using `tsconfig.devscripts.json`) and execute `dist/devscripts/ai-comment.js` — calls the AI service and prints the response.
- `npm run devscripts:pr-changes`: Fetch PR changed files and print their content (requires valid DevOps env settings).
- `npm run devscripts:pr-comment`: Add a PR comment via the DevOps API (requires valid DevOps env settings).
- `npm run packaging:install-tool`: Install `tfx-cli` (globally) for packaging and uploading.
- `npm run packaging:package`: Create a VSIX package (using `vss-extension.json`).

### test-pr-review.ts Test Tool

`test-pr-review.ts` is a comprehensive PR review test tool for quickly testing the full PR review workflow locally (including fetching PR changes and invoking AI services).

**Usage**:
```bash
npx ts-node DEVSCRIPTS/test-pr-review.ts [options]
```

**Required Parameters**:
- `--provider <azure|github>` - DevOps provider (Azure DevOps or GitHub)
- `--pr <PR_ID>` - Pull Request ID

**Azure DevOps Parameters** (required when provider=azure):
- `--org <URL>` - Organization URL (e.g. https://dev.azure.com/yourorg)
- `--project <PROJECT>` - Project name
- `--repo-id <ID>` - Repository ID
- `--token <TOKEN>` - Personal Access Token (or use env var SYSTEM_ACCESSTOKEN)

**GitHub Parameters** (required when provider=github):
- `--owner <USER>` - Repository owner
- `--repo <REPO>` - Repository name
- `--token <TOKEN>` - GitHub token

**GitHub Copilot Parameters**
- `--serverAddress` - GitHub Copilot CLI Server address
- `--timeout` - GitHub Copilot CLI request timeout (ms)

**AI Provider Parameters**:
- `--ai <PROVIDER>` - AI provider: 'claude', 'openai', 'grok', 'google' (default: claude)
- `--model <MODEL_NAME>` - Model name (e.g. claude-haiku-4-5, gpt-4o, gemini-2.5-flash)
- `--key <API_KEY>` - API Key (or use environment variables)

**Feature Flag Parameters**:
- `--throttle <true|false>` - Enable throttle mode (default: true, diff only)
- `--incremental <true|false>` - Enable incremental diff mode (default: false)
- `--verbose <true|false>` - Show verbose logs (default: true)

**Usage Examples**:

1. **Azure DevOps + Claude, with Incremental Diff**
```bash
npx ts-node DEVSCRIPTS/test-pr-review.ts \
  --provider azure \
  --pr 16 \
  --org https://dev.azure.com/myorg \
  --project MyProject \
  --repo-id 9efec7a7-ef7f-4c2b-8bb8-e3e4f9c2e0ca \
  --ai claude \
  --model claude-haiku-4-5 \
  --throttle true \
  --incremental true
```

2. **Azure DevOps + Google Gemini, Full Diff**
```bash
npx ts-node DEVSCRIPTS/test-pr-review.ts \
  --provider azure \
  --token Your_AzureDevops_Token
  --pr 20 \
  --org https://dev.azure.com/myorg \
  --project MyProject \
  --repo-id 94408af5-6c38-45d2-a5d3-cbcfd38b8ae7 \
  --ai google \
  --model gemini-2.5-flash \
  --throttle true \
  --incremental false
```

3. **GitHub + OpenAI, Throttle Mode Disabled**
```bash
npx ts-node DEVSCRIPTS/test-pr-review.ts \
  --provider github \
  --pr 42 \
  --owner myuser \
  --repo myrepo \
  --ai openai \
  --model gpt-4o \
  --throttle false
```

2. **Azure DevOps + GitHub Copilot**
```bash
npx ts-node DEVSCRIPTS/test-pr-review.ts \
  --provider azure \
  --token Your_AzureDevops_Token
  --pr 20 \
  --org https://dev.azure.com/myorg \
  --project MyProject \
  --repo-id 94408af5-6c38-45d2-a5d3-cbcfd38b8ae7 \
  --ai githubcopilot \
  --model gpt-5-mini \
  --throttle true \
  --server-address 10.10.10.111:8080 \
  --timeout 120000
```

**Output Description**:
- Displays current configuration settings
- Fetches PR changed files (shows file count, file size, token count)
- Invokes the AI service for review
- Prints the AI review result

**Common Use Cases**:
- Test incremental diff functionality for a specific PR
- Verify AI review result quality
- Test different AI providers' performance
- Debug token calculation and throttle mode settings



## devscripts/.env: Purpose & Local Testing

`devscripts/.env` is used to quickly set up variables needed for local `testing`, allowing the test scripts under `devscripts` and the debug mode in `src/index.ts` to simulate actual Azure DevOps pipeline and AI Provider interactions. **Never commit files containing real keys or PATs to version control.**

The following table lists commonly used variables and their descriptions:

| Variable Name              | Required | Example                                 | Description                                                                                                                                                                 |
| -------------------------- | :------: | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DevOpsOrgUrl               | Required | https://dev.azure.com/YourOrganization/ | Azure DevOps collection / organization URL                                                                                                                                  |
| DevOpsAccessToken          | Required | pat...                                  | Personal Access Token (PAT), must have PR read and comment write permissions                                                                                                |
| DevOpsProjectName          | Required | YourProject                             | Azure DevOps project name                                                                                                                                                   |
| DevOpsRepositoryId         | Required | 00000000-0000-0000-0000-000000000000    | Repository ID (or repo name in some implementations)                                                                                                                        |
| DevOpsPRId                 | Required | 4                                       | Pull Request number to test                                                                                                                                                 |
| AiProvider                 | Required | Google                                  | Provider name registered in `AIProviderService` (e.g. `Google`, `OpenAI`, `Grok`)                                                                                           |
| GeminiAPIKey               | Optional | AI_KEY                                  | Gemini API Key, required when using Google                                                                                                                                  |
| OpenAIAPIKey               | Optional | sk-...                                  | OpenAI API Key, required when using OpenAI                                                                                                                                  |
| GrokAPIKey                 | Optional | xai-...                                 | Grok (xAI) API Key, required when using Grok                                                                                                                                |
| ClaudeAPIKey               | Optional | sk-ant-...                              | Claude API Key, required when using Claude                                                                                                                                  |
| GitHubCopilotServerAddress | Optional | localhost:8080                          | GitHub Copilot CLI Server address (format: host:port). If not provided, the local GitHub Copilot CLI will be used (requires `copilot auth login` first)                     |
| ModelName                  | Required | gemini-2.5-flash                        | Model name to use (e.g. gemini-2.5-flash, gpt-4o, grok-beta, claude-haiku-4-5)                                                                                              |
| SystemInstruction          | Optional | You are a senior engineer...            | System instruction sent to the AI                                                                                                                                           |
| PromptTemplate             | Required | {code_changes}                          | Prompt template, index.ts uses `{code_changes}` as placeholder                                                                                                              |
| MaxOutputTokens            | Optional | 4096                                    | Maximum token count for AI response                                                                                                                                         |
| Temperature                | Optional | 1.0                                     | AI generation randomness                                                                                                                                                    |
| FileExtensions             | Optional | .cs,.ts,.js                             | File extensions to include (comma-separated)                                                                                                                                |
| BinaryExtensions           | Optional | .exe,.dll,.jpg                          | Binary file extensions to exclude                                                                                                                                           |
| EnableThrottleMode         | Optional | true                                    | Enable AI throttle mode (true: send diff only; false: send entire file)                                                                                                     |
| EnableIncrementalDiff      | Optional | false                                   | Enable incremental diff mode (true: review only the latest push; false: review all PR changes). **Note**: This option only takes effect when `EnableThrottleMode` is `true` |
| ShowReviewContent          | Optional | false                                   | Show review content (true: print code content sent to AI, System Instruction, Prompt, and AI response; false: do not display)                                               |

.env example (never commit files with real keys):

```properties
# Azure DevOps
DevOpsOrgUrl=https://dev.azure.com/YourOrganization/
DevOpsAccessToken=PASTE_YOUR_PAT_HERE
DevOpsProjectName=YourProject
DevOpsRepositoryId=00000000-0000-0000-0000-000000000000
DevOpsPRId=4

# AI Provider (choose one: Google / OpenAI / Grok / Claude / GitHubCopilot)
GeminiAPIKey=PASTE_YOUR_GEMINI_KEY
OpenAIAPIKey=PASTE_YOUR_OPENAI_KEY
GrokAPIKey=PASTE_YOUR_GROK_KEY
ClaudeAPIKey=PASTE_YOUR_CLAUDE_KEY
AiProvider=Google
ModelName=gemini-2.5-flash
# GitHub Copilot (optional: uses local CLI if not specified)
GitHubCopilotServerAddress=localhost:8080

SystemInstruction=You are a senior software engineer. Please help with code review and analysis.
PromptTemplate={code_changes}
MaxOutputTokens=4096
Temperature=1.0

# File filters
FileExtensions=.cs,.ts,.js,.aspx,.html
BinaryExtensions=.exe,.dll,.jpg,.png

# Other settings
EnableThrottleMode=true
EnableIncrementalDiff=false
ShowReviewContent=false
```

Note: `src/index.ts` reads from `process.env` in debug mode (instead of Azure Pipelines variables).

### Environment Variable Details

#### EnableThrottleMode (Throttle Mode)
- **Default**: `true` (enabled)
- **Description**: Controls whether only code diffs are sent to the AI, or the entire file content
  - `true`: Throttle mode enabled, sends only code diff
  - `false`: Throttle mode disabled, sends full new file content

#### EnableIncrementalDiff (Incremental Diff Mode)
- **Default**: `false` (disabled)
- **Important**: This option only takes effect when `EnableThrottleMode=true`
- **Description**: Controls whether to review only the latest push changes, or all iteration changes
  - `true`: Incremental mode, reviews only the latest push changes
  - `false`: Full mode, reviews all PR iteration changes

**Example Scenario**:
- PR has 3 pushes (3 iterations)
- Iteration 1: Add file A
- Iteration 2: Add method B in file A
- Iteration 3: Add comments in method B

**Results for Different Modes**:
- `EnableThrottleMode=true, EnableIncrementalDiff=false`: Reviews all changes (A added + method B added + comments added)
- `EnableThrottleMode=true, EnableIncrementalDiff=true`: Reviews only the latest changes (only comment additions)
- `EnableThrottleMode=false, EnableIncrementalDiff=false`: Sends entire file content to AI (including everything)
- `EnableThrottleMode=false, EnableIncrementalDiff=true`: No effect, equivalent to `false, false` (sends entire file content)


## Quick Start (PowerShell Example)
1. Install dependencies

```powershell
npm install
```

2. Build (optional)

```powershell
npm run build
```

3. Run locally (using devscripts/.env as example)

```powershell
# Run the full workflow
npm run debug

# Or run devscripts tests:
npm run devscripts:ai
npm run devscripts:pr-changes
npm run devscripts:pr-comment
```


## Incremental Diff Mode — Implementation Details

### Core Concept

Incremental diff mode handles PR scenarios with multiple pushes (iterations). In Azure DevOps, a PR iteration represents each `git push` operation — each push produces a new iteration.

### Implementation Location

Main implementation is in `src/services/azure-devops.service.ts`:

1. **Method: `verifyPullRequestChanges()`** — Fetch PR changes
   - Determines which iterations to compare based on the `enableIncrementalDiff` parameter
   - When enabled: Gets the last iteration and the previous one for comparison
   - When disabled: Gets the last iteration (full diff against the base branch)

2. **Method: `calculateIncrementalChanges()`** — Calculate incremental changes
   - Compares objectId to determine if a file was modified in the latest iteration
   - Retains only added or modified files

3. **Method: `getChangeDetails()`** — Get file change details
   - Key modification: When incremental mode is enabled, retrieves the old version from the **previous iteration**
   - Instead of using the base branch version, so the diff reflects true incremental changes

### Workflow

```
Workflow with Incremental Diff enabled:
PR has 3 iterations (i1, i2, i3)

1. verifyPullRequestChanges():
   └─ Compare iteration 3 vs iteration 2
   └─ Extract the list of files changed in iteration 3

2. calculateIncrementalChanges():
   └─ Filter files: keep only those with different objectId
   └─ Output: only files modified in i3

3. getChangeDetails():
   ├─ For each modified file
   ├─ Get i3 version (sourceContent)
   ├─ Get old version from previous iteration i2 (targetContent)
   └─ Generate diff: i3 version vs i2 version

Result: diff shows only the actual changes made in i3
```

Workflow with Incremental Diff disabled:

```
Workflow when disabled:
PR has 3 iterations

1. verifyPullRequestChanges():
   └─ Get all changes from iteration 3 (final state)

2. calculateIncrementalChanges():
   └─ Skip this step

3. getChangeDetails():
   ├─ For each file
   ├─ Get i3 version (sourceContent)
   ├─ Get base branch version (targetContent from originalObjectId)
   └─ Generate diff: i3 version vs base branch version

Result: diff shows all changes from the base branch (including i1, i2, i3)
```

### Key Characteristics

1. **Depends on Throttle Mode**: Incremental diff only works when `enableThrottleMode=true`
   - Throttle mode determines whether to send diff or the entire file
   - Incremental mode determines the scope of the diff

2. **Auto Fallback**: When a PR has only 1 iteration
   - Incremental mode automatically falls back to full mode
   - Because there is no "previous" iteration to compare against

3. **Token Optimization**: Best results when used together
   - `enableThrottleMode=true` + `enableIncrementalDiff=true`
   - Minimum content → minimum token consumption → lowest cost


## GitHub Copilot Integration

### Architecture Design

GitHub Copilot integration differs from other AI providers in several ways:

1. **Does Not Extend BaseAIService**
   - `GithubCopilotService` directly implements the `AIService` interface
   - Reason: GitHub Copilot does not require an API Key (authentication is handled by the CLI Server)
   - BaseAIService's constructor enforces API Key validation

2. **Uses the Official SDK**
   - Uses `@github/copilot-sdk` to connect to the CLI Server
   - SDK version: 0.1.21 (Technical Preview)

3. **Lazy Initialization**
   - Client connection is established on the first call to `generateComment()`
   - Avoids startup connection failures affecting the overall service

### Key Implementation Details

1. **Server Address Configuration**
   - Uses the `cliUrl` option to connect to an existing CLI Server
   - Supported formats: `host:port`, `localhost:8080`, `127.0.0.1:8080`

2. **Session Management**
   - Each request creates an independent session
   - Uses `systemMessage.content` to pass the system instruction
   - Uses `sendAndWait()` to send and wait for the response
   - Calls `session.destroy()` after completion to clean up resources

3. **Token Usage Tracking**
   - Attempts to extract usage information from the SDK response
   - If unavailable, uses estimation (character count / 4)
   - Logs clearly indicate whether values are actual or estimated

### Known Limitations

1. **SDK is in Technical Preview**
   - API may change and require adjustments
   - Flexible interfaces are designed for future adaptation

2. **Internal Network Mode Only**
   - Internet mode will be available in future versions
   - Will integrate MCP Server for cloud-based Copilot connection

3. **Temperature and MaxTokens Not Supported**
   - The SDK does not directly support these parameters
   - May need provider config settings in the future

### Testing Recommendations

#### Option 1: Using a Remote CLI Server
1. **Set up .env**
   ```properties
   AiProvider=GitHubCopilot
   GitHubCopilotServerAddress=localhost:8080
   ModelName=gpt-4o
   ```

2. **Start the test CLI Server**
   ```bash
   # Install the SDK
   npm install -g @github/copilot-sdk

   # Start in server mode
   copilot --headless --port 8080
   ```

3. **Run debug**
   ```powershell
   npm run devscripts:ai
   ```

#### Option 2: Using Local CLI (Recommended)
1. **Set up .env** (GitHubCopilotServerAddress not required)
   ```properties
   AiProvider=GitHubCopilot
   ModelName=gpt-4o
   ```

2. **Confirm GitHub Copilot CLI is installed and authenticated**
   ```bash
   # Check if installed
   copilot --version

   # If not logged in, authenticate
   copilot auth login
   ```

3. **Run debug**
   ```powershell
   npm run devscripts:ai
   ```


## Packaging & Publishing to Marketplace (SOP)
First, you need a Visual Studio Marketplace Publisher, and the `publisher` field in `vss-extension.json` must be correct (this repo uses `LawrenceShen`).

Steps:
1. Ensure the `version` in `vss-extension.json` has been updated (manually increment the version number before each release, e.g. 1.0.0 → 1.0.1).
2. If tfx-cli is not yet installed, run:

```powershell
npm run packaging:install-tool
```

3. Build and package:
Once complete, a new version VSIX file will be created in the packages folder.

```powershell
npm run packaging:package
```

4. Upload to Marketplace:
Log in to the Marketplace publishing platform and upload the latest VSIX file, as shown below: ![Marketplace Publishing Platform](screenshots/marketplace.png?raw=true)


Notes:
- Ensure no sensitive API keys or PATs are included in commits.
- Always update the `version` field in `vss-extension.json` before each release.


## FAQ & Debugging Tips
- Unable to fetch PR content via PAT: Check PAT permissions (requires Code: Read & Pull Request Read/Write).
- AI not responding or returning errors: Verify `GeminiAPIKey` (or `OpenAIAPIKey`/`GrokAPIKey`/`ClaudeAPIKey`), `AiProvider`, and `ModelName` are correct, and confirm network connectivity to the service.


## References
- [Marketplace & Extensibility Documentation](https://learn.microsoft.com/en-us/azure/devops/marketplace-extensibility/?view=azure-devops)
- [Add a Custom Pipeline Task Extension](https://learn.microsoft.com/en-us/azure/devops/extend/develop/add-build-task?view=azure-devops&toc=%2Fazure%2Fdevops%2Fmarketplace-extensibility%2Ftoc.json)
- [Azure Extension Manifest Reference](https://learn.microsoft.com/en-us/azure/devops/extend/develop/manifest?view=azure-devops)
- [Marketplace Publishing Platform](https://marketplace.visualstudio.com/manage)