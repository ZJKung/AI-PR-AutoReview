import { AIService, AIServiceConfig, AIServiceFactory, AIProviderMetadata } from '../interfaces/ai-service.interface';
import { GoogleAIService } from './google-ai.service';
import { OpenAIService } from './openai.service';
import { GrokService } from './grok.service';
import { ClaudeService } from './claude.service';
import { GithubCopilotService } from './github-copilot.service';
import { CustomAIService } from './custom-ai.service';

/**
 * Built-in provider definitions.
 * To add a new provider, simply add an entry here — no switch/case needed.
 */
const BUILT_IN_PROVIDERS: Record<string, AIProviderMetadata> = {
    google: {
        displayName: 'Google AI',
        defaultModel: 'gemini-2.5-flash',
        defaultApiUrl: 'https://generativelanguage.googleapis.com/v1beta',
        requiresApiKey: true,
        factory: (cfg) => new GoogleAIService(cfg.apiKey, cfg.modelName),
    },
    openai: {
        displayName: 'OpenAI',
        defaultModel: 'gpt-4.1-nano',
        defaultApiUrl: 'https://api.openai.com/v1',
        requiresApiKey: true,
        factory: (cfg) => new OpenAIService(cfg.apiKey, cfg.modelName, cfg.apiUrl),
    },
    grok: {
        displayName: 'Grok (xAI)',
        defaultModel: 'grok-3-mini',
        defaultApiUrl: 'https://api.x.ai/v1',
        requiresApiKey: true,
        factory: (cfg) => new GrokService(cfg.apiKey, cfg.modelName, cfg.apiUrl),
    },
    claude: {
        displayName: 'Claude (Anthropic)',
        defaultModel: 'claude-haiku-4-5',
        defaultApiUrl: 'https://api.anthropic.com/v1/messages',
        requiresApiKey: true,
        factory: (cfg) => new ClaudeService(cfg.apiKey, cfg.modelName),
    },
    githubcopilot: {
        displayName: 'GitHub Copilot (Preview)',
        defaultModel: 'gpt-4o',
        requiresApiKey: false,
        factory: (cfg) => new GithubCopilotService(cfg.serverAddress, cfg.modelName, cfg.timeout),
    },
    custom: {
        displayName: 'Custom (OpenAI Compatible)',
        defaultModel: '',
        requiresApiKey: true,
        factory: (cfg) => {
            if (!cfg.apiUrl || cfg.apiUrl.trim() === '') {
                throw new Error('⛔ API URL is required for Custom AI provider');
            }
            if (!cfg.modelName || cfg.modelName.trim() === '') {
                throw new Error('⛔ Model name is required for Custom AI provider');
            }
            return new CustomAIService(cfg.apiKey, cfg.modelName, cfg.apiUrl);
        },
    },
};

/**
 * AI Service Provider — Strategy + Registry Pattern
 *
 * Responsibilities:
 * 1. Maintain a registry of available AI providers and their metadata.
 * 2. Validate and resolve configs (apply defaults for model / URL).
 * 3. Create and cache AIService instances via provider-specific factory functions.
 *
 * Extending:
 *   Call `AIProviderService.registerProvider()` to add custom providers at runtime,
 *   or add entries to BUILT_IN_PROVIDERS above for compile-time additions.
 */
export class AIProviderService {
    /** Provider registry (shared across all instances) */
    private static registry: Map<string, AIProviderMetadata> = new Map();
    /** Whether built-in providers have been loaded */
    private static initialized = false;

    /** Per-instance service cache */
    private services: Map<string, AIService> = new Map();
    /** Per-instance resolved configs */
    private configs: Map<string, AIServiceConfig> = new Map();

    constructor() {
        AIProviderService.ensureInitialized();
    }

    // ──────────────────────────────────────────────
    //  Static registry API
    // ──────────────────────────────────────────────

    /**
     * Load built-in providers into the registry (idempotent)
     */
    private static ensureInitialized(): void {
        if (AIProviderService.initialized) return;
        for (const [key, meta] of Object.entries(BUILT_IN_PROVIDERS)) {
            AIProviderService.registry.set(key, meta);
        }
        AIProviderService.initialized = true;
    }

