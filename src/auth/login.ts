/**
 * `pnpm login` — one-time interactive sign-in.
 *
 * Runs the device-code flow and stores the refresh token so the MCP server can
 * mint access tokens silently afterwards. Re-run only when the refresh token
 * expires (~90 days of inactivity) or you want to switch accounts.
 */
import { deviceLogin } from './token.js';

async function main(): Promise<void> {
  process.stdout.write('\n  Power Automate MCP — sign in\n');
  await deviceLogin((uri, code) => {
    process.stdout.write(`\n  1. Open:  ${uri}\n`);
    process.stdout.write(`  2. Code:  ${code}\n`);
    process.stdout.write('\n  Waiting for you to finish signing in...\n');
  });
  process.stdout.write('\n  Signed in. Token saved (0600). You can start the server now.\n\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`\n  ${err instanceof Error ? err.message : String(err)}\n\n`);
  process.exit(1);
});
