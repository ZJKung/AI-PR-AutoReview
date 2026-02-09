/**
 * All supported AI provider keys
 */
export const AI_PROVIDERS = ['google', 'openai', 'grok', 'claude', 'githubcopilot', 'custom'] as const;

/**
 * Supported AI provider type
 */
export type AIProvider = typeof AI_PROVIDERS[number];

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
 * AI service base interface (Strategy interface)
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
 * AI service configuration passed to factory functions
 */
export interface AIServiceConfig {
    /** API key */
    apiKey: string;
    /** Model name */
    modelName: string;
    /** API endpoint URL (optional; providers have defaults) */
    apiUrl?: string;
    /** Server address (optional, for GitHub Copilot CLI Server) */
    serverAddress?: string;
    /** Request timeout in milliseconds (optional, for GitHub Copilot) */
    timeout?: number;
}

/**
 * Factory function type for creating AI service instances
 */
export type AIServiceFactory = (config: AIServiceConfig) => AIService;

/**
 * Metadata for a registered AI provider
 * Used by the provider registry for default values, validation, and factory creation
 */
export interface AIProviderMetadata {
    /** Human-readable display name */
    displayName: string;
    /** Default model name when user doesn't specify one */
    defaultModel: string;
    /** Default API endpoint URL (undefined = SDK default) */
    defaultApiUrl?: string;
    /** Whether this provider requires an API key */
    requiresApiKey: boolean;
    /** Factory function to create the AIService instance */
    factory: AIServiceFactory;
}