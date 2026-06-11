// import tl = require('azure-pipelines-task-lib/task');
import * as tl from 'azure-pipelines-task-lib/task';
import * as fs from 'fs';
import * as path from 'path';
import { PipelineInputs, DevOpsConnection } from './interfaces/pipeline-inputs.interface';
import { AIProvider, AI_PROVIDERS } from './interfaces/ai-service.interface';
import { AIProviderService } from './services/ai-provider.service';
import { DevOpsProviderService } from './services/devops-provider.service';
import { DevOpsService, InlineThread } from './interfaces/devops-service.interface';
import { ReviewFinding, ReviewFindingSeverity, REVIEW_FINDING_SEVERITIES } from './interfaces/review-finding.interface';
import { FINDINGS_SYSTEM_INSTRUCTION, parseFindingsResponse, filterFindings } from './services/finding-parser';
import { formatFindingComment } from './services/finding-formatter';
import { computeFindingFingerprint, fingerprintMarker, extractFingerprints, selectNewFindings, selectResolvedThreads } from './services/finding-state';
import { loadRepoConfig, applyRepoConfig, filterPathsByGlobs, instructionsForFiles } from './services/repo-config.service';


/** Hidden marker identifying the bot's summary comment for upsert */
export const SUMMARY_MARKER = '<!-- ai-review:summary -->';

const DEFAULT_SYSTEM_INSTRUCTION = `You are a senior software engineer. Please help complete the PR code review and respond according to the following instructions.
1. Begin with a summary conclusion of the analysis, for example: AI Review Status: 🟢 Recommend Approval, 🔴 Recommend Rejection, 🟡 Needs Human Review, followed by a brief explanation within 100 characters, then use <hr/> for a line break.
2. After the status line, add a "Walkthrough" section: one short paragraph describing the overall intent of the change, followed by a markdown table with columns File | Change Summary covering each modified file. When a "PR intent" block is provided in the prompt, state whether the changes match the stated intent.
3. Do not include any content unrelated to the code review.
4. Use English (en-US) for the review result. Each issue should be listed as a bullet point. Use the following format: Emoji [Category] : Detailed explanation. Choose from: 🔴 [Critical], ⚠️ [Warning], 💡 [Suggestion], ✨ [Convention], or ❓ [Question].
5. Since each change may involve multiple modified files, mark each file before its corresponding review comments for easy reference.
6. If too many files are modified to analyze them all, limit the total response length to within 15,000 characters.
7. Skip analysis of images, binary files, or other non-code files.
8. Skip analysis of deleted files.
9. Use Markdown format for the reply.
10. Assume the provided code snippets are part of a larger, valid codebase. Do not report errors regarding "unresolved symbols," "missing definitions," or "reference issues" that may exist outside the provided diff. Focus your analysis strictly on the logic and quality of the changes themselves.`;

const ALLOWED_FILE_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html'];

/**
 * Build a prompt block describing the PR's stated intent so the model can
 * check whether the changes match it. Returns '' when there is nothing to say.
 */
export function buildPrIntentBlock(title: string, description: string): string {
    if (!title.trim() && !description.trim()) return '';
    const lines = ['## PR intent (stated by the author)'];
    if (title.trim()) lines.push(`Title: ${title.trim()}`);
    if (description.trim()) lines.push(`Description: ${description.trim()}`);
    lines.push('Consider whether the changes match this stated intent.\n');
    return lines.join('\n');
}

export class Main {
    private isDebugMode: boolean;

    constructor(isDebugMode: boolean = false) {
        this.isDebugMode = isDebugMode;
    }

    /**
     * Load system instruction from a file
     * @param filePath - File path
     * @param fallbackInstruction - Fallback instruction when file read fails
     * @returns System instruction content
     */
    private loadSystemInstructionFromFile(filePath: string, fallbackInstruction: string): string {
        // Validate file extension
        const ext = path.extname(filePath).toLowerCase();
        if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
            console.warn(`⚠️ Warning: System prompt file extension '${ext}' is not strictly supported. Recommended: .md, .txt`);
        }

