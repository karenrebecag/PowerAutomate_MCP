/**
 * MCP server wiring.
 *
 * Uses the high-level McpServer with zod raw shapes as input schemas — the SDK
 * converts them to JSON Schema and validates incoming args before the handler
 * runs, so each handler receives already-typed arguments.
 *
 * Read-only surface for now. The two write tools (create_or_update_flow,
 * set_flow_state) are added in a separate reviewed pass with a mandatory dryRun
 * preview, per the project spec.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  listEnvironmentsSchema,
  handleListEnvironments,
  listFlowsSchema,
  handleListFlows,
  getFlowSchema,
  handleGetFlow,
  getFlowRunsSchema,
  handleGetFlowRuns,
  getRunActionsSchema,
  handleGetRunActions,
  setFlowStateSchema,
  handleSetFlowState,
  createOrUpdateFlowSchema,
  handleCreateOrUpdateFlow,
} from './tools/index.js';

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;
// Write tools touch a live tenant; openWorldHint stays true, readOnly false.
const WRITE = { readOnlyHint: false, openWorldHint: true } as const;

const INSTRUCTIONS = [
  'Manage personal Power Automate cloud flows.',
  'Start with list_environments to get an environment ID, then list_flows.',
  'get_flow returns the full editable definition; get_run_actions is the debugging view',
  '(it follows inputs/outputs links for failed actions by default).',
].join(' ');

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'power-automate-mcp',
      version: '0.1.0',
      title: 'Power Automate',
    },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  server.registerTool(
    'list_environments',
    {
      description: 'List every Power Platform environment the signed-in account can see.',
      inputSchema: listEnvironmentsSchema.shape,
      annotations: READ_ONLY,
    },
    () => handleListEnvironments(),
  );

  server.registerTool(
    'list_flows',
    {
      description: 'List cloud flows in an environment (summary fields, not the full definition).',
      inputSchema: listFlowsSchema.shape,
      annotations: READ_ONLY,
    },
    (args) => handleListFlows(args),
  );

  server.registerTool(
    'get_flow',
    {
      description:
        'Full flow definition (triggers, actions, parameters) and connection references.',
      inputSchema: getFlowSchema.shape,
      annotations: READ_ONLY,
    },
    (args) => handleGetFlow(args),
  );

  server.registerTool(
    'get_flow_runs',
    {
      description: 'Recent run history for a flow: status, code and timing per run.',
      inputSchema: getFlowRunsSchema.shape,
      annotations: READ_ONLY,
    },
    (args) => handleGetFlowRuns(args),
  );

  server.registerTool(
    'get_run_actions',
    {
      description:
        'Per-action breakdown of one run — the debugging view. Follows inputs/outputs links ' +
        'for failed actions by default (or a named action, or all).',
      inputSchema: getRunActionsSchema.shape,
      annotations: READ_ONLY,
    },
    (args) => handleGetRunActions(args),
  );

  server.registerTool(
    'set_flow_state',
    {
      description:
        'Turn a flow on (start) or off (stop). Previews by default; pass confirm:true to apply.',
      inputSchema: setFlowStateSchema.shape,
      annotations: WRITE,
    },
    (args) => handleSetFlowState(args),
  );

  server.registerTool(
    'create_or_update_flow',
    {
      description:
        'Create a new flow or update an existing one from a definition object. dryRun is the ' +
        'default — pass dryRun:false to actually write. Get the definition shape from get_flow.',
      inputSchema: createOrUpdateFlowSchema.shape,
      annotations: WRITE,
    },
    (args) => handleCreateOrUpdateFlow(args),
  );

  return server;
}
