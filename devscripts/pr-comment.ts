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

    // Add AI analysis result as PR comment
    const commentHeader = `Automated Comment Header`;
    await devOpsService.addPullRequestComment(
        projectName,
        repositoryId,
        pullRequestId,
        `This is a sample comment from the automation tool **Test Content**\n- Suggestion 1: Please modify according to actual analysis results.`,
        commentHeader
    );
}

run().catch(err => {
    console.error('⛔ Unhandled error: ' + err.message);
    process.exit(1);
});