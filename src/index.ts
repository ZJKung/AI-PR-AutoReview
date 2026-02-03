// import tl = require('azure-pipelines-task-lib/task');
import * as tl from 'azure-pipelines-task-lib/task';
import * as fs from 'fs';
import * as path from 'path';
import { PipelineInputs, DevOpsConnection } from './interfaces/pipeline-inputs.interface';
import { AIProviderService } from './services/ai-provider.service';
import { DevOpsProviderService } from './services/devops-provider.service';
import { DevOpsService } from './interfaces/devops-service.interface';


const DEFAULT_SYSTEM_INSTRUCTION = `You are a senior software engineer. Please help complete the PR code review and respond according to the following instructions.
1. Begin with a summary conclusion of the analysis, for example: AI Review Status: ✔️ Recommend Approval, ❌ Recommend Rejection, ❗ Needs Human Review, followed by a brief explanation within 100 characters, then use <hr/> for a line break.
2. Do not include any content unrelated to the code review.
3. Use English (en-US) for the review result. Each issue should be listed as a bullet point with concise explanations.
4. Since each change may involve multiple modified files, mark each file before its corresponding review comments for easy reference.
5. If too many files are modified to analyze them all, limit the total response length to within 15,000 characters.
6. Skip analysis of images, binary files, or other non-code files.
7. Skip analysis of deleted files.
8. Use Markdown format for the reply.`;

const ALLOWED_FILE_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html'];

export class Main {
    private isDebugMode: boolean;

    constructor(isDebugMode: boolean = false) {
        this.isDebugMode = isDebugMode;
    }

    /**
     * Load system instruction from file
     * @param filePath - File path
     * @param fallbackInstruction - Fallback instruction when file reading fails
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
     * Get system instruction (supports inline or file source)
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

        // Final check: if still empty, use default instruction
        if (!instruction || instruction.trim().length === 0) {
            console.warn(`⚠️ System prompt (inline or file fallback) is empty. Using default instruction.`);
            return DEFAULT_SYSTEM_INSTRUCTION;
        }

        return instruction;
    }

    /**
     * Get input value from environment variable or task input
     * @param envKey - Environment variable key
     * @param taskInputKey - Task input key
     * @param required - Whether the input is required
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
     * Get AI Provider's model name and API Key
     * @param provider - AI Provider name
     * @returns { modelName, modelKey }
     */
    private getAIProviderConfig(provider: string): { modelName: string; modelKey: string } {
        const providerLower = provider.toLowerCase();

        if (this.isDebugMode) {
            const modelName = process.env.ModelName ?? this.getDefaultModelName(providerLower);
            const modelKey = this.getModelKeyFromEnv(providerLower);
            return { modelName, modelKey };
        } else {
            return this.getModelConfigFromTaskInput(providerLower);
        }
    }

    private getDefaultModelName(provider: string): string {
        const defaults: Record<string, string> = {
            'openai': 'gpt-4.1-nano',
            'grok': 'grok-3-mini',
            'claude': 'claude-haiku-4-5',
            'google': 'gemini-2.5-flash'
        };
        return defaults[provider] ?? 'gemini-2.5-flash';
    }

    private getModelKeyFromEnv(provider: string): string {
        const keyMap: Record<string, string> = {
            'openai': 'OpenAIAPIKey',
            'grok': 'GrokAPIKey',
            'claude': 'ClaudeAPIKey',
            'google': 'GeminiAPIKey'
        };
        return process.env[keyMap[provider]] ?? '';
    }

    private getModelConfigFromTaskInput(provider: string): { modelName: string; modelKey: string } {
        const configMap: Record<string, { nameKey: string; apiKeyKey: string; defaultName: string }> = {
            'openai': { nameKey: 'inputOpenAIModelName', apiKeyKey: 'inputOpenAIApiKey', defaultName: 'gpt-4.1-nano' },
            'grok': { nameKey: 'inputGrokModelName', apiKeyKey: 'inputGrokApiKey', defaultName: 'grok-3-mini' },
            'claude': { nameKey: 'inputClaudeModelName', apiKeyKey: 'inputClaudeApiKey', defaultName: 'claude-haiku-4-5' },
            'google': { nameKey: 'inputModelName', apiKeyKey: 'inputModelKey', defaultName: 'gemini-2.5-flash' }
        };

        const config = configMap[provider];
        if (!config) {
            throw new Error(`⛔ Unsupported AI Provider: ${provider}`);
        }

        return {
            modelName: tl.getInput(config.nameKey, true) ?? config.defaultName,
            modelKey: tl.getInput(config.apiKeyKey, true) ?? ''
        };
    }

