# system-prompt-config Specification

## Purpose
TBD - created by archiving change enable-system-prompt-file. Update Purpose after archive.
## Requirements
### Requirement: System Prompt Configuration
The system **MUST** allow users to configure the System Prompt source, with options to input directly (Inline) or read from a file in the repository.

#### Scenario: User selects File source
- **WHEN** `inputSystemInstructionSource` is set to "File"
- **AND** `inputSystemPromptFile` points to a valid file
- **THEN** the system should use the file's content as the System Instruction
- **AND** ignore the `inputSystemInstruction` (inline) value

#### Scenario: User selects Inline source
- **WHEN** `inputSystemInstructionSource` is set to "Inline"
- **THEN** the system should use the `inputSystemInstruction` content
- **AND** ignore `inputSystemPromptFile`

#### Scenario: Invalid file handling
- **WHEN** `inputSystemInstructionSource` is "File"
- **AND** `inputSystemPromptFile` is invalid or empty
- **THEN** the task should fail and display an error message

#### Scenario: Input visibility
- **WHEN** `inputSystemInstructionSource` is "File"
- **THEN** display the `inputSystemPromptFile` input field
- **WHEN** `inputSystemInstructionSource` is "Inline"
- **THEN** display the `inputSystemInstruction` input field

