# AI Code Review for Azure DevOps

This is an Azure DevOps Pipeline extension that leverages the power of Large Language Models (LLMs) to automatically perform code reviews on Pull Request (PR) changes. It acts as an intelligent coding assistant, analyzing diffs and posting insightful comments directly to the PR.

**Now supporting all major AI providers:**
+ **GitHub Copilot** (All versions supported)
+ **OpenAI** (GPT-4o, etc.)
+ **Google Gemini**
+ **Anthropic Claude**
+ **xAI Grok**
+ **Custom** (Any OpenAI-compatible endpoint — Ollama, LM Studio, Azure OpenAI, etc.)

> **Highlight**: Maximize the value of your existing **GitHub Copilot** subscription by integrating it directly into your Azure DevOps PR workflow! This extension also supports GitHub repository Pull Request CI.


## ✨ Main Features
+ **Automated PR review**: Automatically triggers during PR build validation, acting as a diligent 24/7 reviewer.
+ **Universal AI Support**: Seamlessly switch between Google Gemini, OpenAI, Grok, Claude, GitHub Copilot, or any OpenAI-compatible endpoint.
+ **GitHub Copilot Integration**: Connect to GitHub Copilot CLI to perform reviews using your existing subscription (Individual, Business, or Enterprise), ensuring data privacy and cost-efficiency.
+ **Direct Feedback**: Publishes AI review suggestions directly to the PR as comments, threading into the conversation.
+ **Highly Customizable**: Tailor the System Prompts (Inline or File-based), adjust creativity (Temperature), and control token usage.
+ **Smart Filtering**: configure included/excluded file extensions to focus the review on what matters.


## Installation
You can install this extension from the Azure DevOps Marketplace: https://marketplace.visualstudio.com/items?itemName=LawrenceShen.ai-pr-autoreview


## 🛠️ Setup steps

### 📊 AI Provider Prerequisites Comparison
Different AI Providers have different prerequisites:

