/**
 * create_or_update_flow — the one write tool that changes flow logic.
 *
 * ── Shape (confirmed via get_flow in Phase 0) ───────────────────────────────
 * A flow's editable body lives at properties.definition (the workflow schema:
 * $schema, contentVersion, parameters, triggers, actions) alongside
 * properties.connectionReferences. To change a flow you fetch that object,
 * mutate it, and send it back:
 *
 *   update:  PATCH .../flows/{id}   body { properties: { definition, ... } }
 *   create:  POST  .../flows        body { properties: { definition, displayName, ... } }
 *
 * ── Safety ──────────────────────────────────────────────────────────────────
 * This can break a production automation in one call, so dryRun is the DEFAULT.
 * Without `dryRun: false` the tool validates the payload, reports exactly what
 * it would send, and writes nothing. You opt into the write explicitly.
 */
import { z } from 'zod';
import { flowRequest } from '../client/flow-api.js';
import { jsonResult, runTool } from '../core/tool-result.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const createOrUpdateFlowSchema = z.object({
  environmentId: z.string().describe('Environment ID.'),
  flowId: z.string().optional().describe('Flow ID to update. Omit to CREATE a new flow.'),
  displayName: z.string().optional().describe('Display name. Required when creating.'),
  definition: z
    .record(z.unknown())
    .describe('The workflow definition object (properties.definition from get_flow).'),
  connectionReferences: z
    .record(z.unknown())
    .optional()
    .describe('Connection references map (properties.connectionReferences from get_flow).'),
  dryRun: z
    .boolean()
    .optional()
    .describe('Default true — preview only. Pass false to actually write.'),
});

type Args = z.infer<typeof createOrUpdateFlowSchema>;

function buildBody(args: Args): { properties: Record<string, unknown> } {
  const properties: Record<string, unknown> = { definition: args.definition };
  if (args.displayName) properties.displayName = args.displayName;
  if (args.connectionReferences) properties.connectionReferences = args.connectionReferences;
  return { properties };
}

export async function handleCreateOrUpdateFlow(args: Args): Promise<CallToolResult> {
  return runTool(async () => {
    const isCreate = !args.flowId;
    if (isCreate && !args.displayName) {
      return jsonResult({ error: 'displayName is required when creating a new flow.' });
    }

    const body = buildBody(args);
    // dryRun defaults ON: only an explicit `false` performs the write.
    const dryRun = args.dryRun !== false;

    if (dryRun) {
      return jsonResult({
        dryRun: true,
        operation: isCreate ? 'create' : 'update',
        flowId: args.flowId ?? '(new)',
        wouldSend: body,
        note: 'Pass dryRun:false to apply.',
      });
    }

    const path = isCreate
      ? `/providers/Microsoft.ProcessSimple/environments/${args.environmentId}/flows`
      : `/providers/Microsoft.ProcessSimple/environments/${args.environmentId}/flows/${args.flowId}`;

    const result = await flowRequest<{ name?: string; properties?: { displayName?: string } }>(
      path,
      { method: isCreate ? 'POST' : 'PATCH', body },
    );

    return jsonResult({
      applied: true,
      operation: isCreate ? 'create' : 'update',
      flowId: result.name ?? args.flowId,
      displayName: result.properties?.displayName ?? args.displayName,
    });
  });
}
