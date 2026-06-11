import { expect } from 'chai';
import * as sinon from 'sinon';
import { AzureDevOpsService } from '../src/services/azure-devops.service';
import { GitHubDevOpsService } from '../src/services/github-devops.service';

describe('Inline Finding Comments', () => {
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
        let createThreadStub: sinon.SinonStub;

        beforeEach(() => {
            service = new AzureDevOpsService('fake-token', 'https://dev.azure.com/fake-org');
            createThreadStub = sandbox.stub().resolves({ id: 42 });
            sandbox.stub(service as any, 'getGitApi').resolves({ createThread: createThreadStub });
        });

        it('should post a thread with a suggested-change block when a suggestion exists', async () => {
            const id = await service.addInlineSuggestionComment(
                'repo-id', 7, '/src/app.ts', 12, 'Use === here.', 'if (a === b) {', '', 'MyProject'
            );

            expect(id).to.equal(42);
            const [thread] = createThreadStub.firstCall.args;
            expect(thread.comments[0].content).to.contain('Use === here.');
            expect(thread.comments[0].content).to.contain('**Suggested change:**');
            expect(thread.comments[0].content).to.contain('if (a === b) {');
        });

        it('should post a plain thread without a suggested-change block when no suggestion', async () => {
            await service.addInlineSuggestionComment(
                'repo-id', 7, '/src/app.ts', 12, 'Token is logged in plaintext.', undefined, '', 'MyProject'
            );

            const [thread] = createThreadStub.firstCall.args;
            expect(thread.comments[0].content).to.contain('Token is logged in plaintext.');
            expect(thread.comments[0].content).to.not.contain('Suggested change');
            expect(thread.comments[0].content).to.not.contain('```');
        });

        it('should anchor the thread to the right-side line with a normalized path', async () => {
            await service.addInlineSuggestionComment(
                'repo-id', 7, 'src/app.ts', 12, 'note', 'fix', '', 'MyProject'
            );

            const [thread] = createThreadStub.firstCall.args;
            expect(thread.threadContext.filePath).to.equal('/src/app.ts');
            expect(thread.threadContext.rightFileStart).to.deep.equal({ line: 12, offset: 1 });
            expect(thread.threadContext.rightFileEnd).to.deep.equal({ line: 12, offset: 1 });
        });
    });

    describe('GitHub', () => {
        let service: GitHubDevOpsService;
        let createReviewCommentStub: sinon.SinonStub;

        beforeEach(() => {
            service = new GitHubDevOpsService('fake-token', 'https://github.com');
            createReviewCommentStub = sandbox
                .stub((service as any).client.rest.pulls, 'createReviewComment')
                .resolves({ data: { id: 99 } } as any);
        });

        it('should include a suggestion fence when a suggestion exists', async () => {
            const id = await service.addInlineSuggestionComment(
                'owner/repo', 7, 'src/app.ts', 12, 'Use === here.', 'if (a === b) {', 'commit-sha'
            );

            expect(id).to.equal(99);
            const args = createReviewCommentStub.firstCall.args[0];
            expect(args.body).to.contain('```suggestion\nif (a === b) {\n```');
            expect(args.line).to.equal(12);
            expect(args.side).to.equal('RIGHT');
        });

        it('should post a plain review comment without a fence when no suggestion', async () => {
            await service.addInlineSuggestionComment(
                'owner/repo', 7, 'src/app.ts', 12, 'Token is logged in plaintext.', undefined, 'commit-sha'
            );

            const args = createReviewCommentStub.firstCall.args[0];
            expect(args.body).to.equal('Token is logged in plaintext.');
            expect(args.body).to.not.contain('```suggestion');
        });

        it('should strip a leading slash from the file path', async () => {
            await service.addInlineSuggestionComment(
                'owner/repo', 7, '/src/app.ts', 12, 'note', 'fix', 'commit-sha'
            );

            const args = createReviewCommentStub.firstCall.args[0];
            expect(args.path).to.equal('src/app.ts');
        });
    });
});
