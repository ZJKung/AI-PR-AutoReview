import * as azdev from 'azure-devops-node-api';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import {
    GitPullRequestIterationChanges,
    VersionControlChangeType
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { Readable } from 'stream';
import path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseDevOpsService } from './base-devops.service';
import { FileChangeDetail, ExistingComment, InlineThread } from '../interfaces/devops-service.interface';

/**
 * Azure DevOps API service class
 * Handles Azure DevOps API operations, including PR change retrieval
 */
export class AzureDevOpsService extends BaseDevOpsService {
    private connection: azdev.WebApi;

    /**
     * Create AzureDevOpsService instance
     * @param accessToken - Azure DevOps access token
     * @param organizationUrl - Azure DevOps organization URL
     * @throws {Error} Throws error when accessToken or organizationUrl is not provided
     */
    constructor(accessToken?: string, organizationUrl?: string) {
        super(accessToken, organizationUrl);

        const authHandler = azdev.getPersonalAccessTokenHandler(this.accessToken);
        this.connection = new azdev.WebApi(organizationUrl!, authHandler);
    }

    /**
     * Get provider name
     * @returns Provider name
     */
    protected getProviderName(): string {
        return 'Azure DevOps';
    }

    /**
     * Add Pull Request comment
     * @param projectName - Project ID
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param content - Comment content
     * @param commentHeader - Comment header, default empty
     * @returns Comment thread ID
     * @throws {Error} Throws error when comment creation fails
     */
    public async addPullRequestComment(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        content: string,
        commentHeader: string = ''
    ): Promise<number> {
        this.logAddCommentStart();

        // Build comment content
        const commentContent = commentHeader ? `# ${commentHeader}\n${content}` : content;

        const gitApi = await this.getGitApi();

        try {
            const thread = await gitApi.createThread(
                {
                    comments: [{
                        parentCommentId: 0,
                        content: commentContent,
                        commentType: 1 // CommentType.text = 1
                    }],
                    status: 1 // CommentThreadStatus.active = 1
                },
                repositoryId,
                pullRequestId,
                projectName
            );

            if (!thread || !thread.id) {
                throw new Error('⛔ Failed to create comment thread');
            }

            this.logAddCommentSuccess(thread.id);
            return thread.id;
        } catch (error) {
            console.error('⛔ Error adding comment:', error);
            if (error instanceof Error && error.message.includes('403')) {
                console.error('⛔ Insufficient permissions. Please ensure Build Service account has "Contribute to pull requests" permission');
            }
            throw error;
        }
    }

    /**
     * Get file contents for PR changes
     * @param projectName - Project ID
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param fileExtensions - Extensions to include (e.g. ['.ts', '.js']); empty means all non-binary
     * @param binaryExtensions - Binary extensions to exclude
     * @param enableThrottleMode - Throttle mode (default true: diff only; false: full file)
     * @param enableIncrementalDiff - Incremental diff mode (default false: all PR changes; true: latest push only)
     * @returns Change details including file path and content
     */
    public async getPullRequestChanges(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        fileExtensions: string[] = [],
        binaryExtensions: string[] = [],
        enableThrottleMode: boolean = true,
        enableIncrementalDiff: boolean = false
    ): Promise<FileChangeDetail[] | null> {
        // Ensure binary extension defaults
        binaryExtensions = this.ensureBinaryExtensions(binaryExtensions);

        // Log start
        this.logRetrievingChangesStart(
            projectName,
            repositoryId,
            pullRequestId,
            fileExtensions,
            binaryExtensions,
            enableThrottleMode
        );

        if (enableIncrementalDiff) {
            console.log('🔄 Incremental Diff Mode: Enabled - Only the latest push changes will be reviewed');
        }

        const gitApi = await this.getGitApi();

        // Verify PR changes
        const verificationResult = await this.verifyPullRequestChanges(
            gitApi,
            projectName,
            repositoryId,
            pullRequestId,
            enableIncrementalDiff
        );

        if (!verificationResult) {
            this.logNoChanges();
            return null;
        }

        const { changes, previousChanges } = verificationResult;

        // Filter change files
        const filteredChanges = this.filterChangeEntries(
            changes.changeEntries,
            fileExtensions,
            binaryExtensions
        );

        if (filteredChanges.length === 0) {
            this.logNoChanges();
            return null;
        }

        // Get change content per file
        const changeDetails = await this.getChangeDetails(
            filteredChanges,
            gitApi,
            repositoryId,
            projectName,
            enableThrottleMode,
            enableIncrementalDiff,
            previousChanges
        );

        this.logRetrievingChangesComplete(changeDetails.length, enableThrottleMode);
        return changeDetails;
    }

