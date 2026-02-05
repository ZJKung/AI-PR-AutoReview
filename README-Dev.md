## AI PR AutoReview — Local Development & Publishing Guide

This document explains how to test and develop this project (AI PR Auto Code Review) in a local environment, including common script usage scenarios in package.json, the purpose of `devscripts/.env`, and the SOP for packaging and publishing to the Marketplace.


## Project Folder Structure
```
d:\Project\AiPrCodeReview
├── devscripts/              # Local test scripts
│   ├── .env                 # Environment variables config (do not commit production keys)
│   ├── ai-comment.ts        # Test AI services (Google/OpenAI/Grok/Claude)
│   ├── pr-changes.ts        # Test PR changes retrieval
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
│   │   ├── ai-service.interface.ts           # AI service interface definition
│   │   ├── devops-service.interface.ts       # DevOps service interface definition
│   │   └── pipeline-inputs.interface.ts      # Pipeline input parameters interface definition
│   ├── services/            # Service implementations
│   │   ├── ai-provider.service.ts            # AI service entry point, AI service provider manager (manages all AI services)
│   │   ├── base-ai.service.ts                # AI service abstract base class (provides shared logic)
│   │   ├── base-http-ai.service.ts           # HTTP AI service base class (provides shared Axios logic)
│   │   ├── base-openai-compatible.service.ts # OpenAI compatible service base class
│   │   ├── base-devops.service.ts            # DevOps service abstract base class (provides shared logic)
│   │   ├── azure-devops.service.ts           # Azure DevOps service implementation
│   │   ├── github-devops.service.ts          # GitHub service implementation
│   │   ├── devops-provider.service.ts        # DevOps service entry point, DevOps service provider manager (manages Azure/GitHub)
│   │   ├── google-ai.service.ts              # Google Gemini AI service implementation
│   │   ├── openai.service.ts                 # OpenAI service implementation
│   │   ├── grok.service.ts                   # Grok (xAI) service implementation
│   │   └── claude.service.ts                 # Claude (Anthropic) service implementation
│   ├── index.ts             # Main program entry point
│   └── task.json            # Azure Pipeline Task definition file
├── package.json             # npm package configuration
├── tsconfig.json            # TypeScript compilation settings
├── tsconfig.devscripts.json # devscripts compilation settings
├── vss-extension.json       # Azure DevOps extension manifest
├── README.md                # Project documentation (English version)
├── README-Dev.md            # Developer documentation
└── LICENSE.txt              # License terms
```


## Main Scripts
- Use `npm run build` to run the complete build process (sync version numbers, type check, bundle, copy files).
- Use `npm run packaging:package` to build the Marketplace package.
- `devscripts/.env` - These environment variables are mainly used for local development testing.
- `devscripts` contains multiple test scripts and tools
  + `npm run devscripts:ai` - Test AI services
  + `npm run devscripts:pr-changes` - Test PR changes retrieval
  + `npm run devscripts:pr-comment` - Test adding PR comments
  + `npx ts-node DEVSCRIPTS/test-pr-review.ts` - Complete PR review test tool (see details below)
- To simulate pipeline execution locally, modify `devscripts/.env` and run `npm run debug`.
- Run unit tests: `npm test` (executes `test/**/*.spec.ts` using `mocha` and `ts-node`).


## Scripts and Usage Scenarios
- `npm run clean`: Clean the `dist/` output folder.
- `npm run typecheck`: Run TypeScript type checking (does not generate files).
- `npm run copy`: Copy `src/task.json` and `images/extension-icon-small.png` to `dist/`.
- `npm run bundle`: Bundle TypeScript to `dist/index.js` using `esbuild`.
- `npm run build`: Run the complete build process, including sync version numbers (`sync-taskjson.js`), clean, type check, bundle, and copy files.
- `npm run debug`: Compile and run in debug mode (in package.json: `tsc && node --env-file=./devscripts/.env ./dist/index.js --debug`), reads input values from environment variables (convenient for local simulation).
- `npm run devscripts:ai`: Compile devscripts (using `tsconfig.devscripts.json`) and execute `dist/devscripts/ai-comment.js`, calls AI service and prints response.
- `npm run devscripts:pr-changes`: Retrieve PR changed files and print content (requires valid DevOps env settings).
- `npm run devscripts:pr-comment`: Execute DevOps API to add PR comment (requires valid DevOps env settings).
- `npm run packaging:install-tool`: Install `tfx-cli` (globally) for packaging and uploading.
- `npm run packaging:package`: Create VSIX package (using `vss-extension.json`).

