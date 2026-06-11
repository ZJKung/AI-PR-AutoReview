import { expect } from 'chai';
import * as sinon from 'sinon';
import { buildPrIntentBlock } from '../src/index';
import { AzureDevOpsService } from '../src/services/azure-devops.service';
import { GitHubDevOpsService } from '../src/services/github-devops.service';

describe('PR Intent Block', () => {
    it('should include title and description', () => {
        const block = buildPrIntentBlock('Fix login timeout', 'Increases session TTL to 30 minutes.');
        expect(block).to.contain('Fix login timeout');
        expect(block).to.contain('Increases session TTL to 30 minutes.');
        expect(block).to.contain('PR intent');
    });

    it('should omit the description line when empty', () => {
        const block = buildPrIntentBlock('Fix login timeout', '');
        expect(block).to.contain('Fix login timeout');
        expect(block).to.not.contain('Description');
    });

    it('should return an empty string when there is no title or description', () => {
        expect(buildPrIntentBlock('', '')).to.equal('');
    });
});

describe('getPullRequestDetails', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('Azure DevOps: should return title and description', async () => {
        const service = new AzureDevOpsService('fake-token', 'https://dev.azure.com/fake-org');
        sandbox.stub(service as any, 'getGitApi').resolves({
            getPullRequest: sandbox.stub().resolves({ title: 'My PR', description: 'Does things.' })
        });

        const details = await service.getPullRequestDetails('MyProject', 'repo-id', 7);
        expect(details).to.deep.equal({ title: 'My PR', description: 'Does things.' });
    });

    it('GitHub: should return title and body', async () => {
        const service = new GitHubDevOpsService('fake-token', 'https://github.com');
        sandbox.stub((service as any).client.rest.pulls, 'get').resolves({
            data: { title: 'My PR', body: 'Does things.' }
        } as any);

        const details = await service.getPullRequestDetails('', 'owner/repo', 7);
        expect(details).to.deep.equal({ title: 'My PR', description: 'Does things.' });
    });
});
