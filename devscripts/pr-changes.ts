import { DevOpsProviderService } from '../src/services/devops-provider.service';

async function run() {
    // Initialize DevOps API
    const accessToken = process.env.DevOpsAccessToken;
    const organizationUrl = process.env.DevOpsOrgUrl;

    const devOpsProvider = new DevOpsProviderService();
    const provider = DevOpsProviderService.detectProvider(organizationUrl);
    devOpsProvider.registerService(provider, {
        accessToken: accessToken!,
        organizationUrl: organizationUrl
    });
    const devOpsService = devOpsProvider.getService(provider);

    // DevOps related configuration
    const projectName = process.env.DevOpsProjectName || '';
    const repositoryId = process.env.DevOpsRepositoryId || '';
    const pullRequestId = +(process.env.DevOpsPRId || '0');
    const fileExtensions = process.env.FileExtensions?.split(',').filter(ext => ext) || [];
    const binaryExtensions = process.env.BinaryExtensions?.split(',').filter(ext => ext) || [];
    const enableThrottleMode = (process.env.EnableThrottleMode ?? 'true').toLowerCase() === 'true';

    // Get PR changed files
    const changes = await devOpsService.getPullRequestChanges(
        projectName,
        repositoryId,
        pullRequestId,
        fileExtensions,  // File types to include
        binaryExtensions,  // File types to exclude
        enableThrottleMode  // Throttle mode
    );
    for (const c in changes) {
        console.log(`Change ${c}: ${JSON.stringify(c)}`);
    }
    if (!changes) {
        console.log('❌ No matching changed files found');
        return;
    }

    for (const change of changes) {
        console.log(`🔍 File path: ${change.path}`);
        console.log(`📝 Change type: ${change.changeType}`);
        console.log(`📄 File content:\n${change.content}\n`);
    }
}

run().catch(err => {
    console.error('⛔ Unhandled error: ' + err.message);
    process.exit(1);
});