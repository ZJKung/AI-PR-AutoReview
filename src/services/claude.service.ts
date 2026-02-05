import axios from 'axios';
import { GenerateConfig } from '../interfaces/ai-service.interface';
import { BaseHttpAIService } from './base-http-ai.service';

/**
 * Claude AI service implementation
 * Uses Anthropic API to generate content
 */
export class ClaudeService extends BaseHttpAIService {
    private readonly apiVersion = '2023-06-01';

    /**
     * Create Claude AI service instance
     * @param apiKey - Anthropic API key
     * @param model - Model name, defaults to 'claude-haiku-4-5'
     * @throws {Error} Throws error when apiKey is not provided
     */
    constructor(apiKey: string, model: string = 'claude-haiku-4-5') {
        super(apiKey, model);
    }

    /**
     * Get service name
     * @returns Service name
     */
    protected getServiceName(): string {
        return 'Claude (Anthropic)';
    }

    protected getApiUrl(): string {
        return 'https://api.anthropic.com/v1/messages';
    }

    protected getHeaders(): any {
        return {
            'x-api-key': this.apiKey,
            'anthropic-version': this.apiVersion,
            'content-type': 'application/json'
        };
    }

    /**
     * Prepare Claude API request body
     * @param systemInstruction - System instruction
     * @param prompt - Prompt
     * @param config - Generation config (optional)
     * @returns Claude API request body
     */
    protected getRequestBody(
        systemInstruction: string,
        prompt: string,
        config?: GenerateConfig
    ): any {
        // Prepare request body
        const requestBody: any = {
            model: this.model,
            messages: [
                { role: 'user', content: prompt }
            ],
            max_tokens: config?.maxOutputTokens || 4096
        };

        if (systemInstruction && systemInstruction.trim() !== '') {
            requestBody.system = systemInstruction;
        }

        if (config?.temperature !== undefined) {
            requestBody.temperature = config.temperature;
        }

        return requestBody;
    }

    protected extractContent(response: any): string {
        return response.data.content?.[0]?.text || 'No response generated';
    }

    /**
     * Extract token usage from Claude API response
     * @param response - API response object
     * @returns { inputTokens, outputTokens }
     */
    protected extractTokenUsage(response: any): { inputTokens?: number; outputTokens?: number } {
        const usage = response.data.usage;
        return {
            inputTokens: usage?.input_tokens,
            outputTokens: usage?.output_tokens
        };
    }
}