    /**
     * Post an inline suggestion comment on a specific line of a PR file.
     * Azure DevOps does not support GitHub's click-to-accept suggestion format,
     * so the suggestion is formatted as a markdown code block instead.
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param filePath - File path within the repository
     * @param line - Target line number in the new file version
     * @param comment - Explanation text shown above the suggestion
     * @param suggestion - Replacement source code shown in a code block; undefined posts the comment alone
     * @param _commitId - Unused for Azure DevOps (required by interface)
     * @param projectName - Project name
     * @returns Comment thread ID
     */
    public async addInlineSuggestionComment(
        repositoryId: string,
        pullRequestId: number,
        filePath: string,
        line: number,
        comment: string,
        suggestion: string | undefined,
        _commitId: string,
        projectName?: string
    ): Promise<number> {
        const gitApi = await this.getGitApi();

        // Azure DevOps file paths in threadContext must start with /
        const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;

        const body = suggestion !== undefined
            ? `${comment}\n\n**Suggested change:**\n\`\`\`\n${suggestion}\n\`\`\``
            : comment;

        const thread = await gitApi.createThread(
            {
                comments: [{
                    parentCommentId: 0,
                    content: body,
                    commentType: 1 // CommentType.text = 1
                }],
                status: 1, // CommentThreadStatus.active = 1
                threadContext: {
                    filePath: normalizedPath,
                    rightFileStart: { line, offset: 1 },
                    rightFileEnd: { line, offset: 1 }
                }
            },
            repositoryId,
            pullRequestId,
            projectName || ''
        );

        if (!thread || !thread.id) {
            throw new Error(`⛔ Failed to create inline suggestion thread on ${filePath}:${line}`);
        }

        console.log(`✅ Added inline suggestion on ${filePath}:${line}, thread ID: ${thread.id}`);
        return thread.id;
    }

    /**
     * Find an existing bot comment thread on the PR carrying the given hidden marker.
     * @param projectName - Project name
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param marker - Hidden HTML marker identifying the bot comment
     * @returns Handle to the comment, or null when not found
     */
    public async findBotComment(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        marker: string
    ): Promise<ExistingComment | null> {
        const gitApi = await this.getGitApi();
        const threads = await gitApi.getThreads(repositoryId, pullRequestId, projectName);

        for (const thread of threads ?? []) {
            if (thread.isDeleted || !thread.id || !thread.comments?.length) continue;
            const first = thread.comments[0];
            if (first.id && typeof first.content === 'string' && first.content.includes(marker)) {
                return { threadId: thread.id, commentId: first.id };
            }
        }
        return null;
    }

    /**
     * Replace the content of an existing PR comment in place.
     * @param projectName - Project name
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param comment - Handle returned by findBotComment
     * @param content - New comment content
     */
    public async updatePullRequestComment(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        comment: ExistingComment,
        content: string
    ): Promise<void> {
        if (comment.threadId === undefined) {
            throw new Error('⛔ Azure DevOps comment update requires a thread ID');
        }
        const gitApi = await this.getGitApi();
        await gitApi.updateComment(
            { content },
            repositoryId,
            pullRequestId,
            comment.threadId,
            comment.commentId,
            projectName
        );
        console.log(`✅ Updated comment in thread ${comment.threadId}`);
    }

    /**
     * List inline (file-anchored) comment threads on the PR.
     * Threads without a threadContext (e.g. summary comments) and deleted
     * threads are excluded.
     * @param projectName - Project name
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     */
    public async listInlineThreads(
        projectName: string,
        repositoryId: string,
        pullRequestId: number
    ): Promise<InlineThread[]> {
        const gitApi = await this.getGitApi();
        const threads = await gitApi.getThreads(repositoryId, pullRequestId, projectName);

        const result: InlineThread[] = [];
        for (const thread of threads ?? []) {
            if (thread.isDeleted || !thread.id || !thread.threadContext?.filePath) continue;
            if (!thread.comments?.length) continue;
            result.push({
                id: thread.id,
                body: thread.comments[0].content ?? '',
                replyCount: thread.comments.length - 1,
                status: thread.status,
                filePath: thread.threadContext.filePath
            });
        }
        return result;
    }

