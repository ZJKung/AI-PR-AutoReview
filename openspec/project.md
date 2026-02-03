# Project Context

## Purpose
AI PR AutoReview is an Azure DevOps Pipeline task that leverages AI to automatically generate code reviews for Pull Requests.
It supports multiple AI providers, including Google Gemini, OpenAI, xAI Grok, and Anthropic Claude.

## Tech Stack
- **Language**: TypeScript
- **Runtime Environment**: Node.js (target version node22)
- **Frameworks/Libraries**:
  - `azure-devops-node-api`: For Azure DevOps interaction
  - `openai`: For OpenAI-compatible API SDK
  - `@octokit/rest`: For GitHub interaction
- **Build Tool**: esbuild (bundled as CJS)
- **Packaging Tool**: tfx-cli (for Azure DevOps Extension)

## Project Conventions

### Code Style
- Use TypeScript with strict type checking enabled (`npm run typecheck`)
- Define tasks using `src/task.json` and keep it strictly synchronized with `dist/task.json`

### Architecture Patterns
- **Entry Point**: `src/index.ts`
- **Service Layer**: AI interaction logic is encapsulated in services (e.g., `GeminiService`, `OpenAIService`)
- **Development Scripts**: Local test scripts for simulating Azure environment are located in `devscripts/`

### Testing Strategy
- **Type Checking**: `npm run typecheck`
- **Local Debugging**: `npm run debug` (with `devscripts/.env` environment variables)
- **Simulation**: Use `npm run devscripts:ai` to test AI responses locally without running the full Pipeline

### Git Workflow
- Feature branches
- PRs for review

## Domain Context
- **Azure Pipelines**: Understanding of VSS Task structure (`task.json`) and input parameters
- **LLM Integration**: Handling token limits, prompt engineering, and API error handling

## Important Constraints
- Extension must be bundled as a single JS file (`dist/index.js`) to run in Azure DevOps
- Extension package size limitations

## External Dependencies
- Azure DevOps API
- OpenAI API / Gemini API / Claude API / Grok API
