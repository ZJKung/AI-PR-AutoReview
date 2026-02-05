/**
 * AI service response interface
 */
export interface AIResponse {
    /** Response content */
    content: string;
    /** Input token count (optional) */
    inputTokens?: number;
    /** Output token count (optional) */
    outputTokens?: number;
}

/**
 * AI service generation config interface
 */
export interface GenerateConfig {
    /** Max output tokens (optional) */
    maxOutputTokens?: number;
    /** Temperature (randomness) (optional) */
    temperature?: number;
    /** Show review content (print request and response) */
    showReviewContent: boolean;
}

/**
 * AI service base interface
 */
export interface AIService {
    /**
     * Generate review content
     * @param systemInstruction - System instruction
     * @param prompt - Prompt
     * @param config - Generation config (optional)
     * @returns AI service response
     */
    generateComment(systemInstruction: string, prompt: string, config?: GenerateConfig): Promise<AIResponse>;
}

/**
 * AI service provider config interface
 */
export interface AIServiceConfig {
    /** API key */
    apiKey: string;
    /** Model name */
    modelName: string;
    /** API endpoint (optional) */
    apiEndpoint?: string;
    /** Server address (optional, for GitHub Copilot) */
    serverAddress?: string;
    /** Request timeout (optional, for GitHub Copilot, in milliseconds) */
    timeout?: number;
}