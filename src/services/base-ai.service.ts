import { AIService, GenerateConfig } from '../interfaces/ai-service.interface';

/**
 * AI service base abstract class
 * Provides common functionality for all AI service implementations
 */
export abstract class BaseAIService implements AIService {
    protected apiKey: string;
    protected model: string;

    /**
     * Create AI service base instance
     * @param apiKey - API key
     * @param model - Model name
     * @throws {Error} When apiKey or model is not provided
     */
    constructor(apiKey: string, model: string) {
        if (!apiKey || apiKey.trim() === '') {
            throw new Error(`⛔ API key is required for ${this.getServiceName()} service`);
        }

        if (!model || model.trim() === '') {
            throw new Error(`⛔ Model name is required for ${this.getServiceName()} service`);
        }

        this.apiKey = apiKey;
        this.model = model;
    }

    /**
     * Log generation start summary information (shared)
     * @param config - Generation configuration
     */
    protected logGenerationStart(config?: GenerateConfig): void {
        console.log(`🚩 Generating response using ${this.getServiceName()}...`);
        console.log(`+ Using model: ${this.model}`);
        console.log(`+ Max Output Tokens: ${config?.maxOutputTokens}`);
        console.log(`+ Temperature: ${config?.temperature}`);
        console.log(`+ ShowReviewContent: ${config?.showReviewContent}`);
    }

    /**
     * Get service name (implemented by subclass)
     * @returns Service name
     */
    protected abstract getServiceName(): string;

    /**
     * Generate comment content (implemented by subclass)
     * @param systemInstruction - System instruction
     * @param prompt - Prompt
     * @param config - Generation configuration (optional)
     * @returns AI service response
     */
    public abstract generateComment(
        systemInstruction: string,
        prompt: string,
        config?: GenerateConfig
    ): Promise<any>;

    /**
     * Print request information sent to AI
     * @param systemInstruction - System instruction
     * @param prompt - Prompt
     * @param config - Generation configuration
     */
    protected printRequestInfo(systemInstruction: string, prompt: string, config: GenerateConfig): void {
        console.log('\n' + '='.repeat(80));
        console.log(`📋 ${this.getServiceName()} - Request Information`);
        console.log('='.repeat(80));
        console.log('📝 System Instruction:');
        console.log(systemInstruction || '(none)');
        console.log('='.repeat(80));
        console.log('📝 Prompt:');
        console.log(prompt);
        console.log('='.repeat(80));
        console.log('⚙️  Generation Config:');
        console.log(`   - Model: ${this.model}`);
        console.log(`   - Temperature: ${config.temperature ?? 'default'}`);
        console.log(`   - Max Output Tokens: ${config.maxOutputTokens ?? 'default'}`);
        console.log('='.repeat(80));
    }

    /**
     * Print AI response information
     * @param content - AI response content
     */
    protected printResponseInfo(content: string): void {
        console.log('\n' + '='.repeat(80));
        console.log(`🤖 ${this.getServiceName()} - Response`);
        console.log('='.repeat(80));
        console.log(content);
        console.log('='.repeat(80));
    }
}