        // Attempt to read file
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️ System prompt file not found: ${filePath}. Fallback to inline instruction.`);
            return fallbackInstruction;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            if (content && content.trim().length > 0) {
                return content;
            } else {
                console.warn(`⚠️ System prompt file is empty: ${filePath}. Fallback to inline instruction.`);
                return fallbackInstruction;
            }
        } catch (error) {
            console.warn(`⚠️ Failed to read system prompt file: ${filePath}. Fallback to inline instruction. Error: ${error}`);
            return fallbackInstruction;
        }
    }

    /**
     * Get system instruction (inline or file source)
     * @param source - Source type ('Inline' or 'File')
     * @param filePath - File path (used when source is 'File')
     * @param inlineInstruction - Inline instruction content
     * @returns Final system instruction
     */
    private getSystemInstruction(source: string, filePath: string, inlineInstruction: string): string {
        let instruction = '';

        if (source === 'File') {
            if (!filePath) {
                console.warn(`⚠️ System prompt file path is not specified. Fallback to inline instruction.`);
                instruction = inlineInstruction;
            } else {
                instruction = this.loadSystemInstructionFromFile(filePath, inlineInstruction);
            }
        } else {
            instruction = inlineInstruction;
        }

        // Final check: use default instruction if still empty
        if (!instruction || instruction.trim().length === 0) {
            console.warn(`⚠️ System prompt (inline or file fallback) is empty. Using default instruction.`);
            return DEFAULT_SYSTEM_INSTRUCTION;
        }

        return instruction;
    }

    /**
     * Get input value from env var or task input
     * @param envKey - Environment variable key
     * @param taskInputKey - Task input key
     * @param required - Required flag
     * @param defaultValue - Default value
     * @returns Input value
     */
    private getInputValue(envKey: string, taskInputKey: string, required: boolean = false, defaultValue: string = ''): string {
        if (this.isDebugMode) {
            return process.env[envKey] ?? defaultValue;
        } else {
            return tl.getInput(taskInputKey, required) ?? defaultValue;
        }
    }

    /**
     * Parse a raw string from task input into an AIProvider enum value
     * @param raw - Raw provider string from task input (e.g. 'Google', 'OpenAI', 'GitHubCopilot')
     * @returns AIProvider enum value
     * @throws {Error} When the provider string is not recognized
     */
    private parseAIProvider(raw: string): AIProvider {
        const key = raw.toLowerCase();
        if ((AI_PROVIDERS as readonly string[]).includes(key)) {
            return key as AIProvider;
        }
        throw new Error(`⛔ Unknown AI provider: "${raw}". Supported: ${AI_PROVIDERS.join(', ')}`);
    }

    /**
     * Get AI provider configuration (unified for all providers)
     * Uses the provider registry to resolve defaults for model and URL.
     * @param provider - AI provider enum value
     * @returns { modelName, apiKey, apiUrl, serverAddress }
     */
    private getAIProviderConfig(provider: AIProvider): {
        modelName: string;
        apiKey: string;
        apiUrl?: string;
        serverAddress?: string;
    } {
        const defaultModel = AIProviderService.getDefaultModel(provider);

        if (this.isDebugMode) {
            const modelName = process.env.ModelName || defaultModel;
            const apiKey = process.env.ApiKey ?? '';
            const apiUrl = process.env.ApiUrl ?? '';
            const serverAddress = provider === 'githubcopilot'
                ? process.env.GitHubCopilotServerAddress
                : undefined;
            return { modelName, apiKey, apiUrl: apiUrl || undefined, serverAddress };
        }

        // Pipeline mode: read from unified task inputs
        const modelName = tl.getInput('inputModelName', false)?.trim() || defaultModel;
        const apiKey = tl.getInput('inputApiKey', false) ?? '';
        const apiUrl = tl.getInput('inputApiUrl', false)?.trim() || undefined;
        const serverAddress = provider === 'githubcopilot'
            ? (tl.getInput('inputGitHubCopilotServerAddress', false) ?? '')
            : undefined;

        return { modelName, apiKey, apiUrl, serverAddress };
    }

    /**
     * Get pipeline inputs
     * @returns Pipeline inputs
     */
    getPipelineInputs(): PipelineInputs {
        // Get AI provider
        const inputAiProviderRaw = this.getInputValue('AiProvider', 'inputAiProvider', true, 'Google');
        const inputAiProvider = this.parseAIProvider(inputAiProviderRaw);

        // Get AI provider config (unified — defaults resolved from registry)
        const { modelName, apiKey, apiUrl, serverAddress } = this.getAIProviderConfig(inputAiProvider);

        // Get system instruction
        const systemInstructionSource = this.getInputValue('SystemInstructionSource', 'inputSystemInstructionSource', false, 'Inline');
        const systemPromptFile = this.getInputValue('SystemPromptFile', 'inputSystemPromptFile', false, '');
        const inlineInstruction = this.getInputValue('SystemInstruction', 'inputSystemInstruction', false, '');
        const systemInstruction = this.getSystemInstruction(systemInstructionSource, systemPromptFile, inlineInstruction);

        // Get other parameters
        const promptTemplate = this.getInputValue('PromptTemplate', 'inputPromptTemplate', true, '{code_changes}');
        const maxOutputTokens = parseInt(this.getInputValue('MaxOutputTokens', 'inputMaxOutputTokens', false, '4096'));
        const temperature = parseFloat(this.getInputValue('Temperature', 'inputTemperature', false, '1.0'));
        const fileExtensionsStr = this.getInputValue('FileExtensions', 'inputFileExtensions', false, '');
        const binaryExtensionsStr = this.getInputValue('BinaryExtensions', 'inputBinaryExtensions', false, '');
        const enableThrottleMode = this.getInputValue('EnableThrottleMode', 'inputEnableThrottleMode', false, 'true').toLowerCase() === 'true';
        const showReviewContent = this.getInputValue('ShowReviewContent', 'inputShowReviewContent', false, 'false').toLowerCase() === 'true';
        const enableIncrementalDiff = this.getInputValue('EnableIncrementalDiff', 'inputEnableIncrementalDiff', false, 'false').toLowerCase() === 'true';
        const enableSuggestionMode = this.getInputValue('EnableSuggestionMode', 'inputEnableSuggestionMode', false, 'false').toLowerCase() === 'true';

        // Severity threshold for posting inline findings (default: warning)
        const severityThresholdRaw = this.getInputValue('SeverityThreshold', 'inputSeverityThreshold', false, 'warning').trim().toLowerCase();
        let severityThreshold: ReviewFindingSeverity = 'warning';
        if ((REVIEW_FINDING_SEVERITIES as readonly string[]).includes(severityThresholdRaw)) {
            severityThreshold = severityThresholdRaw as ReviewFindingSeverity;
        } else if (severityThresholdRaw !== 'warning') {
            console.warn(`⚠️ Invalid severity threshold '${severityThresholdRaw}'. Falling back to 'warning'.`);
        }

        // Cap on posted inline findings (default: 20)
        const maxFindingsRaw = parseInt(this.getInputValue('MaxFindings', 'inputMaxFindings', false, '20'));
        const maxFindings = Number.isInteger(maxFindingsRaw) && maxFindingsRaw > 0 ? maxFindingsRaw : 20;

        // Summary comment upsert: 'auto' follows suggestion mode; 'on'/'off' override explicitly
        const updateExistingRaw = this.getInputValue('UpdateExistingComment', 'inputUpdateExistingComment', false, 'auto').trim().toLowerCase();
        const updateExistingComment = updateExistingRaw === 'on'
            || (updateExistingRaw !== 'off' && enableSuggestionMode);

        // Get GitHub Copilot timeout (only when provider is GitHubCopilot)
        let timeout: number | undefined = undefined;
        if (inputAiProvider === 'githubcopilot') {
            const timeoutStr = this.getInputValue('GitHubCopilotTimeout', 'inputGitHubCopilotTimeout', false, '120000');
            if (timeoutStr && timeoutStr.trim() !== '') {
                const parsedTimeout = parseInt(timeoutStr);
                timeout = isNaN(parsedTimeout) ? undefined : parsedTimeout;
            }
        }

        // Parse extension lists
        const fileExtensions = fileExtensionsStr
            ? fileExtensionsStr.split(',').map(ext => ext.trim()).filter(ext => ext.length > 0)
            : [];

        const binaryExtensions = binaryExtensionsStr
            ? binaryExtensionsStr.split(',').map(ext => ext.trim()).filter(ext => ext.length > 0)
            : [];

        return {
            aiProvider: inputAiProvider,
            modelName,
            apiKey,
            apiUrl,
            serverAddress,
            timeout,
            systemInstruction,
            promptTemplate,
            maxOutputTokens,
            temperature,
            fileExtensions,
            binaryExtensions,
            enableThrottleMode,
            showReviewContent,
            enableIncrementalDiff,
            enableSuggestionMode,
            severityThreshold,
            maxFindings,
            updateExistingComment
        };
    }

    /**
     * Get Azure DevOps connection info
     * @returns Azure DevOps connection info
     */
    getDevOpsConnection(): DevOpsConnection {
        let accessToken: string;
        let collectionUri: string;
        let projectName: string;
        let repositoryId: string;
        let pullRequestId: number;

        if (this.isDebugMode) {
            // Debug mode: read from environment variables
            accessToken = process.env.DevOpsAccessToken ?? '';
            collectionUri = process.env.DevOpsOrgUrl ?? '';
            projectName = process.env.DevOpsProjectName ?? '';
            repositoryId = process.env.DevOpsRepositoryId ?? '';
            pullRequestId = parseInt(process.env.DevOpsPRId ?? '0');
        } else {
            // Pipeline mode: read from Azure DevOps variables
            const repositoryUri = tl.getVariable('Build.Repository.Uri') ?? '';

            // Determine GitHub vs Azure DevOps by repository URI
            const isGitHub = repositoryUri.toLowerCase().includes('github.com');
            if (isGitHub) {
                // GitHub mode: Access token must be provided via variables (PAT with PR permissions)
                accessToken = tl.getVariable('AccessToken') ?? '';
                collectionUri = this.extractGitHubBaseUrl(repositoryUri);
                repositoryId = this.extractGitHubOwnerRepo(repositoryUri);
                projectName = repositoryId.split('/')[0]; // Use owner as project name
                pullRequestId = parseInt(tl.getVariable('System.PullRequest.PullRequestNumber') ?? '0');
            } else {
                accessToken = tl.getEndpointAuthorizationParameter('SystemVssConnection', 'AccessToken', false) ?? '';
                collectionUri = tl.getVariable('System.CollectionUri') ?? '';
                projectName = tl.getVariable('System.TeamProject') ?? '';
                repositoryId = tl.getVariable('Build.Repository.ID') ?? '';
                pullRequestId = parseInt(tl.getVariable('System.PullRequest.PullRequestId') ?? '0');
            }
        }

        if (!accessToken) {
            throw new Error('⛔ Unable to get DevOps access token');
        }

        if (!collectionUri) {
            throw new Error('⛔ Unable to get DevOps collection URI');
        }

        if (!projectName) {
            throw new Error('⛔ Unable to get DevOps project name');
        }

        if (!repositoryId) {
            throw new Error('⛔ Unable to get DevOps repository ID');
        }

        return {
            accessToken,
            collectionUri,
            projectName,
            repositoryId,
            pullRequestId
        };
    }

    /**
     * Extract owner/repo from GitHub repository URI
     * @param repositoryUri - GitHub Repository URI (e.g., https://github.com/lawrence8358/AI-PR-AutoReview)
     * @returns owner/repo string (e.g., lawrence8358/AI-PR-AutoReview)
     */
    extractGitHubOwnerRepo(repositoryUri: string): string {
        try {
            const url = new URL(repositoryUri);
            // Remove leading slash and optional .git suffix
            const pathParts = url.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
            if (pathParts.length >= 2) {
                return `${pathParts[0]}/${pathParts[1]}`;
            }
        } catch (e) {
            console.error(`⚠️ Failed to parse GitHub URI: ${repositoryUri}`, e);
        }
        throw new Error(`⛔ Invalid GitHub repository URI format: ${repositoryUri}`);
    }

    /**
     * Extract base URL from GitHub repository URI
     * @param repositoryUri - GitHub Repository URI (e.g., https://github.com/lawrence8358/AI-PR-AutoReview)
     * @returns GitHub base URL (e.g., https://github.com/)
     */
    extractGitHubBaseUrl(repositoryUri: string): string {
        try {
            const url = new URL(repositoryUri);
            return `${url.protocol}//${url.host}/`;
        } catch (e) {
            console.error(`⚠️ Failed to parse GitHub URI: ${repositoryUri}`, e);
        }
        throw new Error(`⛔ Invalid GitHub repository URI format: ${repositoryUri}`);
    }

    /**
     * Get list of PR changes
     * @param devOpsService - DevOps service instance
     * @param connection - Azure DevOps connection info
     * @param inputs - Pipeline inputs
     * @returns PR change list
     */
    async getPullRequestChanges(
        devOpsService: DevOpsService,
        connection: DevOpsConnection,
        inputs: PipelineInputs
    ) {
        const changes = await devOpsService.getPullRequestChanges(
            connection.projectName,
            connection.repositoryId,
            connection.pullRequestId,
            inputs.fileExtensions,
            inputs.binaryExtensions.length > 0 ? inputs.binaryExtensions : [],
            inputs.enableThrottleMode,
            inputs.enableIncrementalDiff
        );

        return changes;
    }

    /**
     * Call AI service to generate review content
     * @param aiProvider - AI provider service instance
     * @param inputs - Pipeline inputs
     * @param changes - PR change list
     * @returns AI analysis result, including content and token usage
     */
    async generateAIReview(
        aiProvider: AIProviderService,
        inputs: PipelineInputs,
        changes: Array<{ path: string; changeType: any; content: string }>,
        intentBlock: string = ''
    ) {
        // Get AI service
        const aiService = aiProvider.getService(inputs.aiProvider);

        // Combine change content
        const codeChanges = changes
            .map(change => `\n## File: ${change.path}\n\`\`\`\n${change.content}\n\`\`\``)
            .join('\n');

        // Replace placeholder in prompt template
        let prompt = inputs.promptTemplate.replace('{code_changes}', codeChanges);
        if (intentBlock) {
            prompt = `${intentBlock}\n${prompt}`;
        }

        // Call AI service
        const aiResponse = await aiService.generateComment(
            inputs.systemInstruction,
            prompt,
            {
                maxOutputTokens: inputs.maxOutputTokens,
                temperature: inputs.temperature,
                showReviewContent: inputs.showReviewContent
            }
        );

        // Log total token usage
        if (aiResponse.inputTokens && aiResponse.outputTokens) {
            const totalTokens = aiResponse.inputTokens + aiResponse.outputTokens;
            console.log(`💰 Total Token Usage: ${totalTokens} (Input: ${aiResponse.inputTokens}, Output: ${aiResponse.outputTokens})`);
        }

        return {
            content: aiResponse.content,
            inputTokens: aiResponse.inputTokens || 0,
            outputTokens: aiResponse.outputTokens || 0
        };
    }

    /**
     * Transform a raw GitHub patch into an LLM-readable line-number-annotated string.
     * Added/context lines get [L<N>] labels. Removed lines get [L<N>-removed] labels.
     */
    private static parsePatchWithLineNumbers(patch: string): string {
        if (!patch) return '';
        const lines = patch.split('\n');
        const result: string[] = [];
        let newLine = 0;
        let inHunk = false;
        const hunkHeaderRegex = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

        for (const line of lines) {
            const hunkMatch = hunkHeaderRegex.exec(line);
            if (hunkMatch) {
                newLine = parseInt(hunkMatch[1], 10);
                inHunk = true;
                result.push(line);
                continue;
            }
            if (!inHunk) continue; // skip preamble (diff --git, index, ---, +++ lines)
            if (line.startsWith('+')) {
                result.push(`[L${newLine}] ${line}`);
                newLine++;
            } else if (line.startsWith('-')) {
                result.push(`[L${newLine}-removed] ${line}`);
                // removed lines do not advance the new-file pointer
            } else {
                result.push(`[L${newLine}]  ${line}`);
                newLine++;
            }
        }
        return result.join('\n');
    }

    /**
     * Generate and post inline code suggestions as GitHub PR review comments.
     * @param aiProvider - AI provider service instance
     * @param devOpsService - DevOps service instance (must implement addInlineSuggestionComment)
     * @param connection - DevOps connection info
     * @param inputs - Pipeline inputs
     * @param rawPatches - Map<filePath, rawPatch> from getRawPatches()
     * @returns Number of suggestions successfully posted
     */
    async generateSuggestions(
        aiProvider: AIProviderService,
        devOpsService: DevOpsService,
        connection: DevOpsConnection,
        inputs: PipelineInputs,
        rawPatches: Map<string, string>,
        commitId: string,
        intentBlock: string = ''
    ): Promise<number> {
        if (!devOpsService.addInlineSuggestionComment) {
            console.warn('⚠️ Provider does not support inline suggestions. Skipping.');
            return 0;
        }

        const aiService = aiProvider.getService(inputs.aiProvider);

        const annotatedBlocks = Array.from(rawPatches.entries())
            .map(([filePath, patch]) => {
                const annotated = Main.parsePatchWithLineNumbers(patch);
                return `\n## File: ${filePath}\n\`\`\`\n${annotated}\n\`\`\``;
            })
            .join('\n');

        if (!annotatedBlocks) {
            console.log('⚠️ No patches available for suggestion mode.');
            return 0;
        }

        // Always use FINDINGS_SYSTEM_INSTRUCTION to protect JSON output format.
        // If the user supplied a custom system instruction, inject it into the user
        // prompt instead so it still influences the review without breaking parsing.
        const customContext = inputs.systemInstruction !== DEFAULT_SYSTEM_INSTRUCTION
            ? `Additional review guidelines:\n${inputs.systemInstruction}\n\n---\n\n`
            : '';
        if (customContext) {
            console.log('ℹ️ Custom system instruction detected — injected into prompt to preserve JSON output format.');
        }
        const prompt = (intentBlock ? `${intentBlock}\n` : '') + customContext + annotatedBlocks;

        console.log('🤖 Generating inline suggestions...');
        const aiResponse = await aiService.generateComment(
            FINDINGS_SYSTEM_INSTRUCTION,
            prompt,
            {
                maxOutputTokens: inputs.maxOutputTokens,
                temperature: inputs.temperature,
                showReviewContent: inputs.showReviewContent
            }
        );

        if (aiResponse.inputTokens && aiResponse.outputTokens) {
            console.log(`💰 Suggestion Token Usage: ${aiResponse.inputTokens + aiResponse.outputTokens} (Input: ${aiResponse.inputTokens}, Output: ${aiResponse.outputTokens})`);
        }

        console.log('📨 Raw LLM suggestion response:');
        console.log(aiResponse.content);

        const parsedFindings = parseFindingsResponse(aiResponse.content);
        let findings: ReviewFinding[] = filterFindings(parsedFindings, inputs.severityThreshold, inputs.maxFindings);

        // Deduplicate against findings already posted on a previous run
        let existingThreads: InlineThread[] = [];
        if (devOpsService.listInlineThreads) {
            existingThreads = await devOpsService.listInlineThreads(
                connection.projectName,
                connection.repositoryId,
                connection.pullRequestId
            );
            const existingFingerprints = extractFingerprints(existingThreads.map(t => t.body));
            if (existingFingerprints.size > 0) {
                findings = selectNewFindings(findings, existingFingerprints);
            }
        }

        console.log(`📝 Parsed ${parsedFindings.length} finding(s), ${findings.length} to post after severity filter and dedup (threshold: ${inputs.severityThreshold}, cap: ${inputs.maxFindings}):`);
        findings.forEach((item, i) => {
            console.log(`  [${i + 1}] [${item.severity}/${item.category}] ${item.file}:${item.line} — ${item.finding}`);
            if (item.suggestion !== undefined) {
                console.log(`       suggestion: ${item.suggestion}`);
            }
        });
        if (findings.length === 0) return 0;

        let posted = 0;
        for (const item of findings) {
            try {
                console.log(`📌 Posting finding on ${item.file}:${item.line}...`);
                await devOpsService.addInlineSuggestionComment!(
                    connection.repositoryId,
                    connection.pullRequestId,
                    item.file,
                    item.line,
                    `${formatFindingComment(item)}\n\n${fingerprintMarker(computeFindingFingerprint(item))}`,
                    item.suggestion,
                    commitId,
                    connection.projectName
                );
                posted++;
            } catch (err: any) {
                console.error(`⚠️ Failed to post finding on ${item.file}:${item.line} — ${err.message}`);
            }
        }

        console.log(`✅ Posted ${posted}/${findings.length} inline finding(s)`);

        // Auto-resolve bot threads whose finding is no longer reported.
        // Conservative: only bot-created, active, reply-free threads on files in the current diff.
        if (devOpsService.resolveThread && existingThreads.length > 0) {
            const currentFingerprints = new Set(parsedFindings.map(computeFindingFingerprint));
            const changedFiles = new Set(
                Array.from(rawPatches.keys()).map(p => p.replace(/^\//, '').toLowerCase())
            );
            const toResolve = selectResolvedThreads(existingThreads, currentFingerprints, changedFiles);
            for (const thread of toResolve) {
                try {
                    await devOpsService.resolveThread(
                        connection.projectName,
                        connection.repositoryId,
                        connection.pullRequestId,
                        thread.id
                    );
                } catch (err: any) {
                    console.error(`⚠️ Failed to resolve thread ${thread.id} — ${err.message}`);
                }
            }
            if (toResolve.length > 0) {
                console.log(`🧹 Auto-resolved ${toResolve.length} fixed finding thread(s)`);
            }
        }

        return posted;
    }

    /**
     * Add review content as PR comment. When updateExisting is enabled and the
     * provider supports it, the previous bot summary (found via hidden marker)
     * is edited in place instead of posting a new comment.
     * @param devOpsService - DevOps service instance
     * @param connection - Azure DevOps connection info
     * @param reviewContent - AI analysis content
     * @param providerName - AI provider name
     * @param aiModelName - AI model name
     * @param updateExisting - Edit the previous summary comment instead of appending
     */
    async addReviewComment(
        devOpsService: DevOpsService,
        connection: DevOpsConnection,
        reviewContent: string,
        providerName: string,
        aiModelName: string,
        updateExisting: boolean = false
    ) {
        const commentHeader = `🤖 AI Code Review (${providerName} - ${aiModelName})`;
        const contentWithMarker = `${reviewContent}\n\n${SUMMARY_MARKER}`;

        if (updateExisting && devOpsService.findBotComment && devOpsService.updatePullRequestComment) {
            const existing = await devOpsService.findBotComment(
                connection.projectName,
                connection.repositoryId,
                connection.pullRequestId,
                SUMMARY_MARKER
            );
            if (existing) {
                await devOpsService.updatePullRequestComment(
                    connection.projectName,
                    connection.repositoryId,
                    connection.pullRequestId,
                    existing,
                    `# ${commentHeader}\n${contentWithMarker}`
                );
                console.log('🔄 Updated existing AI review summary comment.');
                return;
            }
        }

        await devOpsService.addPullRequestComment(
            connection.projectName,
            connection.repositoryId,
            connection.pullRequestId,
            contentWithMarker,
            commentHeader
        );
    }
}

/**
 * Execute Azure DevOps pipeline task
 */
async function run() {
    // Check debug mode (env var or CLI arg)
    const isDebugMode = process.env.DEBUG_MODE === 'true' || process.argv.includes('--debug');
    const main = new Main(isDebugMode);

    try {
        console.log(`🚀 Starting AI Pull Request Code Review Task... (Debug Mode: ${isDebugMode ? 'ON' : 'OFF'})`);

        // 1. Get inputs
        let inputs = main.getPipelineInputs();
        const connection = main.getDevOpsConnection();

        // Per-repo config (.aireview.yml at the repo root) overrides task inputs
        const repoRoot = isDebugMode
            ? (process.env.RepoRoot ?? process.cwd())
            : (tl.getVariable('Build.SourcesDirectory') ?? '');
        const repoConfig = repoRoot ? loadRepoConfig(repoRoot) : null;
        if (repoConfig) {
            inputs = applyRepoConfig(inputs, repoConfig);
        }

        // Log key feature flags so users can verify they are being read correctly
        console.log(`⚙️  Feature Flags: ThrottleMode=${inputs.enableThrottleMode} | IncrementalDiff=${inputs.enableIncrementalDiff} | SuggestionMode=${inputs.enableSuggestionMode}`);

        // Ensure PR info exists
        if (!connection.pullRequestId) {
            console.log('⚠️ Unable to get Pull Request information. Please ensure this task runs in a PR build.');
            tl.setResult(tl.TaskResult.Succeeded, 'No Pull Request context found. Task skipped.');
            return;
        }

        // 2. Initialize services
        const aiProvider = new AIProviderService();
        const config = {
            apiKey: inputs.apiKey,
            modelName: inputs.modelName,
            apiUrl: inputs.apiUrl,
            serverAddress: inputs.serverAddress,
            timeout: inputs.timeout
        };
        aiProvider.registerService(inputs.aiProvider, config);

        const devOpsProvider = new DevOpsProviderService();
        const provider = DevOpsProviderService.detectProvider(connection.collectionUri);
        devOpsProvider.registerService(provider, {
            accessToken: connection.accessToken,
            organizationUrl: connection.collectionUri
        });
        const devOpsService = devOpsProvider.getService(provider);

        // 3. Get PR changes
        let changes = await main.getPullRequestChanges(devOpsService, connection, inputs);
        if (changes && repoConfig && (repoConfig.include || repoConfig.exclude)) {
            const allowed = new Set(filterPathsByGlobs(changes.map(c => c.path), repoConfig.include, repoConfig.exclude));
            const before = changes.length;
            changes = changes.filter(c => allowed.has(c.path));
            if (changes.length < before) {
                console.log(`📋 Repo config path filters excluded ${before - changes.length} file(s).`);
            }
        }
        if (!changes || changes.length === 0) {
            console.log('⚠️ No code changes to review. Task completed.');
            tl.setResult(tl.TaskResult.Succeeded, 'No code changes to review');
            return;
        }

        // Repo-specific instructions for the files actually under review
        if (repoConfig) {
            const extra = instructionsForFiles(repoConfig, changes.map(c => c.path));
            if (extra.length > 0) {
                inputs.systemInstruction +=
                    '\n\nAdditional repository-specific review guidelines:\n' + extra.map(t => `- ${t}`).join('\n');
                console.log(`📋 Applied ${extra.length} repo-specific instruction(s).`);
            }
        }

        // 4. Generate AI analysis and post comment(s)
        // Fetch PR intent (title/description) so the model can check change-vs-intent
        let intentBlock = '';
        if (devOpsService.getPullRequestDetails) {
            try {
                const details = await devOpsService.getPullRequestDetails(
                    connection.projectName,
                    connection.repositoryId,
                    connection.pullRequestId
                );
                intentBlock = buildPrIntentBlock(details.title, details.description);
            } catch (err: any) {
                console.warn(`⚠️ Could not fetch PR details for intent block: ${err.message}`);
            }
        }

        // Always post the summary review comment.
        const reviewResult = await main.generateAIReview(aiProvider, inputs, changes, intentBlock);
        await main.addReviewComment(devOpsService, connection, reviewResult.content, inputs.aiProvider, inputs.modelName, inputs.updateExistingComment);

        // If suggestion mode is on AND the provider supports inline suggestions, also post inline suggestions.
        if (inputs.enableSuggestionMode) {
            console.log(`💡 Suggestion Mode: ON — detected DevOps provider: ${DevOpsProviderService.detectProvider(connection.collectionUri)}`);
            if (typeof (devOpsService as any).getRawPatches !== 'function') {
                console.warn('⚠️ Current DevOps provider does not support inline findings (no raw patch support). Skipping.');
            } else {
                const rawResult = await (devOpsService as any).getRawPatches(
                    connection.projectName,
                    connection.repositoryId,
                    connection.pullRequestId
                );
                let rawPatches: Map<string, string> = rawResult.patches;
                const commitId: string = rawResult.commitId;
                if (repoConfig && (repoConfig.include || repoConfig.exclude)) {
                    const allowed = new Set(filterPathsByGlobs(Array.from(rawPatches.keys()), repoConfig.include, repoConfig.exclude));
                    rawPatches = new Map(Array.from(rawPatches.entries()).filter(([p]) => allowed.has(p)));
                }
                const postedCount = await main.generateSuggestions(aiProvider, devOpsService, connection, inputs, rawPatches, commitId, intentBlock);
                if (postedCount === 0) {
                    console.log('ℹ️ No suggestions were posted.');
                }
            }
        }
        console.log('🎉 AI Pull Request Code Review completed successfully!');
        tl.setResult(tl.TaskResult.Succeeded, 'AI Code Review completed successfully');

    } catch (err: any) {
        console.error(`😡 Task failed with error: ${err.message}`);
        tl.setResult(tl.TaskResult.Failed, `Task failed with error: ${err.message}`);
    }
}

if (require.main === module) {
    run();
}