import { ReviewFinding, ReviewFindingSeverity } from '../interfaces/review-finding.interface';

const SEVERITY_EMOJI: Record<ReviewFindingSeverity, string> = {
    critical: '🔴',
    warning: '⚠️',
    nit: '💡'
};

/**
 * Format a finding as the inline comment text shown above an optional
 * suggestion block. Shared by all DevOps providers.
 */
export function formatFindingComment(finding: ReviewFinding): string {
    return `${SEVERITY_EMOJI[finding.severity]} **[${finding.category}]** ${finding.finding}`;
}
