import { Octokit } from '@octokit/rest';
import path from 'path';
import { BaseDevOpsService } from './base-devops.service';
import { FileChangeDetail } from '../interfaces/devops-service.interface';

/**
 * GitHub service class
 * Handles GitHub-related API operations, including PR change retrieval
 */
export class GitHubDevOpsService extends BaseDevOpsService {
    private client: Octokit;

    /**
     * Create GitHubDevOpsService instance
     * @param accessToken - GitHub personal access token (required)
     * @param baseUrl - Optional GitHub Enterprise API base URL; if not provided or github.com,
     *                  the default public GitHub API (api.github.com) is used.
     * @throws {Error} Throws error when accessToken is not provided
     */
    constructor(accessToken?: string, baseUrl?: string) {
        super(accessToken, baseUrl);

        const opts: any = { auth: this.accessToken };

        if (baseUrl) {
            // Normalize baseUrl: trim and remove trailing slashes to avoid duplicates
            const trimmed = baseUrl.trim().replace(/\/+$/g, '');
            try {
                const parsed = new URL(trimmed);
                // If host is github.com, keep Octokit's default baseUrl (public API)
                if (!/github\.com$/i.test(parsed.hostname)) {
                    // For Enterprise or custom API hosts, pass baseUrl to Octokit
                    opts.baseUrl = trimmed;
                }
            } catch (e) {
                // If not a full URL, use the trimmed string as-is (preserve input)
                opts.baseUrl = trimmed;
            }
        }

        this.client = new Octokit(opts);
    }

    /**
     * Get provider name
     * @returns Provider name
     */
    protected getProviderName(): string {
        return 'GitHub';
    }

    /**
     * Add a Pull Request comment (GitHub issues API)
     * @param projectName - Project name (unused for GitHub)
     * @param repositoryId - owner/repo format
     * @param pullRequestId - PR number
     * @param content - Comment content
     * @param commentHeader - Comment header
     * @returns New comment ID
     * @throws {Error} Throws error when format is invalid or creation fails
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

        // Build comment content
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
     * Get changed files and content for a Pull Request
     * @param projectName - Project name (unused for GitHub)
     * @param repositoryId - owner/repo format
     * @param pullRequestId - PR number
     * @param fileExtensions - Extensions to include (e.g. ['.ts']); empty means all non-binary
     * @param binaryExtensions - Binary extensions to exclude
     * @param enableThrottleMode - Throttle mode: true for patch-only, false for full file content
     * @param enableIncrementalDiff - Incremental diff mode (default false)
     * @returns Array of change details { path, changeType, content } or null if none
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

            // Exclude binary files without patch
            if (!entry.patch && binaryExtensions.includes(fileExt)) {
                return false;
            }

            // Use base-class filtering
            if (!this.shouldIncludeFile(entry.path, fileExtensions, binaryExtensions)) {
                return false;
            }

            // Include if patch exists or not binary
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
     * @throws Throws when format is invalid
     */
    private parseOwnerRepo(repositoryId: string): { owner: string; repo: string } {
        const parts = repositoryId.split('/');
        if (parts.length < 2) {
            throw new Error('⛔ For GitHub provider repositoryId must be "owner/repo"');
        }
        return { owner: parts[0], repo: parts.slice(1).join('/') };
    }

    /**
     * Get GitHub file content and decode it (base64)
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param filepath - File path
     * @param ref - Commit SHA or branch
     * @returns File content
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
