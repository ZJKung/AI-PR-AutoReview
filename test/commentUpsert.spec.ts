import { expect } from 'chai';
import * as sinon from 'sinon';
import { AzureDevOpsService } from '../src/services/azure-devops.service';
import { GitHubDevOpsService } from '../src/services/github-devops.service';

const MARKER = '<!-- ai-review:summary -->';

describe('Bot Comment Find & Update', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('Azure DevOps', () => {
        let service: AzureDevOpsService;
        let getThreadsStub: sinon.SinonStub;
        let updateCommentStub: sinon.SinonStub;

        beforeEach(() => {
            service = new AzureDevOpsService('fake-token', 'https://dev.azure.com/fake-org');
            getThreadsStub = sandbox.stub();
            updateCommentStub = sandbox.stub().resolves({ id: 1 });
            sandbox.stub(service as any, 'getGitApi').resolves({
                getThreads: getThreadsStub,
                updateComment: updateCommentStub
            });
        });

        it('should find the bot comment by marker', async () => {
            getThreadsStub.resolves([
                { id: 10, comments: [{ id: 1, content: 'human comment' }] },
                { id: 11, comments: [{ id: 1, content: `# AI Review\nold content\n${MARKER}` }] }
            ]);

            const found = await service.findBotComment('MyProject', 'repo-id', 7, MARKER);
            expect(found).to.deep.equal({ threadId: 11, commentId: 1 });
        });

        it('should return null when no comment carries the marker', async () => {
            getThreadsStub.resolves([
                { id: 10, comments: [{ id: 1, content: 'human comment' }] }
            ]);

            expect(await service.findBotComment('MyProject', 'repo-id', 7, MARKER)).to.equal(null);
        });

        it('should skip deleted threads', async () => {
            getThreadsStub.resolves([
                { id: 10, isDeleted: true, comments: [{ id: 1, content: MARKER }] }
            ]);

            expect(await service.findBotComment('MyProject', 'repo-id', 7, MARKER)).to.equal(null);
        });

        it('should update the comment in place', async () => {
            await service.updatePullRequestComment('MyProject', 'repo-id', 7, { threadId: 11, commentId: 1 }, 'new content');

            const args = updateCommentStub.firstCall.args;
            expect(args[0]).to.deep.equal({ content: 'new content' });
            expect(args[1]).to.equal('repo-id');
            expect(args[2]).to.equal(7);
            expect(args[3]).to.equal(11); // thread ID
            expect(args[4]).to.equal(1);  // comment ID
            expect(args[5]).to.equal('MyProject');
        });
    });

    describe('GitHub', () => {
        let service: GitHubDevOpsService;
        let listCommentsStub: sinon.SinonStub;
        let updateCommentStub: sinon.SinonStub;

        beforeEach(() => {
            service = new GitHubDevOpsService('fake-token', 'https://github.com');
            listCommentsStub = sandbox.stub((service as any).client.rest.issues, 'listComments');
            updateCommentStub = sandbox
                .stub((service as any).client.rest.issues, 'updateComment')
                .resolves({ data: { id: 5 } } as any);
        });

        it('should find the bot comment by marker', async () => {
            listCommentsStub.resolves({
                data: [
                    { id: 4, body: 'human comment' },
                    { id: 5, body: `# AI Review\nold content\n${MARKER}` }
                ]
            } as any);

            const found = await service.findBotComment('', 'owner/repo', 7, MARKER);
            expect(found).to.deep.equal({ commentId: 5 });
        });

        it('should return null when no comment carries the marker', async () => {
            listCommentsStub.resolves({ data: [{ id: 4, body: 'human comment' }] } as any);

            expect(await service.findBotComment('', 'owner/repo', 7, MARKER)).to.equal(null);
        });

        it('should update the comment in place', async () => {
            await service.updatePullRequestComment('', 'owner/repo', 7, { commentId: 5 }, 'new content');

            const args = updateCommentStub.firstCall.args[0];
            expect(args.comment_id).to.equal(5);
            expect(args.body).to.equal('new content');
            expect(args.owner).to.equal('owner');
            expect(args.repo).to.equal('repo');
        });
    });
});
