/**
 * DevOps service configuration interface
 */
export interface DevOpsServiceConfig {
    /** Access token */
    accessToken: string;
    /** Organization URL or Base URL */
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
     * @param projectName - Project name (may not be used for GitHub)
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
     * Get Pull Request changed file contents
     * @param projectName - Project name (may not be used for GitHub)
     * @param repositoryId - Repository ID or owner/repo
     * @param pullRequestId - Pull Request ID
     * @param fileExtensions - List of file extensions to filter
     * @param binaryExtensions - List of binary file extensions to exclude
     * @param enableThrottleMode - Enable throttle mode
     * @param enableIncrementalDiff - Enable incremental Diff mode (only check the last push changes)
     * @returns Array of change detail information, returns null if no changes
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
}
