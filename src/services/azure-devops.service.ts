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
import { FileChangeDetail } from '../interfaces/devops-service.interface';

/**
 * Azure DevOps API Service Class
 * Handles Azure DevOps-related API operations, including PR change checking and other features
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
     * Get service provider name
     * @returns Service provider name
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
     * @param commentHeader - Comment header, defaults to empty
     * @returns Comment Thread ID
     * @throws {Error} Throws error when comment addition fails
     */
    public async addPullRequestComment(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        content: string,
        commentHeader: string = ''
    ): Promise<number> {
        this.logAddCommentStart();

        // Write comment content
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
     * Get Pull Request changed files content
     * @param projectName - Project ID
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param fileExtensions - List of file extensions to filter, e.g., ['.ts', '.js'], empty means check all non-binary files
     * @param binaryExtensions - List of binary file extensions to exclude
     * @param enableThrottleMode - Enable throttle mode (default true, only send diff; false sends entire file)
     * @param enableIncrementalDiff - Enable incremental diff mode (default false, checks all PR changes; true checks only latest push changes)
     * @returns Detailed information about changes, including file paths and change content
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
        // Ensure binary file extensions have default values
        binaryExtensions = this.ensureBinaryExtensions(binaryExtensions);

        // Log processing start
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

        // Filter changed files
        const filteredChanges = this.filterChangeEntries(
            changes.changeEntries,
            fileExtensions,
            binaryExtensions
        );

        if (filteredChanges.length === 0) {
            this.logNoChanges();
            return null;
        }

        // Get detailed change content for each file
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

    //#region Private Methods

    /**
     * Get Git API
     */
    private async getGitApi(): Promise<IGitApi> {
        return this.connection.getGitApi();
    }

    /**
     * Check Pull Request change status
     * @param gitApi - Git API instance
     * @param projectName - Project ID
     * @param repositoryId - Repository ID
     * @param pullRequestId - Pull Request ID
     * @param enableIncrementalDiff - Enable incremental diff mode (only check latest push changes)
     * @returns PR change information, returns null if check fails
     */
    private async verifyPullRequestChanges(
        gitApi: IGitApi,
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        enableIncrementalDiff: boolean = false
    ): Promise<{ changes: GitPullRequestIterationChanges; previousChanges?: GitPullRequestIterationChanges["changeEntries"] } | null> {
        // Get Pull Request information
        const pr = await gitApi.getPullRequest(repositoryId, pullRequestId, projectName);
        if (!pr || !pr.lastMergeSourceCommit || !pr.lastMergeTargetCommit) {
            throw new Error('⛔ Unable to get Pull Request information');
        }

        // Get latest PR iteration
        const iterations = await gitApi.getPullRequestIterations(repositoryId, pullRequestId, projectName);
        if (!iterations || iterations.length === 0) {
            console.log('❗ No PR iterations found');
            return null;
        }


        // Select iteration to review based on incremental diff mode
        let targetIteration;
        let previousIteration;

        if (enableIncrementalDiff && iterations.length > 1) {
            // Incremental mode: only get changes from the latest push
            // Get changes between the last iteration and previous iteration
            targetIteration = iterations[iterations.length - 1];
            previousIteration = iterations[iterations.length - 2];
            console.log(`📍 Incremental Diff Mode: Enabled - Only reviewing changes from the latest push (comparing iteration ${targetIteration.id} against iteration ${previousIteration.id})`);
        } else if (enableIncrementalDiff && iterations.length === 1) {
            // Incremental mode but only 1 iteration: incremental diff equals full diff
            targetIteration = iterations[0];
            console.log(`📍 Incremental Diff Mode: Only 1 iteration found - reviewing all PR changes (equivalent to full diff)`);
        } else {
            // Full mode: get all changes relative to base branch
            // Use the last iteration (which represents the complete diff from base branch)
            targetIteration = iterations[iterations.length - 1];
            console.log(`📍 Full Diff Mode: Reviewing all PR changes from base branch`);
        }

        if (!targetIteration || targetIteration.id === undefined) {
            console.log('❗ Unable to get target PR iteration');
            return null;
        }

        // Get PR changed file list
        let changes = await gitApi.getPullRequestIterationChanges(
            repositoryId,
            pullRequestId,
            targetIteration.id
        );

        let previousChanges: GitPullRequestIterationChanges["changeEntries"] | undefined;

        // If in incremental mode, need to calculate changes only from the latest push
        if (enableIncrementalDiff && previousIteration && previousIteration.id !== undefined) {
            // Get previous iteration changes for comparison
            const previousIterationChanges = await gitApi.getPullRequestIterationChanges(
                repositoryId,
                pullRequestId,
                previousIteration.id
            );

            // Calculate incremental changes (keep only files added or modified in latest iteration)
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
     * Calculate incremental changes (keep only changes from the latest push)
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

            // Keep files that don't exist in previous iteration (newly added)
            if (!previousPaths.has(currentPath)) {
                return true;
            }

            // For existing files, we need to determine if they were modified in the latest push
            // Since objectId changes in iterations, we can determine this by comparing
            const previousChange = previousChanges.changeEntries?.find(
                e => e.item?.path === currentPath
            );

            // If objectId is different, the file was modified in the latest push
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
     * Extract lines containing only additions and modifications from diff content
     * @param diffContent - Complete diff content
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
            // Keep added lines (starting with +, but not +++)
            else if (line.startsWith('+') && !line.startsWith('+++')) {
                incrementalLines.push(line);
            }
            // Keep old lines before and after modifications (starting with -, but not ---)
            else if (line.startsWith('-') && !line.startsWith('---')) {
                incrementalLines.push(line);
            }
            // Keep some context lines (empty or normal lines, for understanding modification context)
            else if (line.startsWith(' ') || line === '') {
                // Only keep context near added or modified lines
                if (incrementalLines.length > 0) {
                    incrementalLines.push(line);
                }
            }
        }

        return incrementalLines.join('\n');
    }

    /**
     * Filter change file entries
     * @param changeEntries - PR changed file list
     * @param fileExtensions - List of file extensions to filter
     * @param binaryExtensions - List of binary file extensions to exclude
     * @returns Filtered changed file list
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
     * Get detailed content of file changes
     * @param changes - Changed file list
     * @param gitApi - Git API instance
     * @param repositoryId - Repository ID
     * @param projectName - Project ID
     * @param enableThrottleMode - Enable throttle mode (default true, only send diff; false sends entire file)
     * @param enableIncrementalDiff - Enable incremental diff mode (default false, checks all PR changes; true checks only latest push changes)
     * @param previousIterationChanges - Previous iteration changes (for incremental mode)
     * @returns Detailed file change information, including file paths and diff content
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

                        // If type is Add
                        if (change.changeType === VersionControlChangeType.Add) {
                            if (enableThrottleMode) {
                                content = this.formatAddedFileContent(sourceContent);
                                this.logProcessAddedFile(filePath, true);
                            } else {
                                content = sourceContent;
                                this.logProcessAddedFile(filePath, false);
                            }
                        }

                        // If type is Edit
                        if (change.changeType === VersionControlChangeType.Edit) {
                            if (enableThrottleMode) {
                                let targetContent = '';

                                // In incremental mode, get old version from previous iteration
                                // Otherwise use originalObjectId (comparison with base branch)
                                if (enableIncrementalDiff && previousIterationChanges) {
                                    const previousChange = previousIterationChanges.find(
                                        c => c.item?.path === filePath
                                    );
                                    if (previousChange && previousChange.item?.objectId) {
                                        // Get file version from previous iteration
                                        targetContent = await this.getFileContent(
                                            gitApi,
                                            repositoryId,
                                            projectName,
                                            previousChange.item.objectId
                                        );
                                    }
                                } else if (change.item.originalObjectId) {
                                    // Use original version (usually base branch)
                                    targetContent = await this.getFileContent(
                                        gitApi,
                                        repositoryId,
                                        projectName,
                                        change.item.originalObjectId
                                    );
                                }

                                if (targetContent) {
                                    content = await this.getDiffContent(sourceContent, targetContent);
                                } else {
                                    // If unable to get target content, display entire source content
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
     * Read content from Readable stream
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
     * Async method for executing commands
     */
    private readonly execAsync = promisify(exec);

    /**
     * Get file diff using git diff
     * @param newContent - New version content
     * @param oldContent - Old version content
     * @returns Diff content
     */
    private async getDiffContent(newContent: string, oldContent: string): Promise<string> {
        // Create temporary files
        const tempPath = os.tmpdir();
        const randomId = Math.random().toString(36).substring(2, 15);
        const oldFile = path.join(tempPath, `old-${randomId}.tmp`);
        const newFile = path.join(tempPath, `new-${randomId}.tmp`);

        try {
            // Write to temporary files
            await fs.writeFile(oldFile, oldContent);
            await fs.writeFile(newFile, newContent);

            try {
                // Use git diff to compare files
                const { stdout } = await this.execAsync(`git diff --no-index "${oldFile}" "${newFile}"`);
                return this.processDiffOutput(stdout);
            } catch (error: any) {
                // git diff returns exit code 1 when there are differences, which is normal
                if (error.code === 1 && error.stdout) {
                    return this.processDiffOutput(error.stdout);
                }

                throw new Error(`⛔ Error in git diff: ${error.message}`);
            }
        } finally {
            // Clean up temporary files
            await Promise.all([
                fs.unlink(oldFile).catch(() => { }),
                fs.unlink(newFile).catch(() => { })
            ]);
        }
    }

    //#endregion
}
