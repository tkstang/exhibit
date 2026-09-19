import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../../examples/terraform/aws/', import.meta.url));
for (const args of [
  ['fmt', '-check', '-recursive'],
  ['init', '-backend=false', '-lockfile=readonly', '-input=false'],
  ['validate'],
  ['test'],
]) {
  const result = spawnSync('terraform', args, { cwd, stdio: 'inherit' });
  if (result.error) {
    process.stderr.write('Cannot run Terraform. Install Terraform 1.15.1 and check PATH.\n');
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
