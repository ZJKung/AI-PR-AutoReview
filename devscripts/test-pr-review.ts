#!/usr/bin/env node

/// <reference types="node" />

/**
 * Test/Verification Tool: Perform code review functionality test for specified DevOps PR ID
 *
 * Usage:
 *   npx ts-node DEVSCRIPTS/test-pr-review.ts --provider azure --pr 123 --ai claude
 *   npx ts-node DEVSCRIPTS/test-pr-review.ts --provider github --owner USER --repo REPO --pr 456 --ai openai
 */

import * as fs from 'fs';
import * as path from 'path';
import { Main } from '../src/index';
import { AIProviderService } from '../src/services/ai-provider.service';
import { DevOpsProviderService } from '../src/services/devops-provider.service';

interface TestOptions {
    provider: 'azure' | 'github';
    prId: number;
    aiProvider: string;
    modelName: string;
    modelKey: string;
    // For Azure DevOps
    organizationUrl?: string;
    projectName?: string;
    repositoryId?: string;
    accessToken?: string;
    // For GitHub
    owner?: string;
    repo?: string;
    // Feature flags
    enableIncrementalDiff: boolean;
    enableThrottleMode: boolean;
    showReviewContent: boolean;
}

class PRReviewTester {
    private options: TestOptions;
    private main: Main;

    constructor(options: TestOptions) {
        this.options = options;
        this.main = new Main(true); // Debug mode
    }

    /**
     * Parse command line arguments
     */
    static parseArgs(args: string[]): TestOptions {
        const options: any = {
            provider: 'azure',
            enableIncrementalDiff: false,
            enableThrottleMode: true,
            showReviewContent: true,
            aiProvider: 'Claude',
            modelName: 'claude-haiku-4-5',
            modelKey: ''
        };

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            const value = args[i + 1];

            switch (arg) {
                // Specify DevOps provider (azure or github)
                case '--provider':
                    options.provider = value;
                    i++;
                    break;
                // Specify Pull Request ID (required)
                case '--pr':
                    options.prId = parseInt(value);
                    i++;
                    break;
                // Specify AI provider (claude, openai, grok, google)
                case '--ai':
                    options.aiProvider = this.normalizeProvider(value);
                    i++;
                    break;
                // Specify AI model name
                case '--model':
                    options.modelName = value;
                    i++;
                    break;
                // Specify AI API key
                case '--key':
                    options.modelKey = value;
                    i++;
                    break;
                // Specify Azure DevOps organization URL
                case '--org':
                    options.organizationUrl = value;
                    i++;
                    break;
                // Specify Azure DevOps project name
                case '--project':
                    options.projectName = value;
                    i++;
                    break;
                // Specify Azure DevOps repository ID
                case '--repo-id':
                    options.repositoryId = value;
                    i++;
                    break;
                // Specify Azure DevOps personal access token
                case '--token':
                    options.accessToken = value;
                    i++;
                    break;
                // Specify GitHub repository owner
                case '--owner':
                    options.owner = value;
                    i++;
                    break;
                // Specify GitHub repository name
                case '--repo':
                    options.repo = value;
                    i++;
                    break;
                // Enable throttle mode (only send diffs; false sends entire files)
                case '--throttle':
                    options.enableThrottleMode = value.toLowerCase() === 'true';
                    i++;
                    break;
                // Enable incremental diff mode (only review latest push changes)
                case '--incremental':
                    options.enableIncrementalDiff = value.toLowerCase() === 'true';
                    i++;
                    break;
                // Enable verbose logging output
                case '--verbose':
                    options.showReviewContent = value.toLowerCase() === 'true';
                    i++;
                    break;
                // Show help message
                case '--help':
                    this.printHelp();
                    process.exit(0);
                    break;
            }
        }

        if (!options.prId) {
            console.error('❌ Error: PR ID is required (--pr)');
            this.printHelp();
            process.exit(1);
        }

        if (!options.modelKey) {
            options.modelKey = this.getKeyFromEnv(options.aiProvider);
            if (!options.modelKey) {
                console.error(`❌ Error: API key is required for ${options.aiProvider}`);
                console.log('   Provide via --key or environment variable');
                process.exit(1);
            }
        }

