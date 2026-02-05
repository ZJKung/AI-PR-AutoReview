import OpenAI from 'openai';
import { AIResponse, GenerateConfig } from '../interfaces/ai-service.interface';
import { BaseAIService } from './base-ai.service';

/**
 * Base service class for OpenAI-compatible APIs
 * Provides shared logic for services using OpenAI API format (e.g., OpenAI, Grok)
 */
export abstract class BaseOpenAICompatibleService extends BaseAIService {
    protected baseURL?: string;

    /**
     * Create OpenAI-compatible service instance
     * @param apiKey - API key
     * @param model - Model name
     * @param baseURL - API endpoint URL (optional)
     * @throws {Error} Throws error when apiKey or model is not provided
     */
    constructor(apiKey: string, model: string, baseURL?: string) {
        super(apiKey, model);
        this.baseURL = baseURL;
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
        try {
            this.logGenerationStart(config);

            if (config?.showReviewContent)
                this.printRequestInfo(systemInstruction, prompt, config);

            // Create OpenAI client
            const clientOptions: any = { apiKey: this.apiKey };
            if (this.baseURL) {
                clientOptions.baseURL = this.baseURL;
            }
            const client = new OpenAI(clientOptions);
            const requestOptions = this.getRequestOptions(systemInstruction, prompt, config);

            // Get response content
            const response = await client.chat.completions.create(requestOptions);
            const content = response.choices?.[0]?.message?.content || 'No response generated';

            if (config?.showReviewContent)
                this.printResponseInfo(content);

            console.log('✅ Response generated successfully');

            // Get token usage
            const tokenUsage = this.extractTokenUsage(response);
            if (tokenUsage.inputTokens || tokenUsage.outputTokens) {
                console.log(`📊 Token Usage - Input: ${tokenUsage.inputTokens ?? 'N/A'}, Output: ${tokenUsage.outputTokens ?? 'N/A'}`);
            }

            return {
                content,
                inputTokens: tokenUsage.inputTokens,
                outputTokens: tokenUsage.outputTokens
            };

        } catch (error: any) {
            const message = JSON.stringify(error.response?.data || error.message);
            throw new Error(`⛔ ${this.getServiceName()} service error: ` + message);
        }
    }

    /**
     * Prepare OpenAI request options
     * @param systemInstruction - System instruction
     * @param prompt - Prompt
     * @param config - Generation config (optional)
     * @returns OpenAI request options
     */
    private getRequestOptions(
        systemInstruction: string,
        prompt: string,
        config?: GenerateConfig
    ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        // Prepare request content
        messages.push({ role: 'user', content: prompt });

        if (systemInstruction && systemInstruction.trim() !== '') {
            messages.push({ role: 'system', content: systemInstruction });
        }

        const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
            model: this.model,
            messages: messages
        };

        if (!config) return requestOptions;

        // Apply generation settings if provided
        if (config.temperature !== undefined) {
            requestOptions.temperature = config.temperature;
        }
        if (config.maxOutputTokens !== undefined) {
            requestOptions.max_completion_tokens = config.maxOutputTokens;
        }

        return requestOptions;
    }

    /**
     * Extract token usage from OpenAI API response
     * @param response - OpenAI API response
     * @returns Token usage { inputTokens, outputTokens }
     */
    protected extractTokenUsage(response: any): { inputTokens?: number; outputTokens?: number } {
        return {
            inputTokens: response.usage?.prompt_tokens,
            outputTokens: response.usage?.completion_tokens
        };
    }
}
