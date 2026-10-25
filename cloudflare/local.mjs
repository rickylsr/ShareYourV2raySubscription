import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('./node_modules/wrangler/bin/wrangler.js', import.meta.url));
const config = fileURLToPath(new URL('../wrangler.jsonc', import.meta.url));
const schema = fileURLToPath(new URL('./schema.sql', import.meta.url));
const [operation, ...args] = process.argv.slice(2);
if (args.some(arg => /^(--remote|--no-local|--local=false|--no-dry-run|--dry-run=false)(=|$)/.test(arg))) {
  throw new Error('Local commands cannot enable remote execution or disable dry-run.');
}
const common = args.some(arg => ['--config', '-c'].includes(arg) || arg.startsWith('--config=')) ? [] : ['--config', config];
const commands = {
  dev: ['dev', ...common, ...args, '--local'],
  check: ['deploy', ...common, ...args, '--dry-run'],
  db: ['d1', 'execute', 'DB', ...common, '--file', schema, '--yes', ...args, '--local'],
};
if (!Object.hasOwn(commands, operation)) throw new Error('Expected dev, check or db.');
const result = spawnSync(process.execPath, [wrangler, ...commands[operation]], { cwd: project, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
