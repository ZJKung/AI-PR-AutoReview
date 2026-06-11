/**
 * Severity levels for a review finding, ordered from most to least severe.
 */
export const REVIEW_FINDING_SEVERITIES = ['critical', 'warning', 'nit'] as const;
export type ReviewFindingSeverity = typeof REVIEW_FINDING_SEVERITIES[number];

/**
 * Categories a review finding can belong to.
 */
export const REVIEW_FINDING_CATEGORIES = ['bug', 'security', 'perf', 'style'] as const;
export type ReviewFindingCategory = typeof REVIEW_FINDING_CATEGORIES[number];

/**
 * A single structured review finding produced by the LLM.
 * This is the shared contract consumed by filtering, posting, dedup, and metrics.
 */
export interface ReviewFinding {
    /** File path exactly as shown in the review prompt */
    file: string;
    /** Line number in the NEW file version (from a [L<N>] label) */
    line: number;
    /** Severity level */
    severity: ReviewFindingSeverity;
    /** Finding category */
    category: ReviewFindingCategory;
    /** Concise explanation of the issue */
    finding: string;
    /** Exact replacement source code, when a mechanical fix exists */
    suggestion?: string;
}