    /**
     * Get the PR title and description.
     * @param projectName - Project name
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     */
    public async getPullRequestDetails(
        projectName: string,
        repositoryId: string,
        pullRequestId: number
    ): Promise<{ title: string; description: string }> {
        const gitApi = await this.getGitApi();
        const pr = await gitApi.getPullRequest(repositoryId, pullRequestId, projectName);
        return {
            title: pr?.title ?? '',
            description: pr?.description ?? ''
        };
    }

    /**
     * Mark an inline comment thread as fixed (resolved).
     * @param projectName - Project name
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param threadId - Thread to resolve
     */
    public async resolveThread(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        threadId: number
    ): Promise<void> {
        const gitApi = await this.getGitApi();
        await gitApi.updateThread(
            { status: 2 }, // CommentThreadStatus.fixed
            repositoryId,
            pullRequestId,
            threadId,
            projectName
        );
        console.log(`✅ Resolved thread ${threadId} (finding no longer reported)`);
    }

    /**
     * Fetch raw patch strings for all changed (non-removed) files in a PR.
     * Uses git diff to produce unified diff output without post-processing.
     * @param projectName - Project name
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @returns Map<filePath, rawPatch> and a dummy commitId (empty string for Azure DevOps)
     */
    public async getRawPatches(
        projectName: string,
        repositoryId: string,
        pullRequestId: number
    ): Promise<{ patches: Map<string, string>; commitId: string }> {
        const gitApi = await this.getGitApi();

        const pr = await gitApi.getPullRequest(repositoryId, pullRequestId, projectName);
        if (!pr || !pr.lastMergeSourceCommit || !pr.lastMergeTargetCommit) {
            throw new Error('⛔ Unable to get Pull Request information for raw patches');
        }

        const iterations = await gitApi.getPullRequestIterations(repositoryId, pullRequestId, projectName);
        if (!iterations || iterations.length === 0) {
            return { patches: new Map(), commitId: '' };
        }

        const targetIteration = iterations[iterations.length - 1];
        if (!targetIteration || targetIteration.id === undefined) {
            return { patches: new Map(), commitId: '' };
        }

        const changes = await gitApi.getPullRequestIterationChanges(
            repositoryId,
            pullRequestId,
            targetIteration.id
        );

        if (!changes.changeEntries || changes.changeEntries.length === 0) {
            return { patches: new Map(), commitId: '' };
        }

        const patches = new Map<string, string>();

        for (const change of changes.changeEntries) {
            if (!change.item?.path || !change.item?.objectId) continue;
            if (change.changeType === 8 /* Delete */) continue; // skip deleted files

            const filePath = change.item.path;

            try {
                const newContent = await this.getFileContent(gitApi, repositoryId, projectName, change.item.objectId);
                let oldContent = '';

                if (change.item.originalObjectId) {
                    oldContent = await this.getFileContent(gitApi, repositoryId, projectName, change.item.originalObjectId);
                }

                if (oldContent || newContent) {
                    const rawDiff = await this.getRawDiffOutput(newContent, oldContent);
                    if (rawDiff) {
                        patches.set(filePath, rawDiff);
                    }
                }
            } catch (err) {
                console.warn(`⚠️ Could not get raw diff for ${filePath}: ${err}`);
            }
        }

        return { patches, commitId: '' };
    }

    //#region Private Methods

    /**
     * Get Git API
     */
    private async getGitApi(): Promise<IGitApi> {
        return this.connection.getGitApi();
    }

