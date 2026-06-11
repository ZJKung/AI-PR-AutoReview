import { expect } from 'chai';
import * as sinon from 'sinon';
import { selectResolvedThreads, fingerprintMarker } from '../src/services/finding-state';
import { InlineThread } from '../src/interfaces/devops-service.interface';
import { AzureDevOpsService } from '../src/services/azure-devops.service';

const botThread = (overrides: Partial<InlineThread>): InlineThread => ({
    id: 1,
    body: `⚠️ **[bug]** Some issue.\n\n${fingerprintMarker('abc123')}`,
    replyCount: 0,
    status: 1, // active
    filePath: '/src/a.ts',
    ...overrides
});

describe('Thread Resolution Selection', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
    });

    afterEach(() => {
        sandbox.restore();
    });

    const changedFiles = new Set(['src/a.ts']);

    it('should resolve a bot thread whose finding disappeared', () => {
        const threads = [botThread({})];
        const result = selectResolvedThreads(threads, new Set(['otherfp']), changedFiles);
        expect(result.map(t => t.id)).to.deep.equal([1]);
    });

    it('should keep a thread whose finding is still reported', () => {
        const threads = [botThread({})];
        expect(selectResolvedThreads(threads, new Set(['abc123']), changedFiles)).to.have.lengthOf(0);
    });

    it('should never resolve threads with human replies', () => {
        const threads = [botThread({ replyCount: 2 })];
        expect(selectResolvedThreads(threads, new Set(), changedFiles)).to.have.lengthOf(0);
    });

    it('should never touch non-bot threads (no fingerprint marker)', () => {
        const threads = [botThread({ body: 'a human inline comment' })];
        expect(selectResolvedThreads(threads, new Set(), changedFiles)).to.have.lengthOf(0);
    });

    it('should keep threads on files outside the current diff', () => {
        const threads = [botThread({ filePath: '/src/untouched.ts' })];
        expect(selectResolvedThreads(threads, new Set(), changedFiles)).to.have.lengthOf(0);
    });

    it('should keep threads that are not active', () => {
        const threads = [botThread({ status: 2 /* already fixed */ })];
        expect(selectResolvedThreads(threads, new Set(), changedFiles)).to.have.lengthOf(0);
    });
});

describe('Azure DevOps resolveThread', () => {
    it('should set the thread status to fixed', async () => {
        const sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
        const service = new AzureDevOpsService('fake-token', 'https://dev.azure.com/fake-org');
        const updateThreadStub = sandbox.stub().resolves({ id: 11 });
        sandbox.stub(service as any, 'getGitApi').resolves({ updateThread: updateThreadStub });

        await service.resolveThread('MyProject', 'repo-id', 7, 11);

        const args = updateThreadStub.firstCall.args;
        expect(args[0]).to.deep.equal({ status: 2 }); // CommentThreadStatus.fixed
        expect(args[1]).to.equal('repo-id');
        expect(args[2]).to.equal(7);
        expect(args[3]).to.equal(11);
        expect(args[4]).to.equal('MyProject');
        sandbox.restore();
    });
});
