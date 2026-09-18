import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { marked } from 'marked';

const pages = new Map();
function readDirectory(directory) {
  const index = join(directory, 'index.md');
  assert.ok(existsSync(index), `${directory}: missing index.md`);
  const expected = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      expected.push(resolve(path, 'index.md'));
      readDirectory(path);
    } else if (entry.name.endsWith('.md')) {
      const text = readFileSync(path, 'utf8');
      const metadata = text.match(/^---\n([\s\S]*?)\n---\n/);
      assert.ok(metadata, `${path}: missing frontmatter`);
      for (const field of ['title', 'description'])
        assert.match(metadata[1], new RegExp(`^${field}:\\s*\\S.+$`, 'm'), `${path}: ${field}`);
      pages.set(path, text.slice(metadata[0].length));
      if (entry.name !== 'index.md') expected.push(resolve(path));
    }
  }
  const tokens = marked.lexer(pages.get(index));
  const start = tokens.findIndex((token) => token.type === 'heading' && token.text === 'Contents');
  assert.ok(start >= 0, `${index}: missing Contents heading`);
  const end = tokens.findIndex((token, i) => i > start && token.type === 'heading');
  const linked = new Set();
  marked.walkTokens(tokens.slice(start + 1, end < 0 ? undefined : end), (token) => {
    if (token.type === 'link') linked.add(resolve(directory, token.href.split('#')[0]));
  });
  for (const path of expected)
    assert.ok(linked.has(path), `${index}: missing Contents link to ${path}`);
}
readDirectory('docs');

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
const files = new Set([
  ...pages.keys(),
  ...tracked.filter((path) => /\.(md|ts|mjs)$/.test(path) && existsSync(path)),
]);
let links = 0;
for (const path of files) {
  const text = pages.get(path) ?? readFileSync(path, 'utf8');
  if (path.endsWith('.md')) {
    marked.walkTokens(marked.lexer(text), (token) => {
      if (!['link', 'image'].includes(token.type)) return;
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(token.href)) return;
      const target = token.href.split('#')[0];
      if (!target) return;
      assert.ok(
        existsSync(resolve(dirname(path), decodeURIComponent(target))),
        `${path}: ${target}`,
      );
      links++;
    });
  }
  for (const match of text.matchAll(/\bdocs\/[a-zA-Z0-9_./-]+\.md\b/g))
    assert.ok(existsSync(match[0]), `${path}: stale docs path ${match[0]}`);
  if (path.endsWith('/SKILL.md')) {
    for (const match of text.matchAll(/`((?:user-guide|engineering)\/[a-zA-Z0-9_./-]+\.md)`/g))
      assert.ok(
        existsSync(join('docs', match[1])),
        `${path}: stale installed docs path ${match[1]}`,
      );
  }
}
process.stdout.write(
  `Docs verified: ${pages.size} pages, navigation coverage, ${links} local links, and source/skill paths.\n`,
);