### test-pr-review.ts Test Tool

`test-pr-review.ts` is a complete PR review test tool for quickly testing the full PR review process locally (including fetching PR changes and calling AI services).

**Usage**:
```bash
npx ts-node DEVSCRIPTS/test-pr-review.ts [arguments]
```

**Required Parameters**:
- `--provider <azure|github>` - DevOps provider (Azure DevOps or GitHub)
- `--pr <PR_ID>` - Pull Request ID

**Azure DevOps Parameters** (required when provider=azure):
- `--org <URL>` - Organization URL (e.g., https://dev.azure.com/yourorg)
- `--project <PROJECT>` - Project name
- `--repo-id <ID>` - Repository ID
- `--token <TOKEN>` - Personal Access Token (or use environment variable SYSTEM_ACCESSTOKEN)

**GitHub Parameters** (required when provider=github):
- `--owner <USER>` - Repository owner
- `--repo <REPO>` - Repository name
- `--token <TOKEN>` - GitHub token

**AI Provider Parameters**:
- `--ai <PROVIDER>` - AI provider: 'claude', 'openai', 'grok', 'google' (default: claude)
- `--model <MODEL_NAME>` - Model name (e.g., claude-haiku-4-5, gpt-4o, gemini-2.5-flash)
- `--key <API_KEY>` - API Key (or use environment variable)

**Feature Toggle Parameters**:
- `--throttle <true|false>` - Enable throttle mode (default: true, only send diffs)
- `--incremental <true|false>` - Enable incremental diff mode (default: false)
- `--verbose <true|false>` - Show verbose logs (default: true)

**Usage Examples**:

1. **Azure DevOps + Claude, with Incremental Diff Enabled**
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
  --pr 20 \
  --org https://dev.azure.com/myorg \
  --project MyProject \
  --repo-id 9efec7a7-ef7f-4c2b-8bb8-e3e4f9c2e0ca \
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

**Output Explanation**:
- Display current configuration settings
- Fetch PR changed files (show file count, file size, token count)
- Call AI service for review
- Print AI review results

**Common Use Cases**:
- Test incremental diff functionality for specific PRs
- Validate AI review result quality
- Test performance of different AI providers
- Debug token calculation and throttle mode settings



## devscripts/.env: Purpose and Local Testing

`devscripts/.env` is used to quickly configure variables needed for `testing` locally, allowing test scripts in `devscripts` and debug mode in `src/index.ts` to simulate actual Azure DevOps pipeline and AI Provider interactions. Make sure not to commit files containing real keys or PATs to version control.

The following table lists commonly used variables and descriptions:

| Variable Name | Required | Example | Description |
|---|:---:|---|---|
| DevOpsOrgUrl | Required | https://dev.azure.com/YourOrganization/ | Azure DevOps collection / organization URL |
| DevOpsAccessToken | Required | pat... | Personal Access Token (PAT), must be able to read PRs and post comments |
| DevOpsProjectName | Required | YourProject | Azure DevOps project name |
| DevOpsRepositoryId | Required | 00000000-0000-0000-0000-000000000000 | Repository ID (or repo name in some implementations) |
| DevOpsPRId | Required | 4 | Pull Request number to test |
| AiProvider | Required | Google | Provider name registered in `AIProviderService` (e.g., `Google`, `OpenAI`, `Grok`) |
| GeminiAPIKey | Optional | AI_KEY | Gemini API Key, required when using Google |
| OpenAIAPIKey | Optional | sk-... | OpenAI API Key, required when using OpenAI |
| GrokAPIKey | Optional | xai-... | Grok (xAI) API Key, required when using Grok |
| ClaudeAPIKey | Optional | sk-ant-... | Claude API Key, required when using Claude |
| ModelName | Required | gemini-2.5-flash | Model name to use (e.g., gemini-2.5-flash, gpt-4o, grok-beta, claude-haiku-4-5) |
| SystemInstruction | Optional | You are a senior engineer... | System instruction to pass to AI |
| PromptTemplate | Required | {code_changes} | Prompt template, index.ts uses `{code_changes}` as placeholder |
| MaxOutputTokens | Optional | 4096 | Maximum token count for AI response |
| Temperature | Optional | 1.0 | AI generation randomness |
| FileExtensions | Optional | .cs,.ts,.js | File extensions to include (comma-separated) |
| BinaryExtensions | Optional | .exe,.dll,.jpg | Binary file extensions to exclude |
| EnableThrottleMode | Optional | true | Enable AI throttle mode (true: only send diffs; false: send entire file) |
| EnableIncrementalDiff | Optional | false | Enable incremental diff mode (true: only review latest push; false: review all PR changes). **Note**: This option is only effective when `EnableThrottleMode` is `true` |
| ShowReviewContent | Optional | false | Display review content (true: print code content sent to AI, System Instruction, Prompt and AI response; false: do not display) |

.env example description (do not commit files containing real keys):

```properties
# Azure DevOps
DevOpsOrgUrl=https://dev.azure.com/YourOrganization/
DevOpsAccessToken=PASTE_YOUR_PAT_HERE
DevOpsProjectName=YourProject
DevOpsRepositoryId=00000000-0000-0000-0000-000000000000
DevOpsPRId=4

# AI Provider (choose one: Google / OpenAI / Grok / Claude)
GeminiAPIKey=PASTE_YOUR_GEMINI_KEY
OpenAIAPIKey=PASTE_YOUR_OPENAI_KEY
GrokAPIKey=PASTE_YOUR_GROK_KEY
ClaudeAPIKey=PASTE_YOUR_CLAUDE_KEY
AiProvider=Google
ModelName=gemini-2.5-flash
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

Note: `src/index.ts` in debug mode reads from `process.env` (not Azure Pipelines variables).

### Environment Variables Explanation

#### EnableThrottleMode (Throttle Mode)
- **Default Value**: `true` (enabled)
- **Description**: Controls whether to send only code differences to AI, or send entire file content
  - `true`: Throttle mode enabled, only send code diff
  - `false`: Throttle mode disabled, send entire new file content

#### EnableIncrementalDiff (Incremental Diff Mode)
- **Default Value**: `false` (disabled)
- **Important Note**: This option only takes effect when `EnableThrottleMode=true`
- **Description**: Controls whether to review only the latest push changes, or review all iteration changes
  - `true`: Incremental mode, only review latest push changes
  - `false`: Full mode, review all PR iteration changes

**Example Scenario**:
- PR has 3 pushes (3 iterations)
- Iteration 1: Add file A
- Iteration 2: Add method B in file A
- Iteration 3: Add comment in method B

**Results in Different Modes**:
- `EnableThrottleMode=true, EnableIncrementalDiff=false`: Review all changes (A added + method B added + comment added)
- `EnableThrottleMode=true, EnableIncrementalDiff=true`: Only review latest changes (only comment added)
- `EnableThrottleMode=false, EnableIncrementalDiff=false`: Send entire file content to AI (including all content)
- `EnableThrottleMode=false, EnableIncrementalDiff=true`: No effect, equivalent to `false, false` (send entire file content)


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
# Run complete flow
npm run debug

# Or run devscripts tests:
npm run devscripts:ai
npm run devscripts:pr-changes
npm run devscripts:pr-comment
```


## Incremental Diff Mode Implementation Details

### Core Concept

Incremental diff mode is used to handle PRs with multiple pushes (iterations). In Azure DevOps, a PR iteration represents each `git push` operation, and each push creates a new iteration.

### Implementation Location

Main implementation is in `src/services/azure-devops.service.ts`:

1. **Method: `verifyPullRequestChanges()`** - Get PR changes
   - Determines which iterations to compare based on the `enableIncrementalDiff` parameter
   - When enabled: Gets the last iteration and the previous iteration for comparison
   - When disabled: Gets the last iteration (full diff against base branch)

2. **Method: `calculateIncrementalChanges()`** - Calculate incremental changes
   - Determines if a file was modified in the latest iteration by comparing objectId
   - Only keeps newly added or modified files

3. **Method: `getChangeDetails()`** - Get file change details
   - Core modification: When incremental mode is enabled, retrieves old version file from **previous iteration**
   - Instead of using base branch version, so the generated diff is truly incremental

### Workflow

```
Flow when Incremental Diff is enabled:
PR has 3 iterations (i1, i2, i3)

1. verifyPullRequestChanges():
   └─ Compare iteration 3 vs iteration 2
   └─ Extract list of files changed in iteration 3

2. calculateIncrementalChanges():
   └─ Filter files: only keep files with different objectId
   └─ Output: only files modified in i3

3. getChangeDetails():
   ├─ For each modified file
   ├─ Get i3 version (sourceContent)
   ├─ Get old version from previous iteration (i2) (targetContent)
   └─ Generate diff: i3 version vs i2 version

Result: diff only shows actual modifications in i3
```

Flow when Incremental Diff is disabled:

```
Flow when disabled:
PR has 3 iterations

1. verifyPullRequestChanges():
   └─ Get all changes in iteration 3 (final state)

2. calculateIncrementalChanges():
   └─ Skip this step

3. getChangeDetails():
   ├─ For each file
   ├─ Get i3 version (sourceContent)
   ├─ Get base branch version (targetContent from originalObjectId)
   └─ Generate diff: i3 version vs base branch version

Result: diff shows all changes from base branch (including i1, i2, i3)
```

### Important Characteristics

1. **Depends on Throttle Mode**: Incremental diff only works when `enableThrottleMode=true`
   - Throttle mode determines whether to send diff or entire file
   - Incremental mode determines the scope of the diff

2. **Automatic Fallback**: When PR has only 1 iteration
   - Incremental mode automatically becomes full mode
   - Because there's no "previous" iteration to compare

3. **Token Optimization**: Best results when used together
   - `enableThrottleMode=true` + `enableIncrementalDiff=true`
   - Minimal content → Minimal token consumption → Lowest cost


## Packaging and Uploading to Marketplace (SOP)
First, you need to have a Visual Studio Marketplace Publisher, and ensure the `publisher` field in `vss-extension.json` is correct (in this repo it's `LawrenceShen`).

Steps:
1. Confirm that the `version` in `vss-extension.json` has been updated (manually increment the version number for each release, e.g., 1.0.0 → 1.0.1).
2. If tfx-cli is not yet installed, run:

```powershell
npm run packaging:install-tool
```

3. Build and package:
After completion, a new version VSIX file will be generated in the packages folder

```powershell
npm run packaging:package
```

4. Upload to marketplace:
Log in to the MarketPlace publishing platform and upload the latest packaged VSIX file, as shown below ![MarketPlace Publishing Platform](screenshots/marketplace.png?raw=true)


Notes:
- Ensure no sensitive API keys or PATs are included in commits.
- Always update the `version` field in `vss-extension.json` before each release.


## Common Issues and Debugging Suggestions
- Unable to get PR content via PAT: Check PAT permissions (requires Code: Read & Pull Request Read/Write).
- AI not responding or incorrect response: Check if `GeminiAPIKey` (or `OpenAIAPIKey`/`GrokAPIKey`/`ClaudeAPIKey`), `AiProvider`, `ModelName` are correct, and confirm network can reach the service.


## Reference Documentation
- [Marketplace & Extensibility](https://learn.microsoft.com/en-us/azure/devops/marketplace-extensibility/?view=azure-devops)
- [Add a Custom Pipeline Task Extension](https://learn.microsoft.com/en-us/azure/devops/extend/develop/add-build-task?view=azure-devops&toc=%2Fazure%2Fdevops%2Fmarketplace-extensibility%2Ftoc.json)
- [Azure Extension Manifest Reference](https://learn.microsoft.com/en-us/azure/devops/extend/develop/manifest?view=azure-devops)
- [MarketPlace Publishing Platform](https://marketplace.visualstudio.com/manage)