    /**
     * Verify Pull Request changes
     * @param gitApi - Git API instance
     * @param projectName - Project ID
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param enableIncrementalDiff - Incremental diff mode (latest push only)
     * @returns PR change info, or null if verification fails
     */
    private async verifyPullRequestChanges(
        gitApi: IGitApi,
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        enableIncrementalDiff: boolean = false
    ): Promise<{ changes: GitPullRequestIterationChanges; previousChanges?: GitPullRequestIterationChanges["changeEntries"] } | null> {
        // Get Pull Request info
        const pr = await gitApi.getPullRequest(repositoryId, pullRequestId, projectName);
        if (!pr || !pr.lastMergeSourceCommit || !pr.lastMergeTargetCommit) {
            throw new Error('⛔ Unable to get Pull Request information');
        }

        // Get latest PR iterations
        const iterations = await gitApi.getPullRequestIterations(repositoryId, pullRequestId, projectName);
        if (!iterations || iterations.length === 0) {
            console.log('❗ No PR iterations found');
            return null;
        }


        // Choose iteration based on incremental diff mode
        let targetIteration;
        let previousIteration;

        if (enableIncrementalDiff && iterations.length > 1) {
            // Incremental mode: only latest push changes
            // Compare last iteration with the previous iteration
            targetIteration = iterations[iterations.length - 1];
            previousIteration = iterations[iterations.length - 2];
            console.log(`📍 Incremental Diff Mode: Enabled - Only reviewing changes from the latest push (comparing iteration ${targetIteration.id} against iteration ${previousIteration.id})`);
        } else if (enableIncrementalDiff && iterations.length === 1) {
            // Incremental mode with only one iteration: equivalent to full diff
            targetIteration = iterations[0];
            console.log(`📍 Incremental Diff Mode: Only 1 iteration found - reviewing all PR changes (equivalent to full diff)`);
        } else {
            // Full diff mode: all changes against base branch
            // Use the last iteration (full diff vs base branch)
            targetIteration = iterations[iterations.length - 1];
            console.log(`📍 Full Diff Mode: Reviewing all PR changes from base branch`);
        }

        if (!targetIteration || targetIteration.id === undefined) {
            console.log('❗ Unable to get target PR iteration');
            return null;
        }

        // Get PR change entries
        let changes = await gitApi.getPullRequestIterationChanges(
            repositoryId,
            pullRequestId,
            targetIteration.id
        );

        let previousChanges: GitPullRequestIterationChanges["changeEntries"] | undefined;

        // In incremental mode, keep only latest push changes
        if (enableIncrementalDiff && previousIteration && previousIteration.id !== undefined) {
            // Get previous iteration changes for comparison
            const previousIterationChanges = await gitApi.getPullRequestIterationChanges(
                repositoryId,
                pullRequestId,
                previousIteration.id
            );

            // Calculate incremental changes (only add/modify in latest iteration)
            changes = this.calculateIncrementalChanges(changes, previousIterationChanges);
            previousChanges = previousIterationChanges.changeEntries;
            console.log(`ℹ️ Only changes from the latest push will be included`);
        }

        if (!changes.changeEntries || changes.changeEntries.length === 0) {
            console.log('❗ No code changes detected');
            return null;
        }

        return { changes, previousChanges };
    }

    /**
     * Calculate incremental changes (latest push only)
     * @param currentChanges - Current iteration changes
     * @param previousChanges - Previous iteration changes
     * @returns GitPullRequestIterationChanges containing only latest push changes
     */
    private calculateIncrementalChanges(
        currentChanges: GitPullRequestIterationChanges,
        previousChanges: GitPullRequestIterationChanges
    ): GitPullRequestIterationChanges {
        if (!currentChanges.changeEntries) {
            return currentChanges;
        }

        const previousPaths = new Set(
            previousChanges.changeEntries?.map(e => e.item?.path) || []
        );

        const incrementalEntries = currentChanges.changeEntries.filter(change => {
            const currentPath = change.item?.path;

            // Keep files that did not exist in previous iteration (added)
            if (!previousPaths.has(currentPath)) {
                return true;
            }

            // For existing files, determine if modified in latest push
            // Compare objectId changes across iterations
            const previousChange = previousChanges.changeEntries?.find(
                e => e.item?.path === currentPath
            );

            // Different objectId means file was modified in latest push
            if (previousChange && change.item?.objectId !== previousChange.item?.objectId) {
                return true;
            }

            return false;
        });

        return {
            ...currentChanges,
            changeEntries: incrementalEntries
        };
    }

