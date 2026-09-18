import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// Never modify an ancestor repo when Exhibit has merely been unzipped into a subfolder.
if (existsSync('.git'))
  spawnSync('git', ['config', 'core.hooksPath', 'tools/git-hooks'], { stdio: 'ignore' });
