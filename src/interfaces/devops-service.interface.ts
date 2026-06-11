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
 * Handle to an existing PR comment posted by the bot.
 */
export interface ExistingComment {
    /** Comment ID (GitHub) or comment ID within the thread (Azure DevOps) */
    commentId: number;
    /** Thread ID containing the comment (Azure DevOps only) */
    threadId?: number;
}

/**
 * An inline (file-anchored) comment thread on a PR.
 */
export interface InlineThread {
    /** Thread ID (Azure DevOps) or top-level review comment ID (GitHub) */
    id: number;
    /** Body of the first comment in the thread */
    body: string;
    /** Number of replies after the first comment */
    replyCount: number;
    /** Thread status (Azure DevOps CommentThreadStatus; undefined for GitHub) */
    status?: number;
    /** File the thread is anchored to, when available */
    filePath?: string;
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

    /**
     * Find an existing bot comment on the PR carrying the given hidden marker.
     * @param projectName - Project name (may be unused for GitHub)
     * @param repositoryId - Repository ID or owner/repo
     * @param pullRequestId - Pull Request ID
     * @param marker - Hidden HTML marker identifying the bot comment
     * @returns Handle to the comment, or null when not found
     */
    findBotComment?(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        marker: string
    ): Promise<ExistingComment | null>;

    /**
     * Replace the content of an existing PR comment in place.
     * @param projectName - Project name (may be unused for GitHub)
     * @param repositoryId - Repository ID or owner/repo
     * @param pullRequestId - Pull Request ID
     * @param comment - Handle returned by findBotComment
     * @param content - New comment content
     */
    updatePullRequestComment?(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        comment: ExistingComment,
        content: string
    ): Promise<void>;

    /**
     * List inline (file-anchored) comment threads on the PR.
     * @param projectName - Project name (may be unused for GitHub)
     * @param repositoryId - Repository ID or owner/repo
     * @param pullRequestId - Pull Request ID
     */
    listInlineThreads?(
        projectName: string,
        repositoryId: string,
        pullRequestId: number
    ): Promise<InlineThread[]>;

    /**
     * Mark an inline comment thread as resolved/fixed.
     * Optional — GitHub's REST API does not support resolving review threads.
     * @param projectName - Project name (may be unused for GitHub)
     * @param repositoryId - Repository ID or owner/repo
     * @param pullRequestId - Pull Request ID
     * @param threadId - Thread to resolve
     */
    resolveThread?(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        threadId: number
    ): Promise<void>;
}
