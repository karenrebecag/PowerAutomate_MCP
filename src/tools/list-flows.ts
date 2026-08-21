/**
 * list_flows — cloud flows in an environment (personal + shared-with-me).
 *
 * Returns the summary fields, not the full definition — use get_flow for that.
 */
import { z } from 'zod';
import { flowRequest } from '../client/flow-api.js';
import { jsonResult, runTool } from '../core/tool-result.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const listFlowsSchema = z.object({
  environmentId: z.string().describe('Environment ID from list_environments.'),
  top: z.number().int().positive().max(250).optional().describe('Max flows to return.'),
});

interface EnvelopeFlow {
  name: string;
  properties?: {
    displayName?: string;
    state?: string;
    createdTime?: string;
    lastModifiedTime?: string;
    definitionSummary?: { triggers?: unknown[] };
  };
}

export async function handleListFlows(
  args: z.infer<typeof listFlowsSchema>,
): Promise<CallToolResult> {
  return runTool(async () => {
    const res = await flowRequest<{ value: EnvelopeFlow[] }>(
      `/providers/Microsoft.ProcessSimple/environments/${args.environmentId}/flows`,
      { query: { $top: args.top?.toString() } },
    );
    const flows = (res.value ?? []).map((f) => ({
      id: f.name,
      displayName: f.properties?.displayName,
      state: f.properties?.state,
      lastModified: f.properties?.lastModifiedTime,
    }));
    return jsonResult({ count: flows.length, flows });
  });
}