| AI Provider        | Prerequisites     | Instructions                                                                    |
| ------------------ | ----------------- | ------------------------------------------------------------------------------- |
| Google Gemini      | Apply for API Key | Get API Key from [Google AI Studio](https://aistudio.google.com/app/apikey)     |
| OpenAI             | Apply for API Key | Get API Key from [OpenAI Platform](https://platform.openai.com/api-keys)        |
| Grok (xAI)         | Apply for API Key | Get API Key from [xAI Console](https://console.x.ai/)                           |
| Claude (Anthropic) | Apply for API Key | Get API Key from [Anthropic Console](https://console.anthropic.com/)            |
| **GitHub Copilot** | Deploy CLI Server | See [GitHub Copilot CLI Prerequisites](#github-copilot-cli-prerequisites) below |
| Custom             | Provide URL + Key | Any OpenAI-compatible API (Ollama, LM Studio, Azure OpenAI, etc.)               |

### GitHub Copilot CLI Prerequisites

If you or your organization has a GitHub Copilot subscription (Individual, Business, or Enterprise), you can use the internal CLI Server for PR Code Review.

#### Applicable Scenarios
- Have an active GitHub Copilot subscription
- Want to reuse existing Copilot infrastructure
- Need unified AI toolchain experience

#### CLI Server Setup Steps

1. **Install GitHub Copilot CLI**
   ```bash
   npm install -g @github/copilot-sdk
   ```

2. **Start CLI Server Mode**

   Start the CLI Server on an internal network server:
   ```bash
   copilot --headless --port 8080
   ```

3. **Configure in Pipeline Task**
   - **AI Provider**: Select `GitHub Copilot`
   - **Network Type**: Select `Intranet`
   - **CLI Server Address**: (Optional) Enter `your-server-ip:8080` or `your-domain:8080`. If not provided, will use GitHub Copilot CLI in Build Agent
   - **Model Name**: (Optional) Defaults to `gpt-4o`

#### Important Notes
- **Remote Server Mode**: When CLI Server Address is provided, ensure Pipeline Agent and CLI Server are on the same internal network or can connect to each other. CLI Server must be running when Pipeline executes.
- **Local CLI Mode**: When CLI Server Address is not provided, will use the authenticated GitHub Copilot CLI in the Build Agent. Requirements:
  - GitHub Copilot CLI must be installed on Build Agent
  - Must have completed authentication via `copilot auth login`
  - Agent must have GitHub Copilot access permission
- Currently only supports Intranet mode; Internet mode will be available in future versions

---

Before using this Task, you also need to complete the following configuration steps:

### Step 1: Configure CI service permissions
To allow the Pipeline service to write AI comments back to the PR, you must grant it the required permissions. If this permission is not set, the Pipeline will fail and display the error `Error: TF401027: You need the Git 'PullRequestContribute' permission...`.
+ Configure the CI build service to write back PR comments: `Projects Settings -> Repositories -> Security`.
+ In the user list, find your Project Collection Build Service (YourCollectionName) account (or the specific service account your Pipeline uses).
+ Set the "Contribute to pull request" permission to `Allow`.
![](https://raw.githubusercontent.com/lawrence8358/AI-PR-AutoReview/main/screenshots/RepoSecurity.png)

### Step 2: Create a Pull Request (PR) Pipeline
Set up branch policies so that this Pipeline is automatically triggered when a PR is created. This extension only triggers the Code Review process during PR builds; it will be skipped in standard build runs.
+ Select `Projects Settings -> Repositories -> YourGitProject -> Policies -> Branch Policies -> select the target branch` (for example `main` or `master`).
![](https://raw.githubusercontent.com/lawrence8358/AI-PR-AutoReview/main/screenshots/CI3.png)
+ Configure Build Validation within Branch Policies according to your team's rules.
![](https://raw.githubusercontent.com/lawrence8358/AI-PR-AutoReview/main/screenshots/CI4.png)
+ Ensure your Pipeline includes the normal CI Build Tasks, then add this extension.
![](https://raw.githubusercontent.com/lawrence8358/AI-PR-AutoReview/main/screenshots/CI1.png)
+ Enter the Task parameters and adjust them according to your needs.
![](https://raw.githubusercontent.com/lawrence8358/AI-PR-AutoReview/main/screenshots/CI2.png)

### Step 3: (Recommended) Enforce PR-based code merges
To ensure all code is code-reviewed, we recommend configuring branch policies to require merges through PRs.
+ Select `Projects Settings -> Repositories -> YourGitProject -> Policies -> Branch Policies -> select the target branch` (for example `main` or `master`).
![](https://raw.githubusercontent.com/lawrence8358/AI-PR-AutoReview/main/screenshots/RepoPolicies1.png)
+ Configure the branch policy and enable `Require a minimum number of reviewers`. For demonstration purposes we allowed users to approve their own changes; set this according to your team's policies.
![](https://raw.githubusercontent.com/lawrence8358/AI-PR-AutoReview/main/screenshots/RepoPolicies2.png)


## 📋 Task input parameters explained
Below are all input parameters supported by this Task.

> **Simplified inputs**: A single **API Key**, **Model Name**, and optional **API Endpoint URL** work for every provider. The task automatically applies sensible defaults (model name and endpoint) based on your selected provider.

### AI Provider Settings

| Label            |     Type | Required | Default | Description                                                                                                                                                                                                                |
| ---------------- | -------: | :------: | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI Provider      | pickList |   Yes    | Google  | Choose the AI platform. Options: Google Gemini, OpenAI, Grok (xAI), Claude (Anthropic), GitHub Copilot (Preview), **Custom (OpenAI Compatible)**.                                                                          |
| API Key          |   string |   Yes*   | (empty) | API key for your selected provider. *Not required for GitHub Copilot.                                                                                                                                                      |
| Model Name       |   string |    No    | (auto)  | Model name. Leave empty to use the provider default: Google → `gemini-2.5-flash`, OpenAI → `gpt-4.1-nano`, Grok → `grok-3-mini`, Claude → `claude-haiku-4-5`, GitHub Copilot → `gpt-4o`. **Required** for Custom provider. |
| API Endpoint URL |   string |    No    | (auto)  | Custom API endpoint URL. **Required** for Custom provider. Optional for OpenAI / Grok (overrides the default endpoint). Supports any OpenAI-compatible API such as Azure OpenAI, Ollama, LM Studio, etc.                   |

### GitHub Copilot Settings
These fields are only visible when AI Provider is set to **GitHub Copilot**.

| Label                               |     Type | Required | Default  | Description                                                                               |
| ----------------------------------- | -------: | :------: | -------- | ----------------------------------------------------------------------------------------- |
| GitHub Copilot Network Type         | pickList |   Yes    | Intranet | Connection type. Currently only supports Intranet mode.                                   |
| GitHub Copilot CLI Server Address   |   string |    No    | (empty)  | CLI Server address (`host:port`). If not provided, uses the local CLI on the Build Agent. |
| GitHub Copilot Request Timeout (ms) |   string |    No    | 120000   | Request timeout in milliseconds. Default: 120 000 ms (2 min).                             |

### Prompt & Review Settings

| Label                     |      Type | Required | Default                       | Description                                                                                                            |
| ------------------------- | --------: | :------: | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| System Instruction Source |  pickList |   Yes    | Inline                        | Source of the system instruction: `Inline` or `File`.                                                                  |
| System Prompt File        |    string |    No    | (empty)                       | Path to a prompt file (`.md`, `.txt`, `.json`, `.yaml`, etc.). Falls back to inline instruction if not found or empty. |
| System Instruction        | multiLine |    No    | (built-in code review prompt) | System-level instruction to guide the AI model. Used when source is Inline.                                            |
| Prompt Template           | multiLine |   Yes    | `{code_changes}`              | Prompt template. `{code_changes}` is replaced with the actual PR diff.                                                 |
| Max Output Tokens         |    string |    No    | 4096                          | Maximum output token count.                                                                                            |
| Temperature               |    string |    No    | 1.0                           | Controls randomness of the AI response.                                                                                |

### File Filtering & Behavior

| Label                             |    Type | Required | Default | Description                                                                                                     |
| --------------------------------- | ------: | :------: | ------- | --------------------------------------------------------------------------------------------------------------- |
| File Extensions to Include        |  string |    No    | (empty) | Comma-separated list of extensions to include. If empty, all non-binary files are included.                     |
| Binary File Extensions to Exclude |  string |    No    | (empty) | Comma-separated list of binary extensions to exclude. If empty, common binary types are excluded automatically. |
| Enable AI Throttle Mode           | boolean |    No    | true    | When enabled, only code diffs are sent. When disabled, the entire new file content is sent.                     |
| Enable Incremental Diff Mode      | boolean |    No    | false   | When enabled, only the latest push changes are reviewed (requires Throttle Mode).                               |
| Show Review Content               | boolean |    No    | true    | Print the prompt and AI response to the console for debugging.                                                  |


## 🎉 Result display
### Gemini
![](https://raw.githubusercontent.com/lawrence8358/AI-PR-AutoReview/main/screenshots/Review_Gemini_EN.png)

### OpenAI
![](https://raw.githubusercontent.com/lawrence8358/AI-PR-AutoReview/main/screenshots/Review_OpenAI_EN.png)

### Grok (xAI)
![](https://raw.githubusercontent.com/lawrence8358/AI-PR-AutoReview/main/screenshots/Review_Grok_EN.png)

### Claude (Anthropic)
![](https://raw.githubusercontent.com/lawrence8358/AI-PR-AutoReview/main/screenshots/Review_Claude_EN.png)
