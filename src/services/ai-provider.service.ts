import { AIService, AIServiceConfig } from '../interfaces/ai-service.interface';
import { GoogleAIService } from './google-ai.service';
import { OpenAIService } from './openai.service';
import { GrokService } from './grok.service';
import { ClaudeService } from './claude.service';
import { GithubCopilotService } from './github-copilot.service';

/**
 * AI Service Provider Class
 * Centrally manages the creation and access of all AI services
 */
export class AIProviderService {
    private services: Map<string, AIService>;
    private configs: Map<string, AIServiceConfig>;

    /**
     * Create AI Service Provider instance
     */
    constructor() {
        this.services = new Map();
        this.configs = new Map();
    }

    /**
     * Register AI service configuration
     * @param provider - AI service provider name
     * @param config - AI service configuration
     * @throws {Error} Throws error when configuration is invalid
     */
    public registerService(provider: string, config: AIServiceConfig): void {
        const providerLower = provider.toLowerCase();

        // GitHub Copilot 不需要 apiKey，serverAddress 也是可選的（未提供時使用本機 CLI）
        if (providerLower !== 'githubcopilot') {
            if (!config.apiKey || config.apiKey.trim() === '') {
                throw new Error('⛔ API key is required');
            }
        }

        if (!config.modelName || config.modelName.trim() === '') {
            throw new Error('⛔ Model name is required');
        }
        this.configs.set(providerLower, config);
    }

    /**
     * Get AI service instance
     * @param provider - AI service provider name
     * @returns AI service instance
     * @throws {Error} Throws error when provider is unsupported or not registered
     */
    public getService(provider: string): AIService {
        const normalizedProvider = provider.toLowerCase();

        // Check if instance already exists
        if (this.services.has(normalizedProvider)) {
            return this.services.get(normalizedProvider)!;
        }

        // Check if configuration exists
        const config = this.configs.get(normalizedProvider);
        if (!config) {
            throw new Error(`⛔ Service ${provider} is not registered`);
        }

        // Create new instance
        let service: AIService;
        switch (normalizedProvider) {
            case 'google':
                service = new GoogleAIService(config.apiKey, config.modelName);
                break;
            case 'openai':
                service = new OpenAIService(config.apiKey, config.modelName);
                break;
            case 'grok':
                service = new GrokService(config.apiKey, config.modelName);
                break;
            case 'claude':
                service = new ClaudeService(config.apiKey, config.modelName);
                break;
            case 'githubcopilot':
                // serverAddress 和 timeout 是可選的，未提供時使用本機 CLI 和預設超時
                service = new GithubCopilotService(config.serverAddress, config.modelName, config.timeout);
                break;
            default:
                throw new Error(`⛔ Unsupported AI provider: ${provider}`);
        }

        // Cache instance
        this.services.set(normalizedProvider, service);
        return service;
    }

    /**
     * Check if service is registered
     * @param provider - AI service provider name
     * @returns Whether service is registered
     */
    public hasService(provider: string): boolean {
        return this.configs.has(provider.toLowerCase());
    }

    /**
     * Remove service registration
     * @param provider - AI service provider name
     */
    public removeService(provider: string): void {
        const normalizedProvider = provider.toLowerCase();
        this.configs.delete(normalizedProvider);
        this.services.delete(normalizedProvider);
    }
}