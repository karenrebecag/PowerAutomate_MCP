#!/usr/bin/env node
/**
 * stdio entry point.
 *
 * Unlike the Salesforce MCP (a long-running HTTP server for the web connector),
 * this runs locally over stdio: the MCP client spawns this process and talks to
 * it on stdin/stdout. No port, no hosting, no URL secret — the only credential
 * is the on-disk refresh token, held by the OS file permissions (0600).
 *
 * Auth is checked lazily inside each tool call rather than at startup, so the
 * server still registers cleanly (and reports a clear "run pnpm login" error)
 * when no token exists yet.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Never write to stdout here — it is the MCP channel. Logs go to stderr.
  process.stderr.write('power-automate-mcp ready on stdio\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
