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
 * DevOps service base abstract class
 * Provides common functionality for all DevOps service implementations
 */
export abstract class BaseDevOpsService implements DevOpsService {
    protected accessToken: string;
    protected organizationUrl?: string;

    /**
     * Create DevOps service base instance
     * @param accessToken - Access token
     * @param organizationUrl - Organization URL (optional)
     * @throws {Error} When accessToken is not provided
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
     * Get service provider name (implemented by subclass)
     * @returns Service provider name
     */
    protected abstract getProviderName(): string;

    /**
     * Add Pull Request comment (implemented by subclass)
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
     * Get Pull Request changed file contents (implemented by subclass)
     * @param projectName - Project name
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param fileExtensions - List of file extensions to filter
     * @param binaryExtensions - List of binary file extensions to exclude
     * @param enableThrottleMode - Enable throttle mode
     * @param enableIncrementalDiff - Enable incremental Diff mode (only check the last push changes)
     * @returns Array of change detail information
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
     * Log message for starting to get PR changes
     * @param projectName - Project name
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param fileExtensions - List of file extensions to filter
     * @param binaryExtensions - List of binary file extensions to exclude
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
     * Log completion message for getting PR changes
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
     * Log message for no changes
     */
    protected logNoChanges(): void {
        console.log('❗ No matching code changes detected');
    }

    /**
     * Log message for starting to add comment
     */
    protected logAddCommentStart(): void {
        console.log('🚩 Adding Pull Request comment...');
        console.log(`+ Provider: ${this.getProviderName()}`);
    }

    /**
     * Log success message for adding comment
     * @param id - Comment ID
     */
    protected logAddCommentSuccess(id: number): void {
        console.log(`✅ Successfully added comment, ID: ${id}`);
    }

    /**
     * Ensure binary file extension list has default values
     * @param binaryExtensions - Input binary file extension list
     * @returns Processed binary file extension list
     */
    protected ensureBinaryExtensions(binaryExtensions?: string[]): string[] {
        if (!binaryExtensions || binaryExtensions.length === 0) {
            return DEFAULT_BINARY_EXTENSIONS as string[];
        }
        return binaryExtensions;
    }

    /**
     * Check if file should be filtered (based on extension)
     * @param filePath - File path
     * @param fileExtensions - List of extensions to include
     * @param binaryExtensions - List of binary file extensions to exclude
     * @returns true means include this file, false means filter out
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

        // If extensions are specified, only include matching files
        if (fileExtensions.length > 0) {
            return fileExtensions.includes(fileExt);
        }

        // When no extensions specified, include all non-binary files
        return true;
    }

    /**
     * Log file filtering results
     * @param totalFiles - Total file count
     * @param filteredFiles - Filtered file count
     * @param filePaths - List of file paths to process
     */
    protected logFilterResult(totalFiles: number, filteredFiles: number, filePaths: string[]): void {
        console.log(`🔍 Total changed files: ${totalFiles}, after filtering, ${filteredFiles} file changes remaining`);
        console.log(`📄 Files to be processed: ${filePaths.join(', ')}`);
    }

    /**
     * Format added file content (add + symbol before each line)
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
     * Process git diff or patch output (optimized to reduce Token consumption)
     * Remove blank lines, comments and redundant context
     * @param output - Output content from git diff or patch command
     * @returns Processed diff content, containing only changed lines and block markers
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
            // Remove blank lines and lines with only whitespace
            .filter(line => line.trim().length > 1 || line.startsWith('@@'))
            // Remove leading and trailing whitespace
            .map(line => {
                if (line.startsWith('+') || line.startsWith('-')) {
                    return line.substring(0, 1) + line.substring(1).trim();
                }
                return line;
            })
            .join('\n');
    }

    /**
     * Log file processing progress (for added files)
     * @param filePath - File path
     * @param enableThrottleMode - Enable throttle mode
     */
    protected logProcessAddedFile(filePath: string, enableThrottleMode: boolean): void {
        if (enableThrottleMode) {
            console.log(`🆕 Retrieved diff content for new file: ${filePath}`);
        } else {
            console.log(`🆕 Retrieved full content for new file: ${filePath}`);
        }
    }

    /**
     * Log file processing progress (for edited files)
     * @param filePath - File path
     * @param enableThrottleMode - Enable throttle mode
     */
    protected logProcessEditedFile(filePath: string, enableThrottleMode: boolean): void {
        if (enableThrottleMode) {
            console.log(`✏️ Retrieved diff content for edited file: ${filePath}`);
        } else {
            console.log(`✏️ Retrieved full content for edited file: ${filePath}`);
        }
    }
}
