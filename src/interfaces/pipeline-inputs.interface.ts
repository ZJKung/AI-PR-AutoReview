/**
 * Azure DevOps Pipeline input parameters interface
 */
export interface PipelineInputs {
    /** AI provider name */
    aiProvider: string;
    /** AI model name */
    modelName: string;
    /** AI model API key */
    modelKey: string;
    /** System instruction */
    systemInstruction: string;
    /** Prompt template */
    promptTemplate: string;
    /** Maximum output token count */
    maxOutputTokens: number;
    /** Temperature value (randomness) */
    temperature: number;
    /** List of file extensions to include */
    fileExtensions: string[];
    /** List of binary file extensions to exclude */
    binaryExtensions: string[];
    /** Enable AI throttle mode (default true, send diff only; false sends full file) */
    enableThrottleMode: boolean;
    /** Show review content (default false, don't show; true prints content sent to AI and response) */
    showReviewContent: boolean;
    /** Enable incremental Diff mode (default false, check all PR changes; true checks only the last push changes) */
    enableIncrementalDiff: boolean;
}

/**
 * Azure DevOps connection information interface
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
