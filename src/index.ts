// import tl = require('azure-pipelines-task-lib/task');
import * as tl from 'azure-pipelines-task-lib/task';
import * as fs from 'fs';
import * as path from 'path';
import { PipelineInputs, DevOpsConnection } from './interfaces/pipeline-inputs.interface';
import { AIProviderService } from './services/ai-provider.service';
import { DevOpsProviderService } from './services/devops-provider.service';
import { DevOpsService } from './interfaces/devops-service.interface';


const DEFAULT_SYSTEM_INSTRUCTION = `You are a senior software engineer. Please help complete the PR code review and respond according to the following instructions.
1. Begin with a summary conclusion of the analysis, for example: AI Review Status: 🟢 Recommend Approval, 🔴 Recommend Rejection, 🟡 Needs Human Review, followed by a brief explanation within 100 characters, then use <hr/> for a line break.
2. Do not include any content unrelated to the code review.
3. Use English (en-US) for the review result. Each issue should be listed as a bullet point. Use the following format: Emoji [Category] : Detailed explanation. Choose from: 🔴 [Critical], ⚠️ [Warning], 💡 [Suggestion], ✨ [Convention], or ❓ [Question].
4. Since each change may involve multiple modified files, mark each file before its corresponding review comments for easy reference.
5. If too many files are modified to analyze them all, limit the total response length to within 15,000 characters.
6. Skip analysis of images, binary files, or other non-code files.
7. Skip analysis of deleted files.
8. Use Markdown format for the reply.
9. Assume the provided code snippets are part of a larger, valid codebase. Do not report errors regarding "unresolved symbols," "missing definitions," or "reference issues" that may exist outside the provided diff. Focus your analysis strictly on the logic and quality of the changes themselves.`;

const ALLOWED_FILE_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html'];

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
     * Get AI provider configuration (unified for all providers)
     * Uses the provider registry to resolve defaults for model and URL.
     * @param provider - AI provider name
     * @returns { modelName, apiKey, apiUrl, serverAddress }
     */
    private getAIProviderConfig(provider: string): {
        modelName: string;
        apiKey: string;
        apiUrl?: string;
        serverAddress?: string;
    } {
        const providerLower = provider.toLowerCase();
        const defaultModel = AIProviderService.getDefaultModel(providerLower);

        if (this.isDebugMode) {
            const modelName = process.env.ModelName || defaultModel;
            const apiKey = process.env.ApiKey ?? '';
            const apiUrl = process.env.ApiUrl ?? '';
            const serverAddress = providerLower === 'githubcopilot'
                ? process.env.GitHubCopilotServerAddress
                : undefined;
            return { modelName, apiKey, apiUrl: apiUrl || undefined, serverAddress };
        }

        // Pipeline mode: read from unified task inputs
        const modelName = tl.getInput('inputModelName', false)?.trim() || defaultModel;
        const apiKey = tl.getInput('inputApiKey', false) ?? '';
        const apiUrl = tl.getInput('inputApiUrl', false)?.trim() || undefined;
        const serverAddress = providerLower === 'githubcopilot'
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
        const inputAiProvider = this.getInputValue('AiProvider', 'inputAiProvider', true, 'Google');

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

        // Get GitHub Copilot timeout (only when provider is GitHubCopilot)
        let timeout: number | undefined = undefined;
        if (inputAiProvider.toLowerCase() === 'githubcopilot') {
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
            enableIncrementalDiff
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
        changes: Array<{ path: string; changeType: any; content: string }>
    ) {
        // Get AI service
        const aiService = aiProvider.getService(inputs.aiProvider);

        // Combine change content
        const codeChanges = changes
            .map(change => `\n## File: ${change.path}\n\`\`\`\n${change.content}\n\`\`\``)
            .join('\n');

        // Replace placeholder in prompt template
        const prompt = inputs.promptTemplate.replace('{code_changes}', codeChanges);

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
     * Add review content as PR comment
     * @param devOpsService - DevOps service instance
     * @param connection - Azure DevOps connection info
     * @param reviewContent - AI analysis content
     * @param providerName - AI provider name
     * @param aiModelName - AI model name
     */
    async addReviewComment(
        devOpsService: DevOpsService,
        connection: DevOpsConnection,
        reviewContent: string,
        providerName: string,
        aiModelName: string
    ) {
        const commentHeader = `🤖 AI Code Review (${providerName} - ${aiModelName})`;
        await devOpsService.addPullRequestComment(
            connection.projectName,
            connection.repositoryId,
            connection.pullRequestId,
            reviewContent,
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
        const inputs = main.getPipelineInputs();
        const connection = main.getDevOpsConnection();

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
        const changes = await main.getPullRequestChanges(devOpsService, connection, inputs);
        if (!changes || changes.length === 0) {
            console.log('⚠️ No code changes to review. Task completed.');
            tl.setResult(tl.TaskResult.Succeeded, 'No code changes to review');
            return;
        }

        // 4. Generate AI analysis
        const reviewResult = await main.generateAIReview(aiProvider, inputs, changes);

        // 5. Add comment
        await main.addReviewComment(
            devOpsService,
            connection,
            reviewResult.content,
            inputs.aiProvider,
            inputs.modelName
        );
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