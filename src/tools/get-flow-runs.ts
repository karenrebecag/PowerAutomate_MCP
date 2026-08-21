/**
 * get_flow_runs — recent run history for one flow.
 *
 * Each run carries status, code and timing under `properties`, plus a `trigger`
 * block. Full per-action detail lives in get_run_actions, not here.
 */
import { z } from 'zod';
import { flowRequest } from '../client/flow-api.js';
import { jsonResult, runTool } from '../core/tool-result.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const getFlowRunsSchema = z.object({
  environmentId: z.string().describe('Environment ID.'),
  flowId: z.string().describe('Flow ID.'),
  top: z.number().int().positive().max(100).optional().describe('Max runs (default 20).'),
});

interface RunEnvelope {
  name: string;
  properties?: {
    status?: string;
    code?: string;
    startTime?: string;
    endTime?: string;
    error?: { code?: string; message?: string };
  };
}

export async function handleGetFlowRuns(
  args: z.infer<typeof getFlowRunsSchema>,
): Promise<CallToolResult> {
  return runTool(async () => {
    const res = await flowRequest<{ value: RunEnvelope[] }>(
      `/providers/Microsoft.ProcessSimple/environments/${args.environmentId}/flows/${args.flowId}/runs`,
      { query: { $top: (args.top ?? 20).toString() } },
    );
    const runs = (res.value ?? []).map((r) => ({
      runId: r.name,
      status: r.properties?.status,
      code: r.properties?.code,
      startTime: r.properties?.startTime,
      endTime: r.properties?.endTime,
      error: r.properties?.error,
    }));
    return jsonResult({ count: runs.length, runs });
  });
}
