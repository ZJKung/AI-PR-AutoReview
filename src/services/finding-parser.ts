import {
    ReviewFinding,
    ReviewFindingSeverity,
    REVIEW_FINDING_SEVERITIES,
    REVIEW_FINDING_CATEGORIES
} from '../interfaces/review-finding.interface';

export const FINDINGS_SYSTEM_INSTRUCTION =
'You are a senior software engineer performing an inline code review.\n\n' +
'Return ONLY a JSON array wrapped in a ```json code block. No explanation outside the block.\n\n' +
'Each element MUST have:\n' +
'- "file": the file path exactly as shown in the prompt\n' +
'- "line": integer line number from a [L<N>] label in the annotated diff (NEW file lines only)\n' +
'- "severity": EXACTLY one of "critical" (must fix before merge), "warning" (should fix), "nit" (optional polish). ' +
'Never use other values like "high", "medium", or "low".\n' +
'- "category": one of "bug", "security", "perf", "style"\n' +
'- "finding": concise English explanation of the issue (1-3 sentences)\n' +
'- "suggestion" (optional): exact replacement source code for that line — no markdown fences. ' +
'Omit this field when there is no mechanical one-line fix.\n\n' +
'Rules:\n' +
'1. Report bugs, security issues, performance problems, and clear correctness errors. Use "nit" only for minor style points.\n' +
'2. Never target removed lines ([L<N>-removed]) — they no longer exist in the new file.\n' +
'3. The "line" MUST be taken directly from a [L<N>] label. Never invent line numbers.\n' +
'4. If nothing is worth reporting, return: ```json\n[]\n```\n\n' +
'Example output:\n' +
'```json\n' +
'[\n' +
'  {\n' +
'    "file": "src/utils.ts",\n' +
'    "line": 42,\n' +
'    "severity": "warning",\n' +
'    "category": "bug",\n' +
'    "finding": "Using == instead of === can cause unexpected type coercion.",\n' +
'    "suggestion": "  if (value === null) {"\n' +
'  },\n' +
'  {\n' +
'    "file": "src/api.ts",\n' +
'    "line": 18,\n' +
'    "severity": "critical",\n' +
'    "category": "security",\n' +
'    "finding": "The raw request parameter is interpolated into the SQL string, allowing SQL injection."\n' +
'  }\n' +
']\n' +
'```';

/**
 * Parse the LLM findings response, extracting and validating the JSON array
 * from a ```json block. Invalid items are dropped with a warning; a response
 * that yields no valid items (e.g. old-format output) returns an empty array.
 */
export function parseFindingsResponse(rawResponse: string): ReviewFinding[] {
    const match = rawResponse.match(/```json\s*([\s\S]*?)```/);
    if (!match) {
        console.warn('⚠️ No ```json block found in LLM findings response.');
        return [];
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(match[1].trim());
    } catch (e) {
        console.warn(`⚠️ Failed to parse findings JSON: ${e}`);
        return [];
    }

    if (!Array.isArray(parsed)) {
        console.warn('⚠️ Findings response is not a JSON array.');
        return [];
    }

    const findings: ReviewFinding[] = [];
    let dropped = 0;

    for (const item of parsed) {
        const normalized = normalizeFinding(item);
        const reason = validateFinding(normalized);
        if (reason) {
            dropped++;
            console.warn(`⚠️ Dropped invalid finding (${reason}): ${JSON.stringify(item).slice(0, 200)}`);
            continue;
        }
        findings.push({
            file: normalized.file,
            line: normalized.line,
            severity: normalized.severity,
            category: normalized.category,
            finding: normalized.finding,
            ...(typeof normalized.suggestion === 'string' ? { suggestion: normalized.suggestion } : {})
        });
    }

    if (dropped > 0) {
        console.warn(`⚠️ ${dropped}/${parsed.length} finding(s) dropped — response may use an outdated schema.`);
    }
    return findings;
}

