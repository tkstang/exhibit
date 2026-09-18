import { basename, extname } from 'node:path';
import { ExhibitError } from '#core/errors';
import { readTextFile } from '#core/files';
import type { ArtifactType, Config, RenderedArtifact } from '#core/types';

export interface ArtifactInput { readonly text: string; readonly type: ArtifactType; readonly title: string; }

export async function readArtifact(file: string, maximum: number, title?: string): Promise<ArtifactInput> {
  const extension = extname(file).toLowerCase();
  let type: ArtifactType;
  if (['.md', '.markdown'].includes(extension)) type = 'markdown';
  else if (['.html', '.htm'].includes(extension)) type = 'html';
  else throw new ExhibitError('E_INPUT_TYPE', 'Only Markdown and standalone HTML files are supported.', { hint: 'Use .md, .markdown, .html, or .htm. Directories, ZIPs, and multi-file sites are not supported in v1.' });
  const text = await readTextFile(file, maximum);
  if (!text.trim()) throw new ExhibitError('E_INPUT', 'The artifact is empty.');
  return { text, type, title: title ?? basename(file, extname(file)) };
}

export async function renderArtifact(input: ArtifactInput, config: Config): Promise<RenderedArtifact> {
  if (input.type === 'markdown') {
    const { renderMarkdown } = await import('#render/markdown');
    return renderMarkdown(input.text, input.title, config);
  }
  const { renderHtml } = await import('#render/html');
  return renderHtml(input.text, input.title, config);
}
