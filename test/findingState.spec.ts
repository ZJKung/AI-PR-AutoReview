import { expect } from 'chai';
import * as sinon from 'sinon';
import {
    computeFindingFingerprint,
    fingerprintMarker,
    extractFingerprints,
    selectNewFindings
} from '../src/services/finding-state';
import { ReviewFinding } from '../src/interfaces/review-finding.interface';
import { AzureDevOpsService } from '../src/services/azure-devops.service';
import { GitHubDevOpsService } from '../src/services/github-devops.service';

const finding = (overrides: Partial<ReviewFinding>): ReviewFinding => ({
    file: '/src/a.ts',
    line: 10,
    severity: 'warning',
    category: 'bug',
    finding: 'Possible null dereference of user.',
    ...overrides
});

describe('Finding Fingerprints', () => {
    it('should be stable across LLM re-phrasings of the same finding', () => {
        const a = computeFindingFingerprint(finding({ finding: 'Possible null dereference of user.' }));
        const b = computeFindingFingerprint(finding({ finding: 'The user object may be null here and is dereferenced.' }));
        expect(a).to.equal(b);
    });

    it('should be stable across small line shifts', () => {
        const a = computeFindingFingerprint(finding({ line: 10 }));
        const b = computeFindingFingerprint(finding({ line: 11 }));
        expect(a).to.equal(b);
    });

    it('should differ for distant lines', () => {
        const a = computeFindingFingerprint(finding({ line: 10 }));
        const b = computeFindingFingerprint(finding({ line: 80 }));
        expect(a).to.not.equal(b);
    });

    it('should differ per category and per file', () => {
        const base = computeFindingFingerprint(finding({}));
        expect(computeFindingFingerprint(finding({ category: 'security' }))).to.not.equal(base);
        expect(computeFindingFingerprint(finding({ file: '/src/b.ts' }))).to.not.equal(base);
    });

    it('should normalize path variants to the same fingerprint', () => {
        const withSlash = computeFindingFingerprint(finding({ file: '/src/a.ts' }));
        const withoutSlash = computeFindingFingerprint(finding({ file: 'src/a.ts' }));
        expect(withSlash).to.equal(withoutSlash);
    });

    it('should round-trip through marker embedding and extraction', () => {
        const fp = computeFindingFingerprint(finding({}));
        const body = `⚠️ **[bug]** Some text.\n\n${fingerprintMarker(fp)}`;

        const extracted = extractFingerprints([body, 'no marker here']);
        expect(extracted.has(fp)).to.equal(true);
        expect(extracted.size).to.equal(1);
    });

    it('should select only findings not already posted', () => {
        const posted = finding({ line: 10 });
        const fresh = finding({ line: 80, finding: 'Another problem.' });
        const existing = new Set([computeFindingFingerprint(posted)]);

        const result = selectNewFindings([posted, fresh], existing);
        expect(result).to.deep.equal([fresh]);
    });
});

describe('Inline Thread Listing', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('Azure DevOps: should list inline threads with body, reply count, and status', async () => {
        const service = new AzureDevOpsService('fake-token', 'https://dev.azure.com/fake-org');
        sandbox.stub(service as any, 'getGitApi').resolves({
            getThreads: sandbox.stub().resolves([
                {
                    id: 1,
                    status: 1,
                    threadContext: { filePath: '/src/a.ts' },
                    comments: [{ id: 1, content: 'inline finding' }, { id: 2, content: 'human reply' }]
                },
                { id: 2, status: 1, comments: [{ id: 1, content: 'summary comment, no threadContext' }] },
                { id: 3, isDeleted: true, threadContext: { filePath: '/x.ts' }, comments: [{ id: 1, content: 'deleted' }] }
            ])
        });

        const threads = await service.listInlineThreads('MyProject', 'repo-id', 7);
        expect(threads).to.have.lengthOf(1);
        expect(threads[0]).to.deep.include({ id: 1, body: 'inline finding', replyCount: 1, status: 1 });
    });

    it('GitHub: should list top-level review comments with reply counts', async () => {
        const service = new GitHubDevOpsService('fake-token', 'https://github.com');
        sandbox.stub((service as any).client.rest.pulls, 'listReviewComments').resolves({
            data: [
                { id: 100, body: 'inline finding', in_reply_to_id: undefined },
                { id: 101, body: 'human reply', in_reply_to_id: 100 }
            ]
        } as any);

        const threads = await service.listInlineThreads('', 'owner/repo', 7);
        expect(threads).to.have.lengthOf(1);
        expect(threads[0]).to.deep.include({ id: 100, body: 'inline finding', replyCount: 1 });
    });
});
