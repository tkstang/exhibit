import type { Envelope } from './run.js';

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function humanOutput(envelope: Envelope): string {
  if (!envelope.ok)
    return `${envelope.error.code}: ${envelope.error.message}\n${envelope.error.hint}\n${envelope.error.details ? JSON.stringify(envelope.error.details, null, 2) + '\n' : ''}`;
  const data = record(envelope.data);
  if (envelope.command === 'help') return String(data.help ?? '');
  if (envelope.command === 'version') return `Exhibit ${String(data.version)}\n`;
  if (envelope.command === 'publish') {
    return `${data.dry_run ? 'Dry run' : 'Published'} ${data.protected ? 'protected' : 'public'} exhibit\n${String(data.url)}\n${typeof data.password === 'string' ? `Password: ${data.password}\n` : ''}`;
  }
  if (envelope.command === 'remove')
    return `${data.dry_run ? 'Would remove' : data.removed ? 'Removed' : 'Already absent'}: ${String(data.slug)}\n`;
  if (envelope.command === 'list' && Array.isArray(data.artifacts)) {
    const lines = data.artifacts.map((item: unknown) => {
      const artifact = record(item);
      return `${String(artifact.slug)}  ${artifact.protected ? 'protected' : 'public'}\n  ${String(artifact.url)}${typeof artifact.password === 'string' ? `\n  Password: ${artifact.password}` : ''}`;
    });
    return `${lines.length ? lines.join('\n') : 'No Exhibit artifacts on this page.'}\n${data.next_cursor ? `Next cursor: ${String(data.next_cursor)}\n` : ''}`;
  }
  if (envelope.command === 'doctor' && Array.isArray(data.checks)) {
    return (
      data.checks
        .map((item: unknown) => {
          const check = record(item);
          return `${String(check.status).toUpperCase()} ${String(check.name)}: ${String(check.message)}`;
        })
        .join('\n') + '\n'
    );
  }
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function diagnostics(envelope: Envelope): string {
  if (!envelope.ok) return '';
  const data = record(envelope.data);
  if (!Array.isArray(data.warnings)) return '';
  return data.warnings
    .map((item: unknown) => {
      const warning = record(item);
      return `${String(warning.code)}: ${String(warning.message)}\n`;
    })
    .join('');
}