    /**
     * Register (or override) a provider at runtime
     * @param name - Lowercase provider key
     * @param metadata - Provider metadata including factory
     */
    public static registerProvider(name: string, metadata: AIProviderMetadata): void {
        AIProviderService.ensureInitialized();
        AIProviderService.registry.set(name.toLowerCase(), metadata);
    }

    /**
     * Get metadata for a registered provider
     * @param provider - Provider key
     * @returns AIProviderMetadata or undefined
     */
    public static getProviderMetadata(provider: string): AIProviderMetadata | undefined {
        AIProviderService.ensureInitialized();
        return AIProviderService.registry.get(provider.toLowerCase());
    }

    /**
     * List all registered provider keys
     */
    public static listProviders(): string[] {
        AIProviderService.ensureInitialized();
        return Array.from(AIProviderService.registry.keys());
    }

    /**
     * Get default model name for a provider
     * @param provider - Provider key
     * @returns Default model name or empty string
     */
    public static getDefaultModel(provider: string): string {
        return AIProviderService.getProviderMetadata(provider)?.defaultModel ?? '';
    }

    /**
     * Get default API URL for a provider
     * @param provider - Provider key
     * @returns Default API URL or undefined
     */
    public static getDefaultApiUrl(provider: string): string | undefined {
        return AIProviderService.getProviderMetadata(provider)?.defaultApiUrl;
    }

    // ──────────────────────────────────────────────
    //  Instance API (config + service management)
    // ──────────────────────────────────────────────

    /**
     * Register (validate & store) a service configuration
     * Applies provider defaults for missing model name / API URL.
     *
     * @param provider - Provider key (e.g. 'openai', 'custom')
     * @param config - Partial config; defaults are applied from registry
     * @throws {Error} When required fields are missing
     */
    public registerService(provider: string, config: AIServiceConfig): void {
        const key = provider.toLowerCase();
        const meta = AIProviderService.registry.get(key);
        if (!meta) {
            throw new Error(`⛔ Unknown AI provider: ${provider}. Available: ${AIProviderService.listProviders().join(', ')}`);
        }

        // Validate API key
        if (meta.requiresApiKey && (!config.apiKey || config.apiKey.trim() === '')) {
            throw new Error(`⛔ API key is required for ${meta.displayName}`);
        }

        // Resolve defaults
        const resolved: AIServiceConfig = {
            apiKey: config.apiKey,
            modelName: config.modelName?.trim() || meta.defaultModel,
            apiUrl: config.apiUrl?.trim() || meta.defaultApiUrl,
            serverAddress: config.serverAddress,
            timeout: config.timeout,
        };

        if (!resolved.modelName) {
            throw new Error(`⛔ Model name is required for ${meta.displayName}`);
        }

        this.configs.set(key, resolved);
    }

    /**
     * Get (or lazily create) an AI service instance
     * @param provider - Provider key
     * @returns AIService instance
     */
    public getService(provider: string): AIService {
        const key = provider.toLowerCase();

        // Return cached instance
        if (this.services.has(key)) {
            return this.services.get(key)!;
        }

        // Ensure config exists
        const config = this.configs.get(key);
        if (!config) {
            throw new Error(`⛔ Service "${provider}" is not registered. Call registerService() first.`);
        }

        // Look up registry for factory
        const meta = AIProviderService.registry.get(key);
        if (!meta) {
            throw new Error(`⛔ Unknown AI provider: ${provider}`);
        }

        // Create via factory (Strategy pattern)
        const service = meta.factory(config);

        // Cache and return
        this.services.set(key, service);
        return service;
    }

    /**
     * Check if a service is registered
     */
    public hasService(provider: string): boolean {
        return this.configs.has(provider.toLowerCase());
    }

    /**
     * Remove a service registration and cached instance
     */
    public removeService(provider: string): void {
        const key = provider.toLowerCase();
        this.configs.delete(key);
        this.services.delete(key);
    }
}