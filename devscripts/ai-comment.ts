import { AIProviderService } from '../src/services/ai-provider.service';
import { AIProvider, AI_PROVIDERS } from '../src/interfaces/ai-service.interface';

async function run() {
    // Select AI platform to test based on environment variable AiProvider
    const requested = (process.env.AiProvider ?? 'google').trim();
    const providerKey = requested.toLowerCase();
    const showReviewContent: boolean = (process.env.ShowReviewContent ?? 'false').toLowerCase() === 'true';

    // Validate provider
    if (!(AI_PROVIDERS as readonly string[]).includes(providerKey)) {
        throw new Error(`⛔ Unsupported AI Provider: ${requested}. Supported: ${AI_PROVIDERS.join(', ')}`);
    }
    const provider = providerKey as AIProvider;

    const aiProvider = new AIProviderService();
    const systemInstruction = `You are a senior software engineer. Please help with code review and analysis.`;
    const prompt = `Can you confirm that you can use C# language?`;

    try {
        // Resolve API key: unified env var first, then per-provider fallback
        const apiKey = process.env.ApiKey
            ?? process.env.OPENAI_API_KEY
            ?? process.env.ANTHROPIC_API_KEY
            ?? process.env.XAI_API_KEY
            ?? process.env.GOOGLE_API_KEY
            ?? '';
        const modelName = process.env.ModelName || AIProviderService.getDefaultModel(provider);
        const apiUrl = process.env.ApiUrl || undefined;
        const serverAddress = provider === 'githubcopilot'
            ? (process.env.GitHubCopilotServerAddress ?? '')
            : undefined;

        aiProvider.registerService(provider, {
            apiKey,
            modelName,
            apiUrl,
            serverAddress
        });

        const aiService = aiProvider.getService(provider);

        const response = await aiService.generateComment(
            systemInstruction,
            prompt,
            {
                maxOutputTokens: parseInt(process.env.MaxOutputTokens ?? '3000'),
                temperature: parseFloat(process.env.Temperature ?? '1.0'),
                showReviewContent: showReviewContent
            }
        );
        process.exit(0);
    } catch (err: any) {
        console.error('⛔ Unhandled error: ' + (err?.message || String(err)));
        process.exit(1);
    }
}

run().catch(err => {
    console.error('⛔ Unhandled error: ' + err.message);
    process.exit(1);
});