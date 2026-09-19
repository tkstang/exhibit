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
  if (envelope.command === 'remove') {
    const unconfirmed =
      Array.isArray(data.warnings) &&
      data.warnings.some((warning: unknown) => record(warning).code === 'W_DELETE_UNCONFIRMED');
    return `${data.dry_run ? 'Would remove' : data.removed ? 'Removed' : unconfirmed ? 'Removal unconfirmed' : 'Already absent'}: ${String(data.slug)}\n`;
  }
  if (envelope.command === 'receipts') {
    if (Array.isArray(data.receipts)) {
      const lines = data.receipts.map((item: unknown) => {
        const receipt = record(item);
        return `${String(receipt.body_sha256)}  ${String(receipt.status)}\n  Saved: ${String(receipt.saved_at)}\n  URL: ${String(receipt.url)}\n  ETag: ${receipt.etag === null ? 'none' : String(receipt.etag)}\n  Password retained: ${receipt.has_password ? 'yes' : 'no'}${typeof receipt.password === 'string' ? `\n  Password: ${receipt.password}` : ''}`;
      });
      return `Local receipts for ${String(data.slug)} (remote state not checked)\n${lines.length ? lines.join('\n') : 'No local receipts.'}\n`;
    }
    return `${data.dry_run ? 'Would forget' : data.forgotten ? 'Forgot' : 'Not forgotten'} local receipt: ${String(data.slug)}\nDigest: ${String(data.body_sha256)}\nRemote state not checked.\n`;
  }
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
  const warnings = envelope.ok ? record(envelope.data).warnings : envelope.warnings;
  if (!Array.isArray(warnings)) return '';
  return warnings
    .map((item: unknown) => {
      const warning = record(item);
      return `${String(warning.code)}: ${String(warning.message)}\n`;
    })
    .join('');
}