    /**
     * Get pipeline input parameters
     * @returns Pipeline input parameters
     */
    getPipelineInputs(): PipelineInputs {
        // Get AI Provider
        const inputAiProvider = this.getInputValue('AiProvider', 'inputAiProvider', true, 'Google');

        // Get AI Provider configuration
        const { modelName, modelKey } = this.getAIProviderConfig(inputAiProvider);

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

        // Parse file extension list
        const fileExtensions = fileExtensionsStr
            ? fileExtensionsStr.split(',').map(ext => ext.trim()).filter(ext => ext.length > 0)
            : [];

        const binaryExtensions = binaryExtensionsStr
            ? binaryExtensionsStr.split(',').map(ext => ext.trim()).filter(ext => ext.length > 0)
            : [];

        return {
            aiProvider: inputAiProvider,
            modelName,
            modelKey,
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
     * Get Azure DevOps connection information
     * @returns Azure DevOps connection information
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

            // Determine if it's GitHub or Azure DevOps based on Repository URI
            const isGitHub = repositoryUri.toLowerCase().includes('github.com');
            if (isGitHub) {
                // In GitHub mode, we don't yet know how to retrieve the Access Token automatically, so manually set it in variables and add PR permission PAT to the variables
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
     * Extract owner/repo format from GitHub Repository URI
     * @param repositoryUri - GitHub Repository URI (e.g., https://github.com/lawrence8358/AI-PR-AutoReview)
     * @returns String in owner/repo format (e.g., lawrence8358/AI-PR-AutoReview)
     */
    extractGitHubOwnerRepo(repositoryUri: string): string {
        try {
            const url = new URL(repositoryUri);
            // Remove leading slash and possible .git suffix
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
     * Extract base URL from GitHub Repository URI
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
     * Get list of changed files in PR
     * @param devOpsService - DevOps service instance
     * @param connection - Azure DevOps connection information
     * @param inputs - Pipeline input parameters
     * @returns List of changed files in PR
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
     * Call AI service to get review suggestions
     * @param aiProvider - AI Provider service instance
     * @param inputs - Pipeline input parameters
     * @param changes - List of changed files in PR
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
     * Add review suggestions as PR comment
     * @param devOpsService - DevOps service instance
     * @param connection - Azure DevOps connection information
     * @param reviewContent - AI analysis result content
     * @param aiModelName - AI model name used
     */
    async addReviewComment(
        devOpsService: DevOpsService,
        connection: DevOpsConnection,
        reviewContent: string,
        aiModelName: string
    ) {
        const commentHeader = `🤖 AI Code Review (${aiModelName})`;
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
 * Execute Azure DevOps Pipeline Task
 */
async function run() {
    // Check if debug mode (from environment variable or command line argument)
    const isDebugMode = process.env.DEBUG_MODE === 'true' || process.argv.includes('--debug');
    const main = new Main(isDebugMode);

    try {
        console.log(`🚀 Starting AI Pull Request Code Review Task... (Debug Mode: ${isDebugMode ? 'ON' : 'OFF'})`);

        // 1. Get input parameters
        const inputs = main.getPipelineInputs();
        const connection = main.getDevOpsConnection();

        // Check if Pull Request information exists
        if (!connection.pullRequestId) {
            console.log('⚠️ Unable to get Pull Request information. Please ensure this task runs in a PR build.');
            tl.setResult(tl.TaskResult.Succeeded, 'No Pull Request context found. Task skipped.');
            return;
        }

        // 2. Initialize services
        const aiProvider = new AIProviderService();
        aiProvider.registerService(inputs.aiProvider, {
            apiKey: inputs.modelKey,
            modelName: inputs.modelName
        });

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
        await main.addReviewComment(devOpsService, connection, reviewResult.content, inputs.modelName);
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