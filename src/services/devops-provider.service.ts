import { DevOpsService, DevOpsServiceConfig } from '../interfaces/devops-service.interface';
import { AzureDevOpsService } from './azure-devops.service';
import { GitHubDevOpsService } from './github-devops.service';

/**
 * DevOps Service Provider Class
 * Centrally manages the creation and access of all DevOps services
 */
export class DevOpsProviderService {
    private services: Map<string, DevOpsService>;
    private configs: Map<string, DevOpsServiceConfig>;

    /**
     * Create DevOps Service Provider instance
     */
    constructor() {
        this.services = new Map();
        this.configs = new Map();
    }

    /**
     * Register DevOps service configuration
     * @param provider - DevOps service provider name (azure or github)
     * @param config - DevOps service configuration
     * @throws {Error} Throws error when configuration is invalid
     */
    public registerService(provider: string, config: DevOpsServiceConfig): void {
        if (!config.accessToken || config.accessToken.trim() === '') {
            throw new Error('⛔ Access token is required');
        }

        this.configs.set(provider.toLowerCase(), config);
    }

    /**
     * Get DevOps service instance
     * @param provider - DevOps service provider name (azure or github)
     * @returns DevOps service instance
     * @throws {Error} Throws error when provider is unsupported or not registered
     */
    public getService(provider: string): DevOpsService {
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
        let service: DevOpsService;
        switch (normalizedProvider) {
            case 'azure':
            case 'azuredevops':
                service = new AzureDevOpsService(config.accessToken, config.organizationUrl);
                break;
            case 'github':
                service = new GitHubDevOpsService(config.accessToken, config.organizationUrl);
                break;
            default:
                throw new Error(`⛔ Unsupported DevOps provider: ${provider}`);
        }

        // Cache instance
        this.services.set(normalizedProvider, service);
        return service;
    }

    /**
     * Auto-detect provider type
     * @param organizationUrl - Organization URL
     * @returns Provider name (azure or github)
     */
    public static detectProvider(organizationUrl?: string): 'azure' | 'github' {
        console.log(`🚩 Detecting provider from organizationUrl: ${organizationUrl}`);
        if (!organizationUrl) {
            return 'azure'; // Default to Azure
        }

        const url = organizationUrl.toLowerCase();
        if (url.includes('github')) {
            return 'github';
        }

        return 'azure';
    }

    /**
     * Check if service is registered
     * @param provider - DevOps service provider name
     * @returns Whether service is registered
     */
    public hasService(provider: string): boolean {
        return this.configs.has(provider.toLowerCase());
    }

    /**
     * Remove service registration
     * @param provider - DevOps service provider name
     */
    public removeService(provider: string): void {
        const normalizedProvider = provider.toLowerCase();
        this.configs.delete(normalizedProvider);
        this.services.delete(normalizedProvider);
    }
}
