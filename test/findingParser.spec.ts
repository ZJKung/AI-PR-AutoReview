import { expect } from 'chai';
import * as sinon from 'sinon';
import { parseFindingsResponse } from '../src/services/finding-parser';

describe('Finding Parser', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        // Suppress warn output during tests
        sandbox.stub(console, 'warn');
    });

    afterEach(() => {
        sandbox.restore();
    });

    const wrap = (json: string) => '```json\n' + json + '\n```';

    it('should parse a valid response with all fields', () => {
        const response = wrap(JSON.stringify([
            {
                file: 'src/utils.ts',
                line: 42,
                severity: 'critical',
                category: 'bug',
                finding: 'Using == instead of === can cause unexpected type coercion.',
                suggestion: '  if (value === null) {'
            }
        ]));

        const findings = parseFindingsResponse(response);
        expect(findings).to.have.lengthOf(1);
        expect(findings[0].file).to.equal('src/utils.ts');
        expect(findings[0].line).to.equal(42);
        expect(findings[0].severity).to.equal('critical');
        expect(findings[0].category).to.equal('bug');
        expect(findings[0].finding).to.contain('type coercion');
        expect(findings[0].suggestion).to.equal('  if (value === null) {');
    });

    it('should accept a finding without a suggestion', () => {
        const response = wrap(JSON.stringify([
            {
                file: 'src/auth.ts',
                line: 10,
                severity: 'warning',
                category: 'security',
                finding: 'Token is logged in plaintext.'
            }
        ]));

        const findings = parseFindingsResponse(response);
        expect(findings).to.have.lengthOf(1);
        expect(findings[0].suggestion).to.equal(undefined);
    });

    it('should drop items with an unrecognized severity but keep valid ones', () => {
        const response = wrap(JSON.stringify([
            { file: 'a.ts', line: 1, severity: 'bananas', category: 'bug', finding: 'x' },
            { file: 'b.ts', line: 2, severity: 'nit', category: 'style', finding: 'y' }
        ]));

        const findings = parseFindingsResponse(response);
        expect(findings).to.have.lengthOf(1);
        expect(findings[0].file).to.equal('b.ts');
    });

    it('should map common severity synonyms instead of dropping them', () => {
        const response = wrap(JSON.stringify([
            { file: 'a.ts', line: 1, severity: 'blocker', category: 'bug', finding: 'w' },
            { file: 'b.ts', line: 2, severity: 'high', category: 'bug', finding: 'x' },
            { file: 'c.ts', line: 3, severity: 'medium', category: 'perf', finding: 'y' },
            { file: 'd.ts', line: 4, severity: 'low', category: 'style', finding: 'z' },
            { file: 'e.ts', line: 5, severity: 'Critical', category: 'bug', finding: 'case-insensitive' }
        ]));

        const findings = parseFindingsResponse(response);
        expect(findings.map(f => f.severity)).to.deep.equal(['critical', 'warning', 'warning', 'nit', 'critical']);
    });

    it('should map common category synonyms', () => {
        const response = wrap(JSON.stringify([
            { file: 'a.ts', line: 1, severity: 'warning', category: 'performance', finding: 'x' }
        ]));

        const findings = parseFindingsResponse(response);
        expect(findings[0].category).to.equal('perf');
    });

    it('should treat an empty or whitespace suggestion as no suggestion', () => {
        const response = wrap(JSON.stringify([
            { file: 'a.ts', line: 1, severity: 'warning', category: 'bug', finding: 'x', suggestion: '' },
            { file: 'b.ts', line: 2, severity: 'warning', category: 'bug', finding: 'y', suggestion: '   ' }
        ]));

        const findings = parseFindingsResponse(response);
        expect(findings).to.have.lengthOf(2);
        expect(findings[0].suggestion).to.equal(undefined);
        expect(findings[1].suggestion).to.equal(undefined);
    });

    it('should drop items with an invalid category', () => {
        const response = wrap(JSON.stringify([
            { file: 'a.ts', line: 1, severity: 'warning', category: 'typo', finding: 'x' }
        ]));

        expect(parseFindingsResponse(response)).to.have.lengthOf(0);
    });

    it('should drop items missing file, line, or finding', () => {
        const response = wrap(JSON.stringify([
            { line: 1, severity: 'warning', category: 'bug', finding: 'no file' },
            { file: 'a.ts', severity: 'warning', category: 'bug', finding: 'no line' },
            { file: 'a.ts', line: '3', severity: 'warning', category: 'bug', finding: 'line not a number' },
            { file: 'a.ts', line: 4, severity: 'warning', category: 'bug' }
        ]));

        expect(parseFindingsResponse(response)).to.have.lengthOf(0);
    });

    it('should return an empty array for old-format responses (no severity/category)', () => {
        const response = wrap(JSON.stringify([
            { file: 'src/utils.ts', line: 42, comment: 'old style', suggestion: 'code' }
        ]));

        expect(parseFindingsResponse(response)).to.have.lengthOf(0);
    });

    it('should return an empty array when no json block is present', () => {
        expect(parseFindingsResponse('Looks good to me!')).to.have.lengthOf(0);
    });

    it('should return an empty array when the json block is not an array', () => {
        expect(parseFindingsResponse(wrap('{"file": "a.ts"}'))).to.have.lengthOf(0);
    });

    it('should return an empty array for malformed JSON', () => {
        expect(parseFindingsResponse(wrap('[{ not json'))).to.have.lengthOf(0);
    });

    it('should parse an empty findings array', () => {
        expect(parseFindingsResponse(wrap('[]'))).to.have.lengthOf(0);
    });
});
