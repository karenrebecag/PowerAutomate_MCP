/**
 * Helpers for shaping MCP tool results.
 *
 * The service API wraps everything in a verbose envelope (top-level `name`,
 * `id`, `type`, and the useful bits nested under `properties`). Tools return
 * trimmed, agent-friendly JSON as a text block rather than dumping the raw
 * envelope, which keeps token cost down and the output legible.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `error: ${message}` }], isError: true };
}

/**
 * Wrap a tool handler so a thrown Flow API error becomes a clean MCP error
 * result instead of crashing the transport. Every tool routes through this.
 */
export async function runTool(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}
