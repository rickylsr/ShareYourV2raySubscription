import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const wrangler = fileURLToPath(new URL('./node_modules/wrangler/bin/wrangler.js', import.meta.url));
const project = fileURLToPath(new URL('../', import.meta.url));
const schema = fileURLToPath(new URL('./schema.sql', import.meta.url));
const args = process.argv.slice(2);
if (!args.some(arg => ['--config', '-c'].includes(arg) || arg.startsWith('--config='))) {
  args.unshift('--config', fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)));
}
function run(command) {
  const result = spawnSync(process.execPath, [wrangler, ...command], { cwd: project, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(['deploy', ...args]);
if (!args.some(arg => arg === '--dry-run' || arg.startsWith('--dry-run='))) {
  const common = [];
  const shared = new Set(['--config', '-c', '--env', '-e', '--profile', '--cwd', '--env-file']);
  for (let index = 0; index < args.length; index++) {
    if (shared.has(args[index])) common.push(args[index], args[++index]);
    else if ([...shared].some(flag => args[index].startsWith(flag + '='))) common.push(args[index]);
  }
  // Infrastructure setup is outside the HTTP CPU budget and never deletes data.
  run(['d1', 'execute', 'DB', '--remote', '--command', readFileSync(schema, 'utf8'), '--yes', ...common]);
}
