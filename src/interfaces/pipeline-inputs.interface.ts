/**
 * Azure DevOps pipeline input parameters interface
 */
export interface PipelineInputs {
    /** AI provider name */
    aiProvider: string;
    /** AI model name */
    modelName: string;
    /** AI model API key */
    modelKey: string;
    /** Server address (optional, for GitHub Copilot) */
    serverAddress?: string;
    /** Request timeout (optional, for GitHub Copilot, in milliseconds) */
    timeout?: number;
    /** System instruction */
    systemInstruction: string;
    /** Prompt template */
    promptTemplate: string;
    /** Max output tokens */
    maxOutputTokens: number;
    /** Temperature (randomness) */
    temperature: number;
    /** File extensions to include */
    fileExtensions: string[];
    /** Binary file extensions to exclude */
    binaryExtensions: string[];
    /** Enable AI throttle mode (default true: diff only; false: full file) */
    enableThrottleMode: boolean;
    /** Show review content (default false; true prints request and response) */
    showReviewContent: boolean;
    /** Enable incremental diff mode (default false: all PR changes; true: latest push only) */
    enableIncrementalDiff: boolean;
}

/**
 * Azure DevOps connection info interface
 */
export interface DevOpsConnection {
    /** Access token */
    accessToken: string;
    /** Organization URL */
    collectionUri: string;
    /** Project name */
    projectName: string;
    /** Repository ID */
    repositoryId: string;
    /** Pull Request ID */
    pullRequestId: number;
}
