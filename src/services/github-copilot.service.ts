import { AIService, AIResponse, GenerateConfig } from '../interfaces/ai-service.interface';

/**
 * GitHub Copilot AI service implementation
 * Uses GitHub Copilot CLI Server to generate content
 *
 * Note: This service implements the AIService interface directly and does not
 * extend BaseAIService because GitHub Copilot does not require an API key
 * (authentication is handled by the CLI Server).
 */
export class GithubCopilotService implements AIService {
    private serverAddress: string;
    private model: string;
    private timeout: number;
    private client: any; // CopilotClient instance, lazily initialized

    /**
     * Create GitHub Copilot service instance
     * @param serverAddress - CLI Server address (format: host:port). If not provided, uses GitHub Copilot CLI on the build agent
     * @param model - Model name, defaults to 'gpt-4o'
     * @param timeout - Request timeout in milliseconds. Defaults to 60000 ms (1 minute)
     * @throws {Error} Throws error when serverAddress format is invalid
     */
    constructor(serverAddress?: string, model: string = 'gpt-4o', timeout?: number) {
        // Validate serverAddress format if provided
        if (serverAddress && serverAddress.trim() !== '') {
            this.parseServerAddress(serverAddress);
            this.serverAddress = serverAddress;
        } else {
            this.serverAddress = ''; // Empty string means use local CLI
        }

        this.model = model || 'gpt-4o';
        // Apply timeout: use provided value or default to 60000 ms
        this.timeout = timeout !== undefined ? timeout : 60000;
    }

    /**
     * Generate review content
     * @param systemInstruction - System instruction
     * @param prompt - Prompt
     * @param config - Generation config (optional)
     * @returns AI service response
     */
    public async generateComment(
        systemInstruction: string,
        prompt: string,
        config?: GenerateConfig
    ): Promise<AIResponse> {
        // Ensure client is initialized
        await this.initializeClient();

        // Log generation start
        this.logGenerationStart(config);

        // Print request info when showReviewContent is enabled
        if (config?.showReviewContent) {
            this.printRequestInfo(systemInstruction, prompt, config);
        }

        try {
            // Create session (enable streaming to improve response speed)
            const requestOptions = {
                model: this.model,
                streaming: true, // Enable streaming
                systemMessage: {
                    content: systemInstruction
                },
                // Note: SDK does not directly support temperature and maxTokens
                // These may need to be set via provider config or other means
            };
            console.log('🚀 Creating Copilot session with options:', requestOptions);
            const session = await this.client.createSession(requestOptions);

            // Prepare to receive streamed content
            let content = '';
            let isFirstChunk = true;
            let finalResponse: any = null;

            // Listen for streaming events
            session.on('assistant.message_delta', (event: any) => {
                const deltaContent = event.data?.deltaContent || '';
                if (deltaContent) {
                    if (isFirstChunk) {
                        console.log('📨 Receiving streamed response...');
                        isFirstChunk = false;
                    }
                    // Stream output in real-time (optional)
                    if (config?.showReviewContent) {
                        // Disabled by default; uncomment for debugging
                        // process.stdout.write(deltaContent);
                    }
                    content += deltaContent;
                }
            });

            // Listen for full message event (for token usage)
            session.on('assistant.message', (event: any) => {
                finalResponse = event;
            });

            // Send prompt and wait for completion
            const startTime = Date.now();
            console.log(`⏳ Sending request to GitHub Copilot (timeout: ${this.timeout}ms)...`);
            const response = await session.sendAndWait({
                prompt
            }, this.timeout);
            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            console.log(`\n⏱️ GitHub Copilot response completed in ${duration} seconds`);

            // If no streaming content, extract from final response
            if (!content) {
                console.warn('⚠️ No streaming content received, extracting from final response');
                content = response?.data?.content || finalResponse?.data?.content || 'No response generated';
            }

            // Extract or estimate token usage (prefer finalResponse, then response)
            const tokenUsage = this.extractTokenUsage(finalResponse || response) || this.estimateTokenUsage({ data: { content } });

            // Cleanup session
            await session.destroy();

            // Print response info when showReviewContent is enabled
            if (config?.showReviewContent) {
                this.printResponseInfo(content);
            }

            // Log token usage
            if (tokenUsage.inputTokens !== undefined && tokenUsage.outputTokens !== undefined) {
                console.log(`📊 Token Usage - Input: ${tokenUsage.inputTokens}, Output: ${tokenUsage.outputTokens}`);
            } else if (tokenUsage.outputTokens !== undefined) {
                console.log(`📊 Token Usage - Output: ${tokenUsage.outputTokens} (estimated)`);
            }

            console.log('✅ Response generated successfully');

            return {
                content,
                inputTokens: tokenUsage.inputTokens,
                outputTokens: tokenUsage.outputTokens
            };
        } catch (error: any) {
            if (error.message.includes("ENOENT")) {
                throw new Error("⛔ Copilot CLI not found. Please install it first.");
            } else if (error.message.includes("ECONNREFUSED")) {
                throw new Error("⛔ Could not connect to Copilot CLI server.");
            } else if (error.message.includes("timeout")) {
                throw new Error("⛔ GitHub Copilot SDK timeout error.");
            } else {
                throw new Error(`⛔ GitHub Copilot SDK error: ${error.message}`);
            }

        } finally {
            await this.client.stop();
        }
    }

