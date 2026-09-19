import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
// Tooling exception: inspect current source before build; #security/* resolves to dist in Node.
import { CONTENT_SECURITY_POLICY } from '../../src/security/policy.ts';

async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else out.push(path);
  }
  return out;
}
for (const path of await files('src')) {
  if (!path.endsWith('.ts')) continue;
  const text = await readFile(path, 'utf8');
  assert.equal(
    /(?:from\s*|import\s*\()['"]\.\.\//.test(text),
    false,
    `${path}: parent-relative module import`,
  );
  assert.equal(text.includes('\x00'), false, `${path}: NUL byte`);
  assert.equal(
    /\bconsole\.(?:log|error|warn|info)\(/.test(text),
    false,
    `${path}: console output bypasses CLI contract`,
  );
}
for (const name of ['exhibit-publish', 'exhibit-setup']) {
  const text = await readFile(`src/skills/${name}/SKILL.md`, 'utf8');
  assert.ok(text.startsWith(`---\nname: ${name}\n`));
  assert.match(text, /\ndescription: .+/);
  assert.ok(text.includes('exhibit'));
}
const terraform = await readFile('examples/terraform/aws/main.tf', 'utf8');
// Require the reference's literal, JSON-compatible directive list; reject expressions.
const terraformCsp = terraform.match(/\bcsp\s*=\s*join\("; ",\s*(\[[\s\S]*?\])\s*\)/);
assert.ok(terraformCsp?.[1], 'Terraform must declare its literal CSP directive list.');
const directives: unknown = JSON.parse(terraformCsp[1]);
assert.ok(Array.isArray(directives) && directives.every((value) => typeof value === 'string'));
assert.equal(
  directives.join('; '),
  CONTENT_SECURITY_POLICY,
  'Terraform CSP differs from policy.ts.',
);
assert.match(terraform, /content_security_policy\s*=\s*local\.csp\b/);
const deployment = await readFile('src/skills/exhibit-setup/references/deployment.md', 'utf8');
const skillCsp = [...deployment.matchAll(/^Content-Security-Policy: (.+)$/gm)];
assert.equal(skillCsp.length, 1, 'Setup skill must declare exactly one CSP header.');
assert.equal(skillCsp[0]?.[1], CONTENT_SECURITY_POLICY, 'Setup skill CSP differs from policy.ts.');

const pkg: unknown = JSON.parse(await readFile('package.json', 'utf8'));
assert.ok(
  typeof pkg === 'object' &&
    pkg !== null &&
    'bin' in pkg &&
    'private' in pkg &&
    'dependencies' in pkg,
);
assert.ok(
  typeof pkg.bin === 'object' && pkg.bin !== null && 'exhibit' in pkg.bin && 'xbt' in pkg.bin,
);
assert.ok(
  typeof pkg.dependencies === 'object' &&
    pkg.dependencies !== null &&
    'staticrypt' in pkg.dependencies,
);
assert.equal(pkg.bin.exhibit, pkg.bin.xbt);
assert.equal(typeof pkg.private, 'boolean', 'Package private must explicitly be true or false.');
assert.ok(pkg.dependencies.staticrypt === '3.5.4');
process.stdout.write(
  'Source import, output, package, skill, and CSP alignment contracts verified.\n',
);
