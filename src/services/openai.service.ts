import { BaseOpenAICompatibleService } from './base-openai-compatible.service';

/**
 * OpenAI Service Implementation
 * Uses OpenAI API to generate content
 */
export class OpenAIService extends BaseOpenAICompatibleService {
    /**
     * Create OpenAI service instance
     * @param apiKey - OpenAI API key
     * @param model - Model name, defaults to 'gpt-4o'
     * @param baseURL - Optional API endpoint URL override
     * @throws {Error} Throws error when apiKey is not provided
     */
    constructor(apiKey: string, model: string = 'gpt-4o', baseURL?: string) {
        super(apiKey, model, baseURL);
    }

    /**
     * Get service name
     * @returns Service name
     */
    protected getServiceName(): string {
        return 'OpenAI';
    }
}
