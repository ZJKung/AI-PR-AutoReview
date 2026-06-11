import { expect } from 'chai';
import * as sinon from 'sinon';
import { splitIntoChunks, runWithConcurrency } from '../src/services/chunking.service';
import { Main } from '../src/index';
import { PipelineInputs } from '../src/interfaces/pipeline-inputs.interface';

const file = (path: string, size: number) => ({ path, changeType: 'edit', content: 'x'.repeat(size) });

describe('Chunk Splitting', () => {
    it('should keep everything in one chunk when under budget', () => {
        const chunks = splitIntoChunks([file('a.ts', 100), file('b.ts', 100)], 1000);
        expect(chunks).to.have.lengthOf(1);
        expect(chunks[0].files.map(f => f.path)).to.deep.equal(['a.ts', 'b.ts']);
    });

    it('should split at the budget boundary preserving order', () => {
        const chunks = splitIntoChunks([file('a.ts', 600), file('b.ts', 600), file('c.ts', 600)], 1000);
        expect(chunks).to.have.lengthOf(3);
        expect(chunks.map(c => c.files[0].path)).to.deep.equal(['a.ts', 'b.ts', 'c.ts']);
    });

    it('should give an oversized file its own chunk without dropping it', () => {
        const chunks = splitIntoChunks([file('small.ts', 100), file('huge.ts', 5000)], 1000);
        expect(chunks).to.have.lengthOf(2);
        expect(chunks[1].files[0].path).to.equal('huge.ts');
    });
});

describe('Bounded Concurrency', () => {
    it('should run all tasks and preserve result order', async () => {
        const results = await runWithConcurrency(
            [1, 2, 3, 4, 5].map(n => async () => n * 10),
            2
        );
        expect(results).to.deep.equal([10, 20, 30, 40, 50]);
    });

    it('should never exceed the concurrency limit', async () => {
        let active = 0;
        let maxActive = 0;
        const tasks = Array.from({ length: 6 }, () => async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise(resolve => setTimeout(resolve, 5));
            active--;
            return active;
        });

        await runWithConcurrency(tasks, 2);
        expect(maxActive).to.be.at.most(2);
    });
});

describe('Chunked AI Review', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
    });

    afterEach(() => {
        sandbox.restore();
    });

    const inputs = {
        aiProvider: 'google',
        systemInstruction: 'review',
        promptTemplate: '{code_changes}',
        maxOutputTokens: 1000,
        temperature: 1,
        showReviewContent: false
    } as unknown as PipelineInputs;

    it('should use a single request for small change sets', async () => {
        const generateComment = sandbox.stub().resolves({ content: 'review', inputTokens: 1, outputTokens: 1 });
        const fakeProvider: any = { getService: () => ({ generateComment }) };
        const main = new Main(true);

        const result = await main.generateAIReview(fakeProvider, inputs, [file('a.ts', 100)]);
        expect(generateComment.callCount).to.equal(1);
        expect(result.content).to.equal('review');
    });

    it('should review chunks in parallel and aggregate for large change sets', async () => {
        const generateComment = sandbox.stub().resolves({ content: 'partial', inputTokens: 10, outputTokens: 5 });
        generateComment.onCall(3).resolves({ content: 'merged review', inputTokens: 10, outputTokens: 5 });
        const fakeProvider: any = { getService: () => ({ generateComment }) };
        const main = new Main(true);

        // Three files of ~60k chars each exceed the default budget → 3 chunk calls + 1 aggregation
        const changes = [file('a.ts', 60000), file('b.ts', 60000), file('c.ts', 60000)];
        const result = await main.generateAIReview(fakeProvider, inputs, changes);

        expect(generateComment.callCount).to.equal(4);
        expect(result.content).to.equal('merged review');
        expect(result.inputTokens).to.equal(40);
        expect(result.outputTokens).to.equal(20);
    });

    it('should survive a failing chunk and aggregate the rest', async () => {
        const generateComment = sandbox.stub().resolves({ content: 'partial', inputTokens: 10, outputTokens: 5 });
        generateComment.onCall(1).rejects(new Error('provider blip'));
        generateComment.onCall(3).resolves({ content: 'merged review', inputTokens: 10, outputTokens: 5 });
        const fakeProvider: any = { getService: () => ({ generateComment }) };
        const main = new Main(true);
        sandbox.stub(console, 'error');

        const changes = [file('a.ts', 60000), file('b.ts', 60000), file('c.ts', 60000)];
        const result = await main.generateAIReview(fakeProvider, inputs, changes);

        expect(result.content).to.equal('merged review');
    });
});
