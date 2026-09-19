export interface SecretFinding {
  readonly rule: string;
  readonly line: number;
}

const RULES: readonly [string, RegExp][] = [
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{15,}\b/g],
  ['api-key', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['vercel-blob-token', /\bvercel_blob_rw_[A-Za-z0-9_]{20,}\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/gi],
  [
    'assigned-secret',
    /\b(?:aws_secret_access_key|api_secret|client_secret)\s*[=:]\s*["']?[A-Za-z0-9/+_=-]{20,}/gi,
  ],
];

/** Returns rule/line only. A finding never includes the matched secret or a snippet. */
export function scanSecrets(text: string): readonly SecretFinding[] {
  const groups: SecretFinding[][] = [];
  for (const [rule, pattern] of RULES) {
    const matches: SecretFinding[] = [];
    const regex = new RegExp(pattern.source, pattern.flags);
    for (const match of text.matchAll(regex)) {
      matches.push({ rule, line: text.slice(0, match.index).split('\n').length });
      if (matches.length >= 50) break;
    }
    groups.push(matches);
  }
  // Share the bounded result budget across rules, so repeated tokens cannot hide another kind.
  const findings: SecretFinding[] = [];
  for (let index = 0; index < 50 && findings.length < 50; index += 1) {
    for (const group of groups) {
      const finding = group[index];
      if (finding) findings.push(finding);
      if (findings.length === 50) break;
    }
  }
  return findings;
}
