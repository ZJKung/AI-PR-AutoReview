import path from 'path';
import { DevOpsService, FileChangeDetail } from '../interfaces/devops-service.interface';

/**
 * Default binary file extension list
 */
export const DEFAULT_BINARY_EXTENSIONS: string[] = [
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.webp',
    '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.bin', '.dat', '.class',
    '.mp3', '.mp4', '.avi', '.mov', '.flv',
    ".md", ".markdown", ".txt", ".gitignore"
] as const;

/**
 * Base abstract DevOps service
 * Provides shared functionality for all DevOps service implementations
 */
export abstract class BaseDevOpsService implements DevOpsService {
    protected accessToken: string;
    protected organizationUrl?: string;

    /**
     * Create base DevOps service instance
     * @param accessToken - Access token
     * @param organizationUrl - Organization URL (optional)
     * @throws {Error} Throws error when accessToken is not provided
     */
    constructor(accessToken?: string, organizationUrl?: string) {
        if (!accessToken) {
            throw new Error('⛔ Access token is missing');
        }

        if (!organizationUrl) {
            throw new Error('⛔ Organization URL is missing');
        }

        this.accessToken = accessToken;
        this.organizationUrl = organizationUrl;
    }

    /**
     * Get provider name (implemented by subclasses)
     * @returns Provider name
     */
    protected abstract getProviderName(): string;

    /**
     * Add Pull Request comment (implemented by subclasses)
     * @param projectName - Project name
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param content - Comment content
     * @param commentHeader - Comment header
     * @returns Comment ID
     */
    public abstract addPullRequestComment(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        content: string,
        commentHeader?: string
    ): Promise<number>;

    /**
     * Get Pull Request changed file contents (implemented by subclasses)
     * @param projectName - Project name
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param fileExtensions - Extensions to include
     * @param binaryExtensions - Binary extensions to exclude
     * @param enableThrottleMode - Enable throttle mode
     * @param enableIncrementalDiff - Enable incremental diff mode (latest push only)
     * @returns Array of change details
     */
    public abstract getPullRequestChanges(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        fileExtensions?: string[],
        binaryExtensions?: string[],
        enableThrottleMode?: boolean,
        enableIncrementalDiff?: boolean
    ): Promise<FileChangeDetail[] | null>;

    /**
     * Log start of PR change retrieval
     * @param projectName - Project name
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param fileExtensions - Extensions to include
     * @param binaryExtensions - Binary extensions to exclude
     * @param enableThrottleMode - Enable throttle mode
     */
    protected logRetrievingChangesStart(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        fileExtensions: string[],
        binaryExtensions: string[],
        enableThrottleMode: boolean
    ): void {
        console.log('🚩 Retrieving Pull Request changes...');
        console.log(`+ Provider: ${this.getProviderName()}`);
        if (projectName) console.log(`+ Project Name: ${projectName}`);
        console.log(`+ Repository ID: ${repositoryId}`);
        console.log(`+ Pull Request ID: ${pullRequestId}`);

        console.log(`+ FileExtensions: ${fileExtensions.length > 0 ? fileExtensions.join(', ') : 'None (all non-binary files)'}`);
        if (fileExtensions.length > 0) {
            console.log(`  + Filtering for extensions: ${fileExtensions.join(', ')}`);
        }

        console.log(`+ BinaryExtensions: ${binaryExtensions.length > 0 ? binaryExtensions.join(', ') : 'Using default list'}`);
        console.log(`  + Excluding binary extensions: ${binaryExtensions.join(', ')}`);

        console.log(`+ Throttle Mode: ${enableThrottleMode ? 'Enabled (diff only)' : 'Disabled (full content)'}`);
    }

    /**
     * Log completion of PR change retrieval
     * @param fileCount - Number of files processed
     * @param enableThrottleMode - Enable throttle mode
     */
    protected logRetrievingChangesComplete(fileCount: number, enableThrottleMode: boolean): void {
        if (enableThrottleMode) {
            console.log(`✅ Completed diff comparison for ${fileCount} matching files`);
        } else {
            console.log(`✅ Retrieved full content for ${fileCount} matching files`);
        }
    }

    /**
     * Log no changes
     */
    protected logNoChanges(): void {
        console.log('❗ No matching code changes detected');
    }

    /**
     * Log start of adding a comment
     */
    protected logAddCommentStart(): void {
        console.log('🚩 Adding Pull Request comment...');
        console.log(`+ Provider: ${this.getProviderName()}`);
    }

    /**
     * Log successful comment creation
     * @param id - Comment ID
     */
    protected logAddCommentSuccess(id: number): void {
        console.log(`✅ Successfully added comment, ID: ${id}`);
    }

