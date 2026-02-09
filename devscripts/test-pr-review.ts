#!/usr/bin/env node

/// <reference types="node" />

/**
 * Test/Verification Tool: Run code review against a specific DevOps PR ID
 *
 * Usage:
 *   npx ts-node DEVSCRIPTS/test-pr-review.ts --provider azure --pr 123 --ai claude
 *   npx ts-node DEVSCRIPTS/test-pr-review.ts --provider github --owner USER --repo REPO --pr 456 --ai openai
 */

import * as fs from 'fs';
import * as path from 'path';
import { Main } from '../src/index';
import { AIProvider, AI_PROVIDERS } from '../src/interfaces/ai-service.interface';
import { AIProviderService } from '../src/services/ai-provider.service';
import { DevOpsProviderService } from '../src/services/devops-provider.service';

interface TestOptions {
    provider: 'azure' | 'github';
    prId: number;
    aiProvider: AIProvider;
    modelName: string;
    apiKey: string;
    apiUrl?: string;
    // For GitHub Copilot
    serverAddress?: string;
    timeout?: number;
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
     * Parse command-line arguments
     */
    static parseArgs(args: string[]): TestOptions {
        const options: any = {
            provider: 'azure',
            enableIncrementalDiff: false,
            enableThrottleMode: true,
            showReviewContent: true,
            aiProvider: 'claude',
            modelName: 'claude-haiku-4-5',
            apiKey: ''
        };

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            const value = args[i + 1];

            switch (arg) {
                // DevOps provider (azure or github)
                case '--provider':
                    options.provider = value;
                    i++;
                    break;
                // Pull Request ID (required)
                case '--pr':
                    options.prId = parseInt(value);
                    i++;
                    break;
                // AI provider (claude, openai, grok, google, githubcopilot, custom)
                case '--ai':
                    options.aiProvider = this.parseProvider(value);
                    i++;
                    break;
                // AI model name
                case '--model':
                    options.modelName = value;
                    i++;
                    break;
                // AI API key
                case '--key':
                    options.apiKey = value;
                    i++;
                    break;
                // API URL (for Custom provider)
                case '--api-url':
                    options.apiUrl = value;
                    i++;
                    break;
                // GitHub Copilot CLI Server address
                case '--server-address':
                    options.serverAddress = value;
                    i++;
                    break;
                // GitHub Copilot request timeout (ms)
                case '--timeout':
                    options.timeout = parseInt(value);
                    i++;
                    break;
                // Azure DevOps organization URL
                case '--org':
                    options.organizationUrl = value;
                    i++;
                    break;
                // Azure DevOps project name
                case '--project':
                    options.projectName = value;
                    i++;
                    break;
                // Azure DevOps repository ID
                case '--repo-id':
                    options.repositoryId = value;
                    i++;
                    break;
                // Azure DevOps personal access token
                case '--token':
                    options.accessToken = value;
                    i++;
                    break;
                // GitHub repository owner
                case '--owner':
                    options.owner = value;
                    i++;
                    break;
                // GitHub repository name
                case '--repo':
                    options.repo = value;
                    i++;
                    break;
                // Enable throttle mode (send diff only; false sends full file)
                case '--throttle':
                    options.enableThrottleMode = value.toLowerCase() === 'true';
                    i++;
                    break;
                // Enable incremental diff (review only the latest push changes)
                case '--incremental':
                    options.enableIncrementalDiff = value.toLowerCase() === 'true';
                    i++;
                    break;
                // Enable verbose log output
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

        // GitHub Copilot does not require an API key; serverAddress is optional (uses local CLI if not provided)
        if (options.aiProvider === 'githubcopilot') {
            if (!options.serverAddress) {
                options.serverAddress = process.env.GitHubCopilotServerAddress || '';
            }
            options.apiKey = ''; // GitHub Copilot does not use an API key
        } else {
            if (!options.apiKey) {
                options.apiKey = this.getKeyFromEnv(options.aiProvider);
                if (!options.apiKey) {
                    console.error(`❌ Error: API key is required for ${options.aiProvider}`);
                    console.log('   Provide via --key or environment variable');
                    process.exit(1);
                }
            }
        }

        return options;
    }

    /**
     * Parse and validate provider string into AIProvider
     */
    private static parseProvider(provider: string): AIProvider {
        const aliases: Record<string, AIProvider> = {
            'copilot': 'githubcopilot'
        };
        const key = aliases[provider.toLowerCase()] ?? provider.toLowerCase();
        if ((AI_PROVIDERS as readonly string[]).includes(key)) {
            return key as AIProvider;
        }
        throw new Error(`⛔ Unknown AI provider: "${provider}". Supported: ${AI_PROVIDERS.join(', ')}`);
    }

    /**
     * Get API key from environment variables
     */
    private static getKeyFromEnv(provider: AIProvider): string {
        const keyMap: Record<string, string> = {
            'claude': 'ANTHROPIC_API_KEY',
            'openai': 'OPENAI_API_KEY',
            'grok': 'XAI_API_KEY',
            'google': 'GOOGLE_API_KEY',
            'githubcopilot': '', // GitHub Copilot does not need an API key
            'custom': ''
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

Required:
  --pr <ID>                 Pull Request ID (required)
  --provider <TYPE>         DevOps provider: 'azure' or 'github'
                           (default: 'azure')

Azure DevOps Options:
  --org <URL>              Organization URL
  --project <NAME>         Project name
  --repo-id <ID>           Repository ID
  --token <TOKEN>          Personal Access Token

GitHub Options:
  --owner <USER>           Repository owner
  --repo <NAME>            Repository name

AI Provider Options:
  --ai <PROVIDER>          'claude', 'openai', 'grok', 'google', 'githubcopilot', 'custom'
  --model <NAME>           Model name (e.g. claude-haiku-4-5, gpt-4o)
  --key <KEY>              API key (or use environment variables)
  --api-url <URL>          API endpoint URL (required for 'custom' provider)
  --server-address <ADDR>  GitHub Copilot CLI Server address (format: host:port)

Feature Flags:
  --throttle <true|false>      Enable throttle mode (default: true, diff only)
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

  # Enable incremental diff (latest push changes only)
  npx ts-node src/test-pr-review.ts \\
    --pr 123 \\
    --incremental true

  # Show help
  npx ts-node src/test-pr-review.ts --help
`);
    }

    /**
     * Run the test
     */
    async run(): Promise<void> {
        console.log('╔════════════════════════════════════════════════════════════════════╗');
        console.log('║           Starting PR Code Review Test                            ║');
        console.log('╚════════════════════════════════════════════════════════════════════╝\n');

        try {
            // Print configuration
            this.printConfiguration();

            // Initialize services
            console.log('\n🔧 Initializing services...');
            const aiProvider = new AIProviderService();
            aiProvider.registerService(this.options.aiProvider, {
                apiKey: this.options.apiKey,
                modelName: this.options.modelName,
                apiUrl: this.options.apiUrl,
                serverAddress: this.options.serverAddress,
                timeout: this.options.timeout
            });

            const devOpsProvider = new DevOpsProviderService();
            const providerName = this.options.provider === 'azure' ? 'Azure' : 'GitHub';

            devOpsProvider.registerService(providerName, {
                accessToken: this.options.accessToken!,
                organizationUrl: this.options.organizationUrl || this.options.owner
            });

            const devOpsService = devOpsProvider.getService(providerName);
            const systemInstruction = `You are a senior software engineer. Please help complete the PR code review and respond according to the following instructions.
1. Begin with a summary conclusion of the analysis, for example: AI Review Status: 🟢 Recommend Approval, 🔴 Recommend Rejection, 🟡 Needs Human Review, followed by a brief explanation within 100 characters, then use <hr/> for a line break.
2. Do not include any content unrelated to the code review.
3. Use Traditional Chinese (zh-TW) for the review result. Each issue should be listed as a bullet point. Use the following format: Emoji [Category] : Detailed explanation. Choose from: 🔴 [Critical], ⚠️ [Warning], 💡 [Suggestion], ✨ [Convention], or ❓ [Question].
4. Since each change may involve multiple modified files, mark each file before its corresponding review comments for easy reference.
5. If too many files are modified to analyze them all, limit the total response length to within 15,000 characters.
6. Skip analysis of images, binary files, or other non-code files.
7. Skip analysis of deleted files.
8. Use Markdown format for the reply.
9. Assume the provided code snippets are part of a larger, valid codebase. Do not report errors regarding "unresolved symbols," "missing definitions," or "reference issues" that may exist outside the provided diff. Focus your analysis strictly on the logic and quality of the changes themselves.`;

            // Build pipeline inputs
            console.log('\n📋 Preparing pipeline inputs...');
            const inputs = {
                aiProvider: this.options.aiProvider,
                modelName: this.options.modelName,
                apiKey: this.options.apiKey,
                serverAddress: this.options.serverAddress,
                timeout: this.options.timeout,
                systemInstruction: systemInstruction,
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
            console.log('\n🔍 Fetching PR changes...');
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

            console.log(`✅ Found ${changes.length} file change(s)`);

            // Generate AI review
            console.log('\n🤖 Generating AI review...');
            const reviewContent = await (this.main as any).generateAIReview(aiProvider, inputs, changes);

            // Print results
            console.log('\n' + '='.repeat(80));
            console.log('📄 Review Result');
            console.log('='.repeat(80));
            console.log(reviewContent);
            console.log('='.repeat(80));

            console.log('\n✅ Test completed!');
            process.exit(0);
        } catch (error: any) {
            console.error('\n❌ Error:', error.message);
            if (error.stack) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    }

    /**
     * Print configuration details
     */
    private printConfiguration(): void {
        console.log('⚙️  Test Configuration:');
        console.log(`  • Provider: ${this.options.provider.toUpperCase()}`);
        console.log(`  • PR ID: ${this.options.prId}`);
        console.log(`  • AI Provider: ${this.options.aiProvider}`);
        console.log(`  • Model: ${this.options.modelName}`);
        if (this.options.aiProvider === 'githubcopilot') {
            console.log(`  • CLI Connection: ${this.options.serverAddress || 'local agent'}`);
        }
        console.log(`  • Throttle Mode: ${this.options.enableThrottleMode ? '✓ Enabled' : '✗ Disabled'}`);
        console.log(`  • Incremental Diff: ${this.options.enableIncrementalDiff ? '✓ Enabled' : '✗ Disabled'}`);
        console.log(`  • Verbose Output: ${this.options.showReviewContent ? '✓ Enabled' : '✗ Disabled'}`);
    }
}

// Main entry point
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
