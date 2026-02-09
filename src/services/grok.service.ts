import { BaseOpenAICompatibleService } from './base-openai-compatible.service';

/**
 * Grok (xAI) Service Implementation
 * Uses xAI API to generate content (compatible with OpenAI API format)
 */
export class GrokService extends BaseOpenAICompatibleService {
    private static readonly DEFAULT_BASE_URL = 'https://api.x.ai/v1';

    /**
     * Create Grok service instance
     * @param apiKey - xAI API key
     * @param model - Model name, defaults to 'grok-3-mini'
     * @param baseURL - Optional API endpoint URL override (defaults to xAI endpoint)
     * @throws {Error} Throws error when apiKey is not provided
     */
    constructor(apiKey: string, model: string = 'grok-3-mini', baseURL?: string) {
        super(apiKey, model, baseURL || GrokService.DEFAULT_BASE_URL);
    }

    /**
     * Get service name
     * @returns Service name
     */
    protected getServiceName(): string {
        return 'Grok (xAI)';
    }
}
