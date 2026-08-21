/**
 * get_flow — the full flow definition (triggers, actions, parameters) plus its
 * connection references.
 *
 * `properties.definition` is the editable workflow schema; it is exactly what
 * you mutate and send back through create_or_update_flow. `connectionReferences`
 * maps each logical connector to a concrete connection. Both shapes confirmed
 * by Phase 0.
 */
import { z } from 'zod';
import { flowRequest } from '../client/flow-api.js';
import { jsonResult, runTool } from '../core/tool-result.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const getFlowSchema = z.object({
  environmentId: z.string().describe('Environment ID.'),
  flowId: z.string().describe('Flow ID (the `name` field from list_flows).'),
});

interface FlowDefinitionEnvelope {
  name: string;
  properties?: {
    displayName?: string;
    state?: string;
    definition?: unknown;
    connectionReferences?: Record<string, unknown>;
    lastModifiedTime?: string;
  };
}

export async function handleGetFlow(args: z.infer<typeof getFlowSchema>): Promise<CallToolResult> {
  return runTool(async () => {
    const res = await flowRequest<FlowDefinitionEnvelope>(
      `/providers/Microsoft.ProcessSimple/environments/${args.environmentId}/flows/${args.flowId}`,
      { query: { $expand: 'properties.connectionReferences,properties.definition' } },
    );
    const p = res.properties ?? {};
    return jsonResult({
      id: res.name,
      displayName: p.displayName,
      state: p.state,
      lastModified: p.lastModifiedTime,
      connectionReferences: p.connectionReferences,
      definition: p.definition,
    });
  });
}
