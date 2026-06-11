import { expect } from 'chai';
import { formatFindingComment } from '../src/services/finding-formatter';
import { ReviewFinding } from '../src/interfaces/review-finding.interface';

const finding = (overrides: Partial<ReviewFinding>): ReviewFinding => ({
    file: 'src/a.ts',
    line: 1,
    severity: 'warning',
    category: 'bug',
    finding: 'an issue',
    ...overrides
});

describe('Finding Formatter', () => {
    it('should prefix critical findings with the critical emoji and category', () => {
        const text = formatFindingComment(finding({ severity: 'critical', category: 'security', finding: 'SQL injection risk.' }));
        expect(text).to.equal('🔴 **[security]** SQL injection risk.');
    });

    it('should prefix warning findings with the warning emoji', () => {
        const text = formatFindingComment(finding({ severity: 'warning', category: 'bug', finding: 'Possible null deref.' }));
        expect(text).to.equal('⚠️ **[bug]** Possible null deref.');
    });

    it('should prefix nit findings with the nit emoji', () => {
        const text = formatFindingComment(finding({ severity: 'nit', category: 'style', finding: 'Prefer const.' }));
        expect(text).to.equal('💡 **[style]** Prefer const.');
    });
});
