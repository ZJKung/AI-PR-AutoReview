import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { PipelineInputs } from '../interfaces/pipeline-inputs.interface';
import { ReviewFindingSeverity, REVIEW_FINDING_SEVERITIES } from '../interfaces/review-finding.interface';

export const REPO_CONFIG_FILENAME = '.aireview.yml';

/**
 * Per-repo review configuration loaded from .aireview.yml at the repo root.
 * Fields the config sets override the pipeline task inputs.
 */
export interface RepoReviewConfig {
    /** Minimum severity for posted inline findings */
    severityThreshold?: ReviewFindingSeverity;
    /** Maximum number of posted inline findings */
    maxFindings?: number;
    /** Path globs to include (when set, only matching files are reviewed) */
    include?: string[];
    /** Path globs to exclude from review */
    exclude?: string[];
    /** Extra review instructions applied when a changed file matches the glob */
    instructions?: { glob: string; text: string }[];
}

/**
 * Load and validate .aireview.yml from the repo root.
 * Any problem (missing file, malformed YAML, wrong shape) degrades to null
 * or drops the offending field — never fails the build.
 */
export function loadRepoConfig(rootDir: string): RepoReviewConfig | null {
    const filePath = path.join(rootDir, REPO_CONFIG_FILENAME);
    if (!fs.existsSync(filePath)) return null;

    let raw: unknown;
    try {
        raw = yaml.load(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        console.warn(`⚠️ Malformed ${REPO_CONFIG_FILENAME}: ${e}. Falling back to task inputs.`);
        return null;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        console.warn(`⚠️ ${REPO_CONFIG_FILENAME} is not a mapping. Falling back to task inputs.`);
        return null;
    }

    const data = raw as Record<string, unknown>;
    const config: RepoReviewConfig = {};

    if (data.severityThreshold !== undefined) {
        const value = String(data.severityThreshold).toLowerCase();
        if ((REVIEW_FINDING_SEVERITIES as readonly string[]).includes(value)) {
            config.severityThreshold = value as ReviewFindingSeverity;
        } else {
            console.warn(`⚠️ ${REPO_CONFIG_FILENAME}: invalid severityThreshold '${data.severityThreshold}' ignored.`);
        }
    }

    if (data.maxFindings !== undefined) {
        const value = Number(data.maxFindings);
        if (Number.isInteger(value) && value > 0) {
            config.maxFindings = value;
        } else {
            console.warn(`⚠️ ${REPO_CONFIG_FILENAME}: invalid maxFindings '${data.maxFindings}' ignored.`);
        }
    }

    config.include = readStringArray(data.include, 'include');
    config.exclude = readStringArray(data.exclude, 'exclude');

    if (data.instructions !== undefined) {
        if (Array.isArray(data.instructions)) {
            const valid = data.instructions.filter((item: any) =>
                item && typeof item.glob === 'string' && typeof item.text === 'string');
            if (valid.length < data.instructions.length) {
                console.warn(`⚠️ ${REPO_CONFIG_FILENAME}: some instructions entries are missing glob/text and were ignored.`);
            }
            if (valid.length > 0) config.instructions = valid;
        } else {
            console.warn(`⚠️ ${REPO_CONFIG_FILENAME}: instructions must be a list. Ignored.`);
        }
    }

    console.log(`📋 Loaded ${REPO_CONFIG_FILENAME} from repo root.`);
    return config;
}

function readStringArray(value: unknown, field: string): string[] | undefined {
    if (value === undefined) return undefined;
    if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
        return value.length > 0 ? value : undefined;
    }
    console.warn(`⚠️ ${REPO_CONFIG_FILENAME}: ${field} must be a list of strings. Ignored.`);
    return undefined;
}

/**
 * Merge repo config over task inputs. Only fields the config sets win.
 */
export function applyRepoConfig(inputs: PipelineInputs, config: RepoReviewConfig): PipelineInputs {
    const merged = { ...inputs };
    if (config.severityThreshold !== undefined) {
        merged.severityThreshold = config.severityThreshold;
        console.log(`📋 Repo config overrides severityThreshold → ${config.severityThreshold}`);
    }
    if (config.maxFindings !== undefined) {
        merged.maxFindings = config.maxFindings;
        console.log(`📋 Repo config overrides maxFindings → ${config.maxFindings}`);
    }
    return merged;
}

/**
 * Minimal glob matcher supporting **, *, and ?. Paths are matched without
 * their leading slash.
 */
export function matchGlob(pattern: string, filePath: string): boolean {
    const normalized = filePath.replace(/^\//, '');
    const regex = globToRegex(pattern);
    return regex.test(normalized);
}

function globToRegex(pattern: string): RegExp {
    let out = '';
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];
        if (ch === '*') {
            if (pattern[i + 1] === '*') {
                // '**' crosses path segments; swallow a following '/' so 'a/**' also matches 'a'
                out += '(?:.*)';
                i++;
                if (pattern[i + 1] === '/') i++;
            } else {
                out += '[^/]*';
            }
        } else if (ch === '?') {
            out += '[^/]';
        } else if ('\\^$.|+()[]{}'.includes(ch)) {
            out += `\\${ch}`;
        } else {
            out += ch;
        }
    }
    return new RegExp(`^${out}$`);
}

/**
 * Apply include/exclude globs to a list of file paths.
 */
export function filterPathsByGlobs(
    paths: string[],
    include: string[] | undefined,
    exclude: string[] | undefined
): string[] {
    return paths.filter(p => {
        if (include && include.length > 0 && !include.some(g => matchGlob(g, p))) return false;
        if (exclude && exclude.some(g => matchGlob(g, p))) return false;
        return true;
    });
}

/**
 * Collect instruction texts whose glob matches at least one changed file.
 */
export function instructionsForFiles(config: RepoReviewConfig, filePaths: string[]): string[] {
    if (!config.instructions) return [];
    return config.instructions
        .filter(rule => filePaths.some(p => matchGlob(rule.glob, p)))
        .map(rule => rule.text);
}