    /**
     * Ensure binary extensions have default values
     * @param binaryExtensions - Input binary extension list
     * @returns Normalized binary extension list
     */
    protected ensureBinaryExtensions(binaryExtensions?: string[]): string[] {
        if (!binaryExtensions || binaryExtensions.length === 0) {
            return DEFAULT_BINARY_EXTENSIONS as string[];
        }
        return binaryExtensions;
    }

    /**
     * Check whether a file should be included (by extension)
     * @param filePath - File path
     * @param fileExtensions - Extensions to include
     * @param binaryExtensions - Binary extensions to exclude
     * @returns true if the file should be included, false otherwise
     */
    protected shouldIncludeFile(
        filePath: string,
        fileExtensions: string[],
        binaryExtensions: string[]
    ): boolean {
        const fileExt = path.extname(filePath).toLowerCase();

        // Exclude binary files
        if (binaryExtensions.includes(fileExt)) {
            return false;
        }

        // If extensions are specified, include only matching files
        if (fileExtensions.length > 0) {
            return fileExtensions.includes(fileExt);
        }

        // If no extensions specified, include all non-binary files
        return true;
    }

    /**
     * Log file filtering results
     * @param totalFiles - Total files
     * @param filteredFiles - Filtered file count
     * @param filePaths - File paths to process
     */
    protected logFilterResult(totalFiles: number, filteredFiles: number, filePaths: string[]): void {
        console.log(`🔍 Total changed files: ${totalFiles}, after filtering, ${filteredFiles} file changes remaining`);
        console.log(`📄 Files to be processed: ${filePaths.join(', ')}`);
    }

    /** Files at or under this many lines get full content alongside the diff in throttle mode */
    protected static readonly SMALL_FILE_MAX_LINES = 200;

    /**
     * Check whether a file is small enough to send in full alongside its diff.
     * @param content - Full file content
     */
    protected isSmallFile(content: string): boolean {
        return content.split('\n').length <= BaseDevOpsService.SMALL_FILE_MAX_LINES;
    }

    /**
     * Append full file content after the diff so the model sees surrounding
     * context for small files (throttle mode only).
     * @param diff - Processed diff content
     * @param fullContent - Full file content
     */
    protected appendFullFileContext(diff: string, fullContent: string): string {
        console.log(`📎 Appending full file context (small file, ${fullContent.split('\n').length} lines)`);
        return `${diff}\n\n=== Full file context (small file) ===\n${fullContent}`;
    }

    /**
     * Format added file content (prefix each line with +)
     * @param content - Original file content
     * @returns Formatted content
     */
    protected formatAddedFileContent(content: string): string {
        return content
            .split('\n')
            .map(line => `+ ${line}`)
            .join('\n');
    }

    /**
     * Process git diff or patch output (optimized to reduce token usage)
     * Removes blank lines, comments, and extra context
     * @param output - Output from git diff or patch
     * @returns Processed diff content with only change lines and hunk markers
     */
    protected processDiffOutput(output: string): string {
        const lines = output.split('\n');
        const contentStart = lines.findIndex((line: string) => line.startsWith('@@'));
        if (contentStart === -1) return '';

        return lines
            .slice(contentStart)
            .filter((line: string) =>
                line.startsWith('+') ||
                line.startsWith('-') ||
                line.startsWith('@@')
            )
            // Remove blank or whitespace-only lines
            .filter(line => line.trim().length > 1 || line.startsWith('@@'))
            // Trim leading and trailing whitespace
            .map(line => {
                if (line.startsWith('+') || line.startsWith('-')) {
                    return line.substring(0, 1) + line.substring(1).trim();
                }
                return line;
            })
            .join('\n');
    }

    /**
     * Log file processing progress for added files
     * @param filePath - File path
     * @param enableThrottleMode - Whether throttle mode is enabled
     */
    protected logProcessAddedFile(filePath: string, enableThrottleMode: boolean): void {
        if (enableThrottleMode) {
            console.log(`🆕 Retrieved diff content for new file: ${filePath}`);
        } else {
            console.log(`🆕 Retrieved full content for new file: ${filePath}`);
        }
    }

    /**
     * Log file processing progress for edited files
     * @param filePath - File path
     * @param enableThrottleMode - Whether throttle mode is enabled
     */
    protected logProcessEditedFile(filePath: string, enableThrottleMode: boolean): void {
        if (enableThrottleMode) {
            console.log(`✏️ Retrieved diff content for edited file: ${filePath}`);
        } else {
            console.log(`✏️ Retrieved full content for edited file: ${filePath}`);
        }
    }
}
