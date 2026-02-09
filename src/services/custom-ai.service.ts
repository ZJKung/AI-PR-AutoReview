import { BaseOpenAICompatibleService } from './base-openai-compatible.service';

/**
 * Custom AI Service Implementation
 * Connects to any OpenAI-compatible API endpoint provided by the user.
 * Supports local LLMs (Ollama, LM Studio), Azure OpenAI, and other compatible APIs.
 */
export class CustomAIService extends BaseOpenAICompatibleService {
    /**
     * Create Custom AI service instance
     * @param apiKey - API key for the endpoint
     * @param model - Model name
     * @param baseURL - API endpoint URL (required for custom services)
     * @throws {Error} Throws error when apiKey or baseURL is not provided
     */
    constructor(apiKey: string, model: string, baseURL: string) {
        if (!baseURL || baseURL.trim() === '') {
            throw new Error('⛔ API URL is required for Custom AI provider');
        }
        super(apiKey, model, baseURL);
    }

    /**
     * Get service name
     * @returns Service name
     */
    protected getServiceName(): string {
        return 'Custom (OpenAI Compatible)';
    }
}
