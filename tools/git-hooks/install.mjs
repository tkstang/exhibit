import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
// Never modify an ancestor repo when Exhibit has merely been unzipped into a subfolder.
const root = fileURLToPath(new URL('../../', import.meta.url));
if (existsSync(join(root, '.git'))) {
  const result = spawnSync(
    'git',
    ['-C', root, 'config', '--local', 'core.hooksPath', 'tools/git-hooks'],
    { stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
}
