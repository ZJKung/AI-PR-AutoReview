/**
 * Chunked review support: split large change sets into size-budgeted chunks
 * that are reviewed in parallel and merged by one aggregation pass.
 */

export interface ChunkFile {
    path: string;
    changeType: any;
    content: string;
}

export interface ReviewChunk {
    files: ChunkFile[];
    /** Total content size of the chunk in characters */
    size: number;
}

/** Character budget per LLM request (roughly 15k tokens) */
export const DEFAULT_CHUNK_BUDGET_CHARS = 60_000;

/** Maximum concurrent chunk review requests */
export const DEFAULT_CHUNK_CONCURRENCY = 3;

/**
 * Greedily pack files into chunks without exceeding the budget. A single file
 * larger than the budget gets its own chunk (the provider may truncate, but
 * the file is never silently dropped). Order is preserved.
 */
export function splitIntoChunks(files: ChunkFile[], budgetChars: number): ReviewChunk[] {
    const chunks: ReviewChunk[] = [];
    let current: ReviewChunk = { files: [], size: 0 };

    for (const file of files) {
        const size = file.content.length;
        if (current.files.length > 0 && current.size + size > budgetChars) {
            chunks.push(current);
            current = { files: [], size: 0 };
        }
        current.files.push(file);
        current.size += size;
    }
    if (current.files.length > 0) chunks.push(current);
    return chunks;
}

/**
 * Run async task factories with bounded concurrency, preserving result order.
 */
export async function runWithConcurrency<T>(
    tasks: Array<() => Promise<T>>,
    limit: number
): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let next = 0;

    async function worker(): Promise<void> {
        while (next < tasks.length) {
            const index = next++;
            results[index] = await tasks[index]();
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
}
