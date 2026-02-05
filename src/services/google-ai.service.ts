import axios from 'axios';
import { GenerateConfig } from '../interfaces/ai-service.interface';
import { BaseHttpAIService } from './base-http-ai.service';

/**
 * Google AI service implementation
 * Uses Google Gemini API to generate content
 */
export class GoogleAIService extends BaseHttpAIService {
    /**
     * Create Google AI service instance
     * @param apiKey - Google AI API key
     * @param model - Model name, defaults to 'gemini-2.5-flash'
     * @throws {Error} Throws error when apiKey is not provided
     */
    constructor(apiKey: string, model: string = 'gemini-2.5-flash') {
        super(apiKey, model);
    }

    /**
     * Get service name
     * @returns Service name
     */
    protected getServiceName(): string {
        return 'Google AI';
    }

    protected getApiUrl(): string {
        return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    }

    protected getHeaders(): any {
        return {
            'Content-Type': 'application/json'
        };
    }

    protected getRequestBody(
        systemInstruction: string,
        prompt: string,
        config?: GenerateConfig
    ): any {
        // Prepare request body
        const requestBody: any = {
            contents: [
                { role: 'user', parts: [{ text: prompt }] }
            ]
        };

        if (systemInstruction && systemInstruction.trim() !== '') {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        if (!config) return requestBody;

        // Apply generation settings if provided
        requestBody.generationConfig = {};
        if (config.temperature !== undefined)
            requestBody.generationConfig.temperature = config.temperature;
        if (config.maxOutputTokens !== undefined)
            requestBody.generationConfig.maxOutputTokens = config.maxOutputTokens;

        return requestBody;
    }

    protected extractContent(response: any): string {
        return response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
    }

    /**
     * Extract token usage from Google Gemini API response
     * @param response - API response object
     * @returns { inputTokens, outputTokens }
     */
    protected extractTokenUsage(response: any): { inputTokens?: number; outputTokens?: number } {
        const usage = response.data.usageMetadata;
        return {
            inputTokens: usage?.promptTokenCount,
            outputTokens: usage?.candidatesTokenCount
        };
    }
}
