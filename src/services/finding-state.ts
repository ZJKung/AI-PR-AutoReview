import { createHash } from 'crypto';
import { ReviewFinding } from '../interfaces/review-finding.interface';

/** Lines are bucketed so a finding keeps its identity across small shifts */
const LINE_BUCKET_SIZE = 5;

const FP_MARKER_REGEX = /<!-- ai-review:fp:([a-f0-9]+) -->/g;

/**
 * Compute a stable fingerprint for a finding: normalized file path, line
 * bucket, and category. Deliberately excludes the finding text so LLM
 * re-phrasings of the same issue map to the same fingerprint.
 */
export function computeFindingFingerprint(finding: ReviewFinding): string {
    const file = finding.file.replace(/^\//, '').toLowerCase();
    const bucket = Math.floor(finding.line / LINE_BUCKET_SIZE);
    return createHash('sha1')
        .update(`${file}|${bucket}|${finding.category}`)
        .digest('hex')
        .slice(0, 16);
}

/**
 * Hidden HTML marker embedding a fingerprint into a posted comment body.
 */
export function fingerprintMarker(fingerprint: string): string {
    return `<!-- ai-review:fp:${fingerprint} -->`;
}

/**
 * Collect all fingerprints embedded in the given comment bodies.
 */
export function extractFingerprints(bodies: string[]): Set<string> {
    const fingerprints = new Set<string>();
    for (const body of bodies) {
        for (const match of body.matchAll(FP_MARKER_REGEX)) {
            fingerprints.add(match[1]);
        }
    }
    return fingerprints;
}

/**
 * Keep only findings whose fingerprint has not been posted yet.
 */
export function selectNewFindings(
    findings: ReviewFinding[],
    existingFingerprints: Set<string>
): ReviewFinding[] {
    return findings.filter(f => {
        const fp = computeFindingFingerprint(f);
        if (existingFingerprints.has(fp)) {
            console.log(`ℹ️ Skipping already-posted finding on ${f.file}:${f.line} (fingerprint ${fp}).`);
            return false;
        }
        return true;
    });
}