    /**
     * Extract only added/modified lines from diff content
     * @param diffContent - Full diff content
     * @returns Diff containing only added and modified lines
     */
    private extractIncrementalDiffLines(diffContent: string): string {
        if (!diffContent) return '';

        const lines = diffContent.split('\n');
        const incrementalLines: string[] = [];
        let currentSection = '';

        for (const line of lines) {
            // Keep diff header lines
            if (line.startsWith('diff --git') ||
                line.startsWith('index ') ||
                line.startsWith('---') ||
                line.startsWith('+++') ||
                line.startsWith('@@')) {
                incrementalLines.push(line);
                currentSection = line;
            }
            // Keep added lines (+ but not +++)
            else if (line.startsWith('+') && !line.startsWith('+++')) {
                incrementalLines.push(line);
            }
            // Keep removed lines (- but not ---) for context
            else if (line.startsWith('-') && !line.startsWith('---')) {
                incrementalLines.push(line);
            }
            // Keep some context lines (blank or normal) for understanding
            else if (line.startsWith(' ') || line === '') {
                // Keep context only near changes
                if (incrementalLines.length > 0) {
                    incrementalLines.push(line);
                }
            }
        }

        return incrementalLines.join('\n');
    }

    /**
     * Filter change entries
     * @param changeEntries - PR change entries
     * @param fileExtensions - Extensions to include
     * @param binaryExtensions - Binary extensions to exclude
     * @returns Filtered change entries
     */
    private filterChangeEntries(
        changeEntries: GitPullRequestIterationChanges["changeEntries"],
        fileExtensions: string[],
        binaryExtensions: string[]
    ) {
        if (!changeEntries) return [];

        const filteredEntries = changeEntries.filter(change => {
            // Exclude deleted files
            if (change.changeType === VersionControlChangeType.Delete) {
                return false;
            }

            const filePath = change.item?.path;
            if (!filePath) return false;

            return this.shouldIncludeFile(filePath, fileExtensions, binaryExtensions);
        });

        this.logFilterResult(
            changeEntries.length,
            filteredEntries.length,
            filteredEntries.map(e => e.item?.path || '').filter(p => p)
        );

        return filteredEntries;
    }

    /**
     * Get detailed file changes
     * @param changes - Change entries
     * @param gitApi - Git API instance
     * @param repositoryId - Repository ID
     * @param projectName - Project ID
     * @param enableThrottleMode - Throttle mode (default true: diff only; false: full file)
     * @param enableIncrementalDiff - Incremental diff mode (default false: all PR changes; true: latest push only)
     * @param previousIterationChanges - Previous iteration changes (for incremental mode)
     * @returns Change details including file path and diff content
     */
    private async getChangeDetails(
        changes: GitPullRequestIterationChanges["changeEntries"],
        gitApi: IGitApi,
        repositoryId: string,
        projectName: string,
        enableThrottleMode: boolean = true,
        enableIncrementalDiff: boolean = false,
        previousIterationChanges?: GitPullRequestIterationChanges["changeEntries"]
    ): Promise<FileChangeDetail[]> {
        if (!changes) return [];

        return Promise.all(
            changes.map(async (change) => {
                const filePath = change.item!.path!;
                let content = '';

                if (change.item) {
                    try {
                        const sourceContent = await this.getFileContent(
                            gitApi,
                            repositoryId,
                            projectName,
                            change.item.objectId!
                        );

                        // Added file
                        if (change.changeType === VersionControlChangeType.Add) {
                            if (enableThrottleMode) {
                                content = this.formatAddedFileContent(sourceContent);
                                this.logProcessAddedFile(filePath, true);
                            } else {
                                content = sourceContent;
                                this.logProcessAddedFile(filePath, false);
                            }
                        }

                        // Edited file
                        if (change.changeType === VersionControlChangeType.Edit) {
                            if (enableThrottleMode) {
                                let targetContent = '';

                                // In incremental mode, use previous iteration
                                // Otherwise use originalObjectId (compare with base)
                                if (enableIncrementalDiff && previousIterationChanges) {
                                    const previousChange = previousIterationChanges.find(
                                        c => c.item?.path === filePath
                                    );
                                    if (previousChange && previousChange.item?.objectId) {
                                        // Get file content from previous iteration
                                        targetContent = await this.getFileContent(
                                            gitApi,
                                            repositoryId,
                                            projectName,
                                            previousChange.item.objectId
                                        );
                                    }
                                } else if (change.item.originalObjectId) {
                                    // Use original version (typically base branch)
                                    targetContent = await this.getFileContent(
                                        gitApi,
                                        repositoryId,
                                        projectName,
                                        change.item.originalObjectId
                                    );
                                }

                                if (targetContent) {
                                    content = await this.getDiffContent(sourceContent, targetContent);
                                    if (this.isSmallFile(sourceContent)) {
                                        content = this.appendFullFileContext(content, sourceContent);
                                    }
                                } else {
                                    // If target content is unavailable, show full source content
                                    content = this.formatAddedFileContent(sourceContent);
                                }

                                this.logProcessEditedFile(filePath, true);
                            } else {
                                content = sourceContent;
                                this.logProcessEditedFile(filePath, false);
                            }
                        }
                    } catch (error) {
                        console.error(`Error getting changes for ${filePath}:`, error);
                        content = 'Unable to get PR change content';
                    }
                }

                return {
                    path: filePath,
                    changeType: change.changeType,
                    content: content
                };
            })
        );
    }

