import { Octokit } from '@octokit/rest';
import path from 'path';
import { BaseDevOpsService } from './base-devops.service';
import { FileChangeDetail } from '../interfaces/devops-service.interface';

/**
 * GitHub Service Class
 * Handles GitHub-related API operations, including PR change checking and other features
 */
export class GitHubDevOpsService extends BaseDevOpsService {
    private client: Octokit;

    /**
     * Create GitHubDevOpsService instance
     * @param accessToken - GitHub personal access token (required)
     * @param baseUrl - Optional GitHub Enterprise API base URL; if not provided or for github.com,
     *                  will use the default public GitHub API (api.github.com).
     * @throws {Error} Throws error when accessToken is not provided
     */
    constructor(accessToken?: string, baseUrl?: string) {
        super(accessToken, baseUrl);

        const opts: any = { auth: this.accessToken };

        if (baseUrl) {
            // Normalize baseUrl: trim whitespace and trailing slashes to avoid duplicate slashes
            const trimmed = baseUrl.trim().replace(/\/+$/g, '');
            try {
                const parsed = new URL(trimmed);
                // If host is github.com, don't override Octokit's default baseUrl (use public API)
                if (!/github\.com$/i.test(parsed.hostname)) {
                    // Only pass baseUrl to Octokit for Enterprise or custom API hosts
                    opts.baseUrl = trimmed;
                }
            } catch (e) {
                // If not a complete URL, use the trimmed string directly (preserve user input format)
                opts.baseUrl = trimmed;
            }
        }

        this.client = new Octokit(opts);
    }

    /**
     * Get service provider name
     * @returns Service provider name
     */
    protected getProviderName(): string {
        return 'GitHub';
    }

    /**
     * Add Pull Request comment (using GitHub issues API)
     * @param projectName - Project name (GitHub does not use this parameter)
     * @param repositoryId - owner/repo format
     * @param pullRequestId - PR number
     * @param content - Comment content
     * @param commentHeader - Comment header
     * @returns ID of the added comment
     * @throws {Error} Throws error when format is invalid or addition fails
     */
    public async addPullRequestComment(
        projectName: string,
        repositoryId: string,
        pullRequestId: number,
        content: string,
        commentHeader: string = ''
    ): Promise<number> {
        this.logAddCommentStart();

        const { owner, repo } = this.parseOwnerRepo(repositoryId);

        // Write comment content
        const commentContent = commentHeader ? `# ${commentHeader}\n${content}` : content;

        const res = await this.client.rest.issues.createComment({
            owner,
            repo,
            issue_number: pullRequestId,
            body: commentContent
        });

        if (!res || !res.data || typeof res.data.id === 'undefined') {
            throw new Error('⛔ Failed to create GitHub comment');
        }

        const commentId = Number(res.data.id as any);
        this.logAddCommentSuccess(commentId);
        return commentId;
    }

    /**
     * Get Pull Request changed files and content
     * @param projectName - Project name (GitHub does not use this parameter)
     * @param repositoryId - owner/repo format
     * @param pullRequestId - PR number
     * @param fileExtensions - List of file extensions to include (e.g., ['.ts']), empty means all non-binary files
     * @param binaryExtensions - List of binary file extensions to exclude
     * @param enableThrottleMode - Throttle mode: true means only get diff (patch), false means get full file content
     * @param enableIncrementalDiff - Enable incremental diff mode (default false, checks all PR changes; true checks only latest push changes)
     * @returns Array of change details in format { path, changeType, content }, returns null if no changes
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
            console.log('🔄 Incremental Diff Mode: Enabled - Retrieving latest push changes');
            console.log('⚠️ Note: GitHub API provides all PR changes by default. For true incremental diff, you may need to use Git commands to compare individual commits.');
        }

        const { owner, repo } = this.parseOwnerRepo(repositoryId);

        const prInfo = await this.client.rest.pulls.get({
            owner,
            repo,
            pull_number: pullRequestId
        });
        const headSha = prInfo.data.head?.sha;

        const files = await this.client.paginate(
            this.client.rest.pulls.listFiles,
            { owner, repo, pull_number: pullRequestId }
        );

        if (!files || files.length === 0) {
            this.logNoChanges();
            return null;
        }

        const ghChangeEntries = files.map((f: any) => ({
            path: f.filename,
            status: f.status,
            patch: (f as any).patch
        }));

        const filteredGh = ghChangeEntries.filter((entry: any) => {
            if (entry.status === 'removed') return false;

            const fileExt = path.extname(entry.path).toLowerCase();

            // Exclude if no patch and is binary file
            if (!entry.patch && binaryExtensions.includes(fileExt)) {
                return false;
            }

            // Use base class filtering logic
            if (!this.shouldIncludeFile(entry.path, fileExtensions, binaryExtensions)) {
                return false;
            }

            // Include if has patch or not a binary file
            return !!entry.patch || !binaryExtensions.includes(fileExt);
        });

        if (filteredGh.length === 0) {
            this.logNoChanges();
            return null;
        }

        this.logFilterResult(
            ghChangeEntries.length,
            filteredGh.length,
            filteredGh.map(e => e.path)
        );

        const changeDetails = await Promise.all(filteredGh.map(async (f: any) => {
            let content = '';
            const filePath = f.path;
            try {
                if (enableThrottleMode) {
                    if (f.patch) {
                        // Use patch as diff-like content
                        content = this.processDiffOutput(f.patch as string);
                        this.logProcessEditedFile(filePath, true);
                    } else if (headSha) {
                        content = await this.getGitHubFileContent(owner, repo, filePath, headSha);
                        this.logProcessAddedFile(filePath, true);
                    }
                } else {
                    if (headSha) {
                        content = await this.getGitHubFileContent(owner, repo, filePath, headSha);
                        this.logProcessEditedFile(filePath, false);
                    }
                }
            } catch (err) {
                console.error(`Error getting GitHub changes for ${filePath}:`, err);
                content = 'Unable to get PR change content';
            }
            return {
                path: filePath,
                changeType: (f as any).status || 'modified',
                content
            };
        }));

        this.logRetrievingChangesComplete(changeDetails.length, enableThrottleMode);
        return changeDetails;
    }

    //#region Private Methods

    /**
     * Parse repositoryId (owner/repo)
     * @param repositoryId - Expected format "owner/repo"
     * @returns { owner, repo }
     * @throws Throws error when format is invalid
     */
    private parseOwnerRepo(repositoryId: string): { owner: string; repo: string } {
        const parts = repositoryId.split('/');
        if (parts.length < 2) {
            throw new Error('⛔ For GitHub provider repositoryId must be "owner/repo"');
        }
        return { owner: parts[0], repo: parts.slice(1).join('/') };
    }

    /**
     * Get GitHub file content and decode (base64)
     * @param owner - repository owner
     * @param repo - repository name
     * @param filepath - file path
     * @param ref - commit SHA or branch
     * @returns file content
     */
    private async getGitHubFileContent(
        owner: string,
        repo: string,
        filepath: string,
        ref?: string
    ): Promise<string> {
        const res = await this.client.rest.repos.getContent({
            owner,
            repo,
            path: filepath,
            ref
        });
        const data: any = res.data;
        if (Array.isArray(data)) return '';
        if (data && data.content) {
            const buff = Buffer.from(data.content, 'base64');
            return buff.toString('utf8');
        }
        return '';
    }

    //#endregion
}
