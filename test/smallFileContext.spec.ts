import { expect } from 'chai';
import * as sinon from 'sinon';
import { AzureDevOpsService } from '../src/services/azure-devops.service';

describe('Small File Full Context (throttle mode)', () => {
    let sandbox: sinon.SinonSandbox;
    let service: any;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
        service = new AzureDevOpsService('fake-token', 'https://dev.azure.com/fake-org');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should classify files at or under the line limit as small', () => {
        const small = Array(200).fill('line').join('\n');
        const large = Array(201).fill('line').join('\n');

        expect(service.isSmallFile(small)).to.equal(true);
        expect(service.isSmallFile(large)).to.equal(false);
    });

    it('should append full file context after the diff for small files', () => {
        const result = service.appendFullFileContext('@@ -1 +1 @@\n+new line', 'full\nfile\ncontent');

        expect(result).to.contain('@@ -1 +1 @@');
        expect(result.indexOf('@@')).to.be.lessThan(result.indexOf('Full file context'));
        expect(result).to.contain('full\nfile\ncontent');
    });
});