    /**
     * Get file content
     * @param gitApi - Git API instance
     * @param repositoryId - Repository ID
     * @param projectName - Project ID
     * @param objectId - File object ID
     * @returns File content
     */
    private async getFileContent(
        gitApi: IGitApi,
        repositoryId: string,
        projectName: string,
        objectId: string
    ): Promise<string> {
        const blobContent = await gitApi.getBlobContent(
            repositoryId,
            objectId,
            projectName,
            true
        );

        if (blobContent instanceof Readable) {
            return this.readStreamContent(blobContent);
        }

        return '';
    }

    /**
     * Read content from a Readable stream
     * @param stream - Readable stream
     * @returns File content string
     */
    private async readStreamContent(stream: Readable): Promise<string> {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks).toString('utf8');
    }

    /**
     * Async exec helper
     */
    private readonly execAsync = promisify(exec);

    /**
     * Use git diff to get file differences
     * @param newContent - New content
     * @param oldContent - Old content
     * @returns Diff content
     */
    private async getDiffContent(newContent: string, oldContent: string): Promise<string> {
        // Create temporary files
        const tempPath = os.tmpdir();
        const randomId = Math.random().toString(36).substring(2, 15);
        const oldFile = path.join(tempPath, `old-${randomId}.tmp`);
        const newFile = path.join(tempPath, `new-${randomId}.tmp`);

        try {
            // Write temp files
            await fs.writeFile(oldFile, oldContent);
            await fs.writeFile(newFile, newContent);

            try {
                // Use git diff to compare files
                const { stdout } = await this.execAsync(`git diff --no-index "${oldFile}" "${newFile}"`);
                return this.processDiffOutput(stdout);
            } catch (error: any) {
                // git diff returns exit code 1 when differences exist (expected)
                if (error.code === 1 && error.stdout) {
                    return this.processDiffOutput(error.stdout);
                }

                throw new Error(`⛔ Error in git diff: ${error.message}`);
            }
        } finally {
            // Clean up temp files
            await Promise.all([
                fs.unlink(oldFile).catch(() => { }),
                fs.unlink(newFile).catch(() => { })
            ]);
        }
    }

    /**
     * Use git diff to get raw file differences without post-processing.
     * Unlike getDiffContent, this returns the raw unified diff output needed
     * by parsePatchWithLineNumbers for suggestion mode.
     * @param newContent - New content
     * @param oldContent - Old content
     * @returns Raw diff output
     */
    private async getRawDiffOutput(newContent: string, oldContent: string): Promise<string> {
        const tempPath = os.tmpdir();
        const randomId = Math.random().toString(36).substring(2, 15);
        const oldFile = path.join(tempPath, `old-${randomId}.tmp`);
        const newFile = path.join(tempPath, `new-${randomId}.tmp`);

        try {
            await fs.writeFile(oldFile, oldContent);
            await fs.writeFile(newFile, newContent);

            try {
                const { stdout } = await this.execAsync(`git diff --no-index "${oldFile}" "${newFile}"`);
                return stdout;
            } catch (error: any) {
                if (error.code === 1 && error.stdout) {
                    return error.stdout;
                }
                throw new Error(`⛔ Error in git diff (raw): ${error.message}`);
            }
        } finally {
            await Promise.all([
                fs.unlink(oldFile).catch(() => { }),
                fs.unlink(newFile).catch(() => { })
            ]);
        }
    }

    //#endregion
}
