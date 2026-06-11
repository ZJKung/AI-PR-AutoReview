import { expect } from 'chai';
import * as sinon from 'sinon';
import { filterFindings } from '../src/services/finding-parser';
import { ReviewFinding } from '../src/interfaces/review-finding.interface';
import { Main } from '../src/index';

const finding = (overrides: Partial<ReviewFinding>): ReviewFinding => ({
    file: 'src/a.ts',
    line: 1,
    severity: 'warning',
    category: 'bug',
    finding: 'an issue',
    ...overrides
});

describe('Finding Filter', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
        sandbox.stub(console, 'warn');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should exclude nit findings when threshold is warning', () => {
        const findings = [
            finding({ severity: 'critical' }),
            finding({ severity: 'warning' }),
            finding({ severity: 'nit' })
        ];

        const result = filterFindings(findings, 'warning', 20);
        expect(result.map(f => f.severity)).to.deep.equal(['critical', 'warning']);
    });

    it('should include all severities when threshold is nit', () => {
        const findings = [
            finding({ severity: 'critical' }),
            finding({ severity: 'warning' }),
            finding({ severity: 'nit' })
        ];

        expect(filterFindings(findings, 'nit', 20)).to.have.lengthOf(3);
    });

    it('should only include critical findings when threshold is critical', () => {
        const findings = [
            finding({ severity: 'critical' }),
            finding({ severity: 'warning' }),
            finding({ severity: 'nit' })
        ];

        const result = filterFindings(findings, 'critical', 20);
        expect(result).to.have.lengthOf(1);
        expect(result[0].severity).to.equal('critical');
    });

    it('should cap results at maxFindings keeping highest severity first', () => {
        const findings = [
            finding({ severity: 'warning', line: 1 }),
            finding({ severity: 'nit', line: 2 }),
            finding({ severity: 'critical', line: 3 }),
            finding({ severity: 'warning', line: 4 })
        ];

        const result = filterFindings(findings, 'nit', 2);
        expect(result).to.have.lengthOf(2);
        expect(result[0].severity).to.equal('critical');
        expect(result[1].severity).to.equal('warning');
        expect(result[1].line).to.equal(1); // stable order among equal severities
    });

    it('should return everything unchanged when under the cap and threshold', () => {
        const findings = [finding({ line: 1 }), finding({ line: 2 })];
        expect(filterFindings(findings, 'warning', 20)).to.deep.equal(findings);
    });
});

describe('Severity Threshold Inputs', () => {
    let sandbox: sinon.SinonSandbox;
    let main: Main;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
        sandbox.stub(console, 'warn');
        main = new Main(true); // debug mode reads env vars
        process.env.AiProvider = 'Google';
    });

    afterEach(() => {
        sandbox.restore();
        delete process.env.AiProvider;
        delete process.env.SeverityThreshold;
        delete process.env.MaxFindings;
    });

    it('should default severityThreshold to warning and maxFindings to 20', () => {
        const inputs = main.getPipelineInputs();
        expect(inputs.severityThreshold).to.equal('warning');
        expect(inputs.maxFindings).to.equal(20);
    });

    it('should read configured threshold and max findings', () => {
        process.env.SeverityThreshold = 'nit';
        process.env.MaxFindings = '5';

        const inputs = main.getPipelineInputs();
        expect(inputs.severityThreshold).to.equal('nit');
        expect(inputs.maxFindings).to.equal(5);
    });

    it('should fall back to defaults on invalid values', () => {
        process.env.SeverityThreshold = 'blocker';
        process.env.MaxFindings = 'lots';

        const inputs = main.getPipelineInputs();
        expect(inputs.severityThreshold).to.equal('warning');
        expect(inputs.maxFindings).to.equal(20);
    });
});