/**
 * Filter findings by minimum severity, then cap the total count keeping the
 * most severe findings first (stable order among equal severities).
 */
export function filterFindings(
    findings: ReviewFinding[],
    threshold: ReviewFindingSeverity,
    maxFindings: number
): ReviewFinding[] {
    const rank = (severity: ReviewFindingSeverity) => REVIEW_FINDING_SEVERITIES.indexOf(severity);
    const thresholdRank = rank(threshold);

    const eligible = findings.filter(f => rank(f.severity) <= thresholdRank);
    const withheld = findings.length - eligible.length;
    if (withheld > 0) {
        console.log(`ℹ️ ${withheld} finding(s) below severity threshold '${threshold}' withheld.`);
    }

    if (eligible.length <= maxFindings) return eligible;

    const capped = eligible
        .map((finding, index) => ({ finding, index }))
        .sort((a, b) => rank(a.finding.severity) - rank(b.finding.severity) || a.index - b.index)
        .slice(0, maxFindings)
        .map(entry => entry.finding);
    console.log(`ℹ️ Finding cap reached: posting top ${maxFindings} of ${eligible.length} by severity (${eligible.length - maxFindings} withheld).`);
    return capped;
}

/** Common off-schema severity values the model may emit, mapped onto the enum */
const SEVERITY_ALIASES: Record<string, ReviewFindingSeverity> = {
    blocker: 'critical',
    severe: 'critical',
    high: 'warning',
    major: 'warning',
    medium: 'warning',
    moderate: 'warning',
    error: 'warning',
    low: 'nit',
    minor: 'nit',
    info: 'nit',
    trivial: 'nit',
    suggestion: 'nit'
};

/** Common off-schema category values mapped onto the enum */
const CATEGORY_ALIASES: Record<string, string> = {
    performance: 'perf',
    optimization: 'perf',
    styling: 'style',
    convention: 'style',
    vulnerability: 'security',
    defect: 'bug',
    correctness: 'bug'
};

/**
 * Salvage common model deviations before validation: case-fold severity and
 * category, map well-known synonyms onto the enum, and treat blank
 * suggestions as absent.
 */
function normalizeFinding(item: any): any {
    if (!item || typeof item !== 'object') return item;
    const normalized = { ...item };

    if (typeof normalized.severity === 'string') {
        const value = normalized.severity.trim().toLowerCase();
        const alias = SEVERITY_ALIASES[value];
        if (alias && !(REVIEW_FINDING_SEVERITIES as readonly string[]).includes(value)) {
            console.warn(`⚠️ Severity '${normalized.severity}' is non-standard — mapped to '${alias}'.`);
            normalized.severity = alias;
        } else {
            normalized.severity = value;
        }
    }

    if (typeof normalized.category === 'string') {
        const value = normalized.category.trim().toLowerCase();
        normalized.category = CATEGORY_ALIASES[value] ?? value;
    }

    if (typeof normalized.suggestion === 'string' && normalized.suggestion.trim().length === 0) {
        delete normalized.suggestion;
    }

    return normalized;
}

/**
 * Validate a raw parsed item against the ReviewFinding contract.
 * @returns A rejection reason, or null when the item is valid.
 */
function validateFinding(item: any): string | null {
    if (!item || typeof item !== 'object') return 'not an object';
    if (typeof item.file !== 'string' || item.file.length === 0) return 'missing file';
    if (typeof item.line !== 'number' || !Number.isInteger(item.line)) return 'line is not an integer';
    if (!REVIEW_FINDING_SEVERITIES.includes(item.severity)) return `invalid severity '${item.severity}'`;
    if (!REVIEW_FINDING_CATEGORIES.includes(item.category)) return `invalid category '${item.category}'`;
    if (typeof item.finding !== 'string' || item.finding.length === 0) return 'missing finding';
    if (item.suggestion !== undefined && typeof item.suggestion !== 'string') return 'suggestion is not a string';
    return null;
}
