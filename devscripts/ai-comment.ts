import { AIProviderService } from '../src/services/ai-provider.service';

async function run() {
    // Select AI platform to test based on environment variable AiProvider
    const requested = (process.env.AiProvider ?? 'Google').trim();
    const providerKey = requested.toLowerCase();
    const showReviewContent: boolean = (process.env.ShowReviewContent ?? 'false').toLowerCase() === 'true';

    const aiProvider = new AIProviderService();
    const systemInstruction = `You are a senior software engineer. Please help with code review and analysis.`;
    const prompt = `Can you confirm that you can use C# language?`;

    try {
        let registerConfig: { apiKey: string; modelName: string } | undefined;
        let canonicalName = 'Google';

        if (providerKey === 'openai') {
            canonicalName = 'OpenAI';
            registerConfig = {
                apiKey: process.env.OpenAIAPIKey ?? '',
                modelName: process.env.ModelName ?? 'gpt-4.1-nano'
            };
        } else if (providerKey === 'grok') {
            canonicalName = 'Grok';
            registerConfig = {
                apiKey: process.env.GrokAPIKey ?? '',
                modelName: process.env.ModelName ?? 'grok-3-mini'
            };
        } else if (providerKey === 'claude') {
            canonicalName = 'Claude';
            registerConfig = {
                apiKey: process.env.ClaudeAPIKey ?? '',
                modelName: process.env.ModelName ?? 'claude-haiku-4-5'
            };
        } else if (providerKey === 'google') {
            canonicalName = 'Google';
            registerConfig = {
                apiKey: process.env.GeminiAPIKey ?? '',
                modelName: process.env.ModelName ?? 'gemini-2.5-flash'
            };
        } else {
            throw new Error(`⛔ Unsupported AI Provider: ${requested}`);
        }

        aiProvider.registerService(canonicalName, {
            apiKey: registerConfig.apiKey,
            modelName: registerConfig.modelName
        });

        const aiService = aiProvider.getService(canonicalName);

        const response = await aiService.generateComment(
            systemInstruction,
            prompt,
            {
                maxOutputTokens: parseInt(process.env.MaxOutputTokens ?? '3000'),
                temperature: parseFloat(process.env.Temperature ?? '1.0'),
                showReviewContent: showReviewContent
            }
        );
    } catch (err: any) {
        console.error('⛔ Unhandled error: ' + (err?.message || String(err)));
        process.exit(1);
    }
}

run().catch(err => {
    console.error('⛔ Unhandled error: ' + err.message);
    process.exit(1);
});