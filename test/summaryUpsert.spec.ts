import { expect } from 'chai';
import * as sinon from 'sinon';
import { Main, SUMMARY_MARKER } from '../src/index';
import { DevOpsConnection } from '../src/interfaces/pipeline-inputs.interface';

const connection: DevOpsConnection = {
    accessToken: 'token',
    collectionUri: 'https://dev.azure.com/org',
    projectName: 'MyProject',
    repositoryId: 'repo-id',
    pullRequestId: 7
};

describe('Update Existing Comment Input', () => {
    let sandbox: sinon.SinonSandbox;
    let main: Main;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
        sandbox.stub(console, 'warn');
        main = new Main(true);
        process.env.AiProvider = 'Google';
    });

    afterEach(() => {
        sandbox.restore();
        delete process.env.AiProvider;
        delete process.env.EnableSuggestionMode;
        delete process.env.UpdateExistingComment;
    });

    it('should default on when suggestion mode is enabled (auto)', () => {
        process.env.EnableSuggestionMode = 'true';
        expect(main.getPipelineInputs().updateExistingComment).to.equal(true);
    });

    it('should default off when suggestion mode is disabled (auto)', () => {
        process.env.EnableSuggestionMode = 'false';
        expect(main.getPipelineInputs().updateExistingComment).to.equal(false);
    });

    it('should honor explicit on even without suggestion mode', () => {
        process.env.EnableSuggestionMode = 'false';
        process.env.UpdateExistingComment = 'on';
        expect(main.getPipelineInputs().updateExistingComment).to.equal(true);
    });

    it('should honor explicit off even with suggestion mode', () => {
        process.env.EnableSuggestionMode = 'true';
        process.env.UpdateExistingComment = 'off';
        expect(main.getPipelineInputs().updateExistingComment).to.equal(false);
    });
});

describe('Summary Comment Upsert', () => {
    let sandbox: sinon.SinonSandbox;
    let main: Main;
    let addStub: sinon.SinonStub;
    let findStub: sinon.SinonStub;
    let updateStub: sinon.SinonStub;
    let fakeService: any;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
        main = new Main(true);
        addStub = sandbox.stub().resolves(1);
        findStub = sandbox.stub().resolves(null);
        updateStub = sandbox.stub().resolves();
        fakeService = {
            addPullRequestComment: addStub,
            findBotComment: findStub,
            updatePullRequestComment: updateStub
        };
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should create a marked comment when none exists (upsert on)', async () => {
        await main.addReviewComment(fakeService, connection, 'review text', 'google', 'gemini', true);

        expect(findStub.calledOnce).to.equal(true);
        expect(updateStub.called).to.equal(false);
        expect(addStub.calledOnce).to.equal(true);
        const content = addStub.firstCall.args[3];
        expect(content).to.contain('review text');
        expect(content).to.contain(SUMMARY_MARKER);
    });

    it('should update in place when a marked comment exists (upsert on)', async () => {
        findStub.resolves({ threadId: 11, commentId: 1 });

        await main.addReviewComment(fakeService, connection, 'new review', 'google', 'gemini', true);

        expect(updateStub.calledOnce).to.equal(true);
        expect(addStub.called).to.equal(false);
        const newContent = updateStub.firstCall.args[4];
        expect(newContent).to.contain('new review');
        expect(newContent).to.contain(SUMMARY_MARKER);
    });

    it('should append a new comment without searching when upsert is off', async () => {
        await main.addReviewComment(fakeService, connection, 'review text', 'google', 'gemini', false);

        expect(findStub.called).to.equal(false);
        expect(updateStub.called).to.equal(false);
        expect(addStub.calledOnce).to.equal(true);
    });

    it('should fall back to append when the provider lacks upsert support', async () => {
        const minimalService: any = { addPullRequestComment: addStub };

        await main.addReviewComment(minimalService, connection, 'review text', 'google', 'gemini', true);

        expect(addStub.calledOnce).to.equal(true);
    });
});
