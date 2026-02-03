# Proposal: Enable System Prompt File Support

## Why
Currently, users can only provide system prompts through an inline text block (`inputSystemInstruction`), which limits the ability to manage system prompts as code (e.g., storing them in repository files).

## What Changes
- Add input parameter `inputSystemInstructionSource` (dropdown: "Inline", "File").
- Add input parameter `inputSystemPromptFile` (file path).
- Logic update: When "File" is selected, prioritize reading file content as the system prompt.

## Impact
- Affected Specs: System Prompt Configuration
- Affected Code: `src/task.json`, `src/index.ts` (or related Service)

