/**
 * DevOps service configuration interface
 */
export interface DevOpsServiceConfig {
    /** Access token */
    accessToken: string;
    /** Organization URL or base URL */
    organizationUrl?: string;
}

/**
 * File change detail interface
 */
export interface FileChangeDetail {
    /** File path */
    path: string;
    /** Change type */
    changeType: any;
    /** Change content */
    content: string;
}

/**
 * DevOps service interface
 * Defines methods that all DevOps providers (Azure DevOps, GitHub) must implement
 */
export interface DevOpsService {
    /**
     * Add Pull Request comment
     * @param projectName - Project name (may be unused for GitHub)
     * @param repositoryId - Repository ID or owner/repo
     * @param pullRequestId - Pull Request ID
     * @param content - Comment content
     * @param commentHeader - Comment header
     * @returns Comment ID
     */
    addPullRequestComment(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        content: string,
        commentHeader?: string
    ): Promise<number>;

    /**
     * Get Pull Request changed file content
     * @param projectName - Project name (may be unused for GitHub)
     * @param repositoryId - Repository ID or owner/repo
     * @param pullRequestId - Pull Request ID
     * @param fileExtensions - Extensions to include
     * @param binaryExtensions - Binary extensions to exclude
     * @param enableThrottleMode - Enable throttle mode
     * @param enableIncrementalDiff - Enable incremental diff mode (latest push only)
     * @returns Change details array, or null if no changes
     */
    getPullRequestChanges(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        fileExtensions?: string[],
        binaryExtensions?: string[],
        enableThrottleMode?: boolean,
        enableIncrementalDiff?: boolean
    ): Promise<FileChangeDetail[] | null>;

    /**
     * Post an inline finding comment on a specific line, optionally with a suggested fix.
     * @param repositoryId - Repository ID or owner/repo
     * @param pullRequestId - Pull Request ID
     * @param filePath - File path within the repository
     * @param line - Target line number in the new file version
     * @param comment - Explanation text shown before the suggestion
     * @param suggestion - Replacement source code for the suggestion block; undefined posts a plain comment
     * @returns Comment ID
     */
    addInlineSuggestionComment?(
        repositoryId: string,
        pullRequestId: number,
        filePath: string,
        line: number,
        comment: string,
        suggestion: string | undefined,
        commitId: string,
        projectName?: string
    ): Promise<number>;
}