    /**
     * Initialize Copilot client (lazy initialization)
     * Connects on first generateComment call
     */
    private async initializeClient(): Promise<void> {
        if (this.client) {
            return; // Already initialized
        }

        try {
            // Dynamically import GitHub Copilot SDK
            const { CopilotClient } = await import('@github/copilot-sdk');

            // Choose connection method based on serverAddress
            if (this.serverAddress) {
                this.client = new CopilotClient({
                    cliUrl: this.serverAddress,
                });
                console.log(`✅ Connected to GitHub Copilot CLI Server at ${this.serverAddress}`);
            } else {
                this.client = new CopilotClient();
                console.log(`✅ Connected to GitHub Copilot CLI (local agent)`);
            }
        } catch (error: any) {
            const location = this.serverAddress || 'local agent';
            throw new Error(
                `⛔ Failed to connect to GitHub Copilot CLI at ${location}: ${error.message}`
            );
        }
    }

    /**
     * Parse and validate server address format
     * @param address - Server address (format: host:port)
     * @returns [host, port]
     * @throws {Error} Throws error when format is invalid
     */
    private parseServerAddress(address: string): [string, string] {
        const parts = address.split(':');
        if (parts.length !== 2) {
            throw new Error(
                `⛔ Invalid server address format: ${address}. Expected format: host:port`
            );
        }

        const [host, port] = parts;
        if (!host || !port || isNaN(parseInt(port, 10))) {
            throw new Error(
                `⛔ Invalid server address format: ${address}. Expected format: host:port`
            );
        }

        return [host, port];
    }

    /**
     * Extract token usage from SDK response
     * @param response - SDK response object
     * @returns { inputTokens, outputTokens } or null
     */
    private extractTokenUsage(response: any): { inputTokens?: number; outputTokens?: number } | null {
        // Try multiple possible field names (SDK API changes)
        const usage = response?.usage || response?.data?.usage;

        if (!usage) {
            return null;
        }

        // Try alternative field names
        const inputTokens =
            usage.inputTokens ?? usage.promptTokens ?? usage.input_tokens;
        const outputTokens =
            usage.outputTokens ?? usage.completionTokens ?? usage.output_tokens;

        if (inputTokens !== undefined || outputTokens !== undefined) {
            return { inputTokens, outputTokens };
        }

        return null;
    }

    /**
     * Estimate token usage when SDK doesn't provide it
     * @param response - SDK response object
     * @returns { outputTokens } estimate
     */
    private estimateTokenUsage(response: any): { inputTokens?: number; outputTokens?: number } {
        const content = response?.data?.content || '';
        // Simple estimate: 1 token ≈ 4 chars
        const outputTokens = Math.ceil(content.length / 4);

        return { outputTokens };
    }

    /**
     * Log summary info at generation start
     * @param config - Generation config
     */
    private logGenerationStart(config?: GenerateConfig): void {
        console.log('🚩 Generating response using GitHub Copilot...');
        console.log(`+ Server: ${this.serverAddress || 'local agent'}`);
        console.log(`+ Model: ${this.model}`);
        console.log(`+ Timeout: ${this.timeout}ms`);
        console.log(`+ Max Output Tokens: ${config?.maxOutputTokens}`);
        console.log(`+ Temperature: ${config?.temperature}`);
        console.log(`+ ShowReviewContent: ${config?.showReviewContent}`);
    }

    /**
     * Print request information
     * @param systemInstruction - System instruction
     * @param prompt - Prompt
     * @param config - Generation config
     */
    private printRequestInfo(
        systemInstruction: string,
        prompt: string,
        config?: GenerateConfig
    ): void {
        console.log('\n' + '='.repeat(80));
        console.log('📋 GitHub Copilot - Request Information');
        console.log('='.repeat(80));
        console.log('📝 System Instruction:');
        console.log(systemInstruction || '(none)');
        console.log('='.repeat(80));
        console.log('📝 Prompt:');
        console.log(prompt);
        console.log('='.repeat(80));
        console.log('⚙️  Generation Config:');
        console.log(`   - Server: ${this.serverAddress || 'local agent'}`);
        console.log(`   - Model: ${this.model}`);
        console.log(`   - Timeout: ${this.timeout}ms`);
        console.log(`   - Temperature: ${config?.temperature ?? 'default'}`);
        console.log(`   - Max Output Tokens: ${config?.maxOutputTokens ?? 'default'}`);
        console.log('='.repeat(80));
    }

    /**
     * Print response information
     * @param content - AI response content
     */
    private printResponseInfo(content: string): void {
        console.log('\n' + '='.repeat(80));
        console.log('🤖 GitHub Copilot - Response');
        console.log('='.repeat(80));
        console.log(content);
        console.log('='.repeat(80));
    }

    /**
     * Dispose resources if needed
     */
    public async dispose(): Promise<void> {
        if (this.client && typeof this.client.stop === 'function') {
            try {
                await this.client.stop();
                console.log('✅ GitHub Copilot Client connection closed');
            } catch (error: any) {
                console.warn(`⚠️ Error closing GitHub Copilot Client: ${error.message}`);
            }
        }
    }
}
