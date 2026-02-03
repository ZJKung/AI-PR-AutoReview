import axios from 'axios';
import { AIResponse, GenerateConfig } from '../interfaces/ai-service.interface';
import { BaseAIService } from './base-ai.service';

/**
 * Base HTTP AI Service Abstract Class
 * Provides shared logic for calling AI services using HTTP (Axios)
 */
export abstract class BaseHttpAIService extends BaseAIService {

    constructor(apiKey: string, model: string) {
        super(apiKey, model);
    }

    /**
     * Generate comment content (shared HTTP logic)
     * @param systemInstruction - System instruction
     * @param prompt - Prompt
     * @param config - Generation configuration (optional)
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

            // Prepare request
            const url = this.getApiUrl();
            const requestBody = this.getRequestBody(systemInstruction, prompt, config);
            const headers = this.getHeaders();
            const requestOptions = {
                headers: headers
            };

            // Send request
            const response = await axios.post(
                url,
                requestBody,
                requestOptions
            );

            // Get response content
            const content = this.extractContent(response);

            if (config?.showReviewContent)
                this.printResponseInfo(content);

            console.log('✅ Response generated successfully');

            // Get token usage (if implemented)
            const tokenUsage = this.getTokenUsage(response);
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
     * Extract token usage from response (optionally implemented by subclass)
     * Default implementation is empty, subclasses should implement based on API response format
     * @param response - API response object
     * @returns { inputTokens, outputTokens }
     */
    protected extractTokenUsage(response: any): { inputTokens?: number; outputTokens?: number } {
        return {};
    }

    /**
     * Called by generateComment, subclasses should override extractTokenUsage method
     * @param response - API response object
     * @returns { inputTokens, outputTokens }
     */
    protected getTokenUsage(response: any): { inputTokens?: number; outputTokens?: number } {
        return this.extractTokenUsage(response);
    }

    /**
     * Get API URL (implemented by subclass)
     */
    protected abstract getApiUrl(): string;

    /**
     * Get request body (implemented by subclass)
     */
    protected abstract getRequestBody(
        systemInstruction: string,
        prompt: string,
        config?: GenerateConfig
    ): any;

    /**
     * Get request headers (implemented by subclass)
     */
    protected abstract getHeaders(): any;

    /**
     * Extract content from response (implemented by subclass)
     */
    protected abstract extractContent(response: any): string;
}
