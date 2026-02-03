import { BaseOpenAICompatibleService } from './base-openai-compatible.service';

/**
 * Grok (xAI) Service Implementation
 * Uses xAI API to generate content (compatible with OpenAI API format)
 */
export class GrokService extends BaseOpenAICompatibleService {
    /**
     * Create Grok service instance
     * @param apiKey - xAI API key
     * @param model - Model name, defaults to 'grok-3-mini'
     * @throws {Error} Throws error when apiKey is not provided
     */
    constructor(apiKey: string, model: string = 'grok-3-mini') {
        super(apiKey, model, 'https://api.x.ai/v1');
    }

    /**
     * Get service name
     * @returns Service name
     */
    protected getServiceName(): string {
        return 'Grok (xAI)';
    }
}
