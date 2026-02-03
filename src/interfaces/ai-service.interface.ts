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
 * AI service generation configuration interface
 */
export interface GenerateConfig {
    /** Maximum output token count (optional) */
    maxOutputTokens?: number;
    /** Temperature value (randomness) (optional) */
    temperature?: number;
    /** Show review content (print content sent to AI and response) */
    showReviewContent: boolean;
}

/**
 * AI service base interface
 */
export interface AIService {
    /**
     * Generate comment content
     * @param systemInstruction - System instruction
     * @param prompt - Prompt
     * @param config - Generation configuration (optional)
     * @returns AI service response
     */
    generateComment(systemInstruction: string, prompt: string, config?: GenerateConfig): Promise<AIResponse>;
}

/**
 * AI service provider configuration interface
 */
export interface AIServiceConfig {
    /** API key */
    apiKey: string;
    /** Model name */
    modelName: string;
    /** API endpoint (optional) */
    apiEndpoint?: string;
}