        return options;
    }

    /**
     * Normalize provider name
     */
    private static normalizeProvider(provider: string): string {
        const map: Record<string, string> = {
            'claude': 'Claude',
            'openai': 'OpenAI',
            'grok': 'Grok',
            'google': 'Google'
        };
        return map[provider.toLowerCase()] || provider;
    }

    /**
     * Get API Key from environment variable
     */
    private static getKeyFromEnv(provider: string): string {
        const keyMap: Record<string, string> = {
            'Claude': 'ANTHROPIC_API_KEY',
            'OpenAI': 'OPENAI_API_KEY',
            'Grok': 'XAI_API_KEY',
            'Google': 'GOOGLE_API_KEY'
        };

        const envKey = keyMap[provider];
        return envKey ? process.env[envKey] || '' : '';
    }

    /**
     * Print help information
     */
    private static printHelp(): void {
        console.log(`
╔════════════════════════════════════════════════════════════════════╗
║           AI PR AutoReview - Test/Verification Tool              ║
╚════════════════════════════════════════════════════════════════════╝

Usage:
  npx ts-node DEVSCRIPTS/test-pr-review.ts [options]

Required Parameters:
  --pr <ID>                 Pull Request ID (required)
  --provider <TYPE>         DevOps provider: 'azure' or 'github'
                           (default: 'azure')

Azure DevOps Parameters:
  --org <URL>              Organization URL
  --project <NAME>         Project name
  --repo-id <ID>           Repository ID
  --token <TOKEN>          Personal Access Token

GitHub Parameters:
  --owner <USER>           Repository owner
  --repo <NAME>            Repository name

AI Provider Parameters:
  --ai <PROVIDER>          'claude', 'openai', 'grok', 'google'
  --model <NAME>           Model name (e.g., claude-haiku-4-5)
  --key <KEY>              API key (or use environment variable)

Feature Toggles:
  --throttle <true|false>      Enable throttle mode (default: true, only send diffs)
  --incremental <true|false>  Enable incremental diff (default: false)
  --verbose <true|false>     Show verbose logs (default: true)

Examples:
  # Azure DevOps with Claude
  npx ts-node src/test-pr-review.ts \\
    --provider azure \\
    --pr 123 \\
    --org https://dev.azure.com/yourorg \\
    --project MyProject \\
    --repo-id repo123 \\
    --ai claude \\
    --incremental false

  # GitHub with OpenAI
  npx ts-node src/test-pr-review.ts \\
    --provider github \\
    --pr 456 \\
    --owner myusername \\
    --repo myrepo \\
    --ai openai \\
    --model gpt-4 \\
    --key sk-...

  # Enable incremental diff (latest push changes)
  npx ts-node src/test-pr-review.ts \\
    --pr 123 \\
    --incremental true

  # Show help
  npx ts-node src/test-pr-review.ts --help
`);
    }

    /**
     * Execute test
     */
    async run(): Promise<void> {
        console.log('╔════════════════════════════════════════════════════════════════════╗');
        console.log('║         Starting PR Code Review Test                              ║');
        console.log('╚════════════════════════════════════════════════════════════════════╝\n');

        try {
            // Print configuration
            this.printConfiguration();

            // Initialize services
            console.log('\n🔧 Initializing services...');
            const aiProvider = new AIProviderService();
            aiProvider.registerService(this.options.aiProvider, {
                apiKey: this.options.modelKey,
                modelName: this.options.modelName
            });

            const devOpsProvider = new DevOpsProviderService();
            const providerName = this.options.provider === 'azure' ? 'Azure' : 'GitHub';

            devOpsProvider.registerService(providerName, {
                accessToken: this.options.accessToken!,
                organizationUrl: this.options.organizationUrl || this.options.owner
            });

            const devOpsService = devOpsProvider.getService(providerName);

            // Build pipeline inputs
            console.log('\n📋 Preparing pipeline inputs...');
            const inputs = {
                aiProvider: this.options.aiProvider,
                modelName: this.options.modelName,
                modelKey: this.options.modelKey,
                systemInstruction: 'You are a professional code reviewer. Review the code changes and provide feedback in concise bullet points.',
                promptTemplate: '{code_changes}',
                maxOutputTokens: 4096,
                temperature: 1.0,
                fileExtensions: [],
                binaryExtensions: [],
                showReviewContent: this.options.showReviewContent,
                enableThrottleMode: this.options.enableThrottleMode,
                enableIncrementalDiff: this.options.enableIncrementalDiff
            };

            // Get PR changes
            console.log('\n🔍 Getting PR changes...');
            const repositoryId = this.options.provider === 'azure'
                ? this.options.repositoryId!
                : `${this.options.owner}/${this.options.repo}`;

            const changes = await devOpsService.getPullRequestChanges(
                this.options.projectName || this.options.owner || 'default',
                repositoryId,
                this.options.prId,
                inputs.fileExtensions,
                inputs.binaryExtensions,
                inputs.enableThrottleMode,
                inputs.enableIncrementalDiff
            );

            if (!changes || changes.length === 0) {
                console.log('⚠️ No code changes found');
                return;
            }

            console.log(`✅ Found ${changes.length} file changes`);

            // Generate AI review
            console.log('\n🤖 Generating AI review...');
            const reviewContent = await (this.main as any).generateAIReview(aiProvider, inputs, changes);

            // Print results
            console.log('\n' + '='.repeat(80));
            console.log('📄 Review Results');
            console.log('='.repeat(80));
            console.log(reviewContent);
            console.log('='.repeat(80));

            console.log('\n✅ Test completed!');

        } catch (error: any) {
            console.error('\n❌ Error:', error.message);
            if (error.stack) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    }

    /**
     * Print configuration information
     */
    private printConfiguration(): void {
        console.log('⚙️  Test Configuration:');
        console.log(`  • Provider: ${this.options.provider.toUpperCase()}`);
        console.log(`  • PR ID: ${this.options.prId}`);
        console.log(`  • AI Provider: ${this.options.aiProvider}`);
        console.log(`  • Model: ${this.options.modelName}`);
        console.log(`  • Throttle Mode: ${this.options.enableThrottleMode ? '✓ Enabled' : '✗ Disabled'}`);
        console.log(`  • Incremental Diff: ${this.options.enableIncrementalDiff ? '✓ Enabled' : '✗ Disabled'}`);
        console.log(`  • Verbose Output: ${this.options.showReviewContent ? '✓ Enabled' : '✗ Disabled'}`);
    }
}

// Main program
async function main() {
    const args = process.argv.slice(2);
    const options = PRReviewTester.parseArgs(args);
    const tester = new PRReviewTester(options);
    await tester.run();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
