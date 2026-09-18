import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

import { ExhibitError } from '#core/errors';

interface CryptoEngine {
  generateRandomSalt(): string;
  hashPassword(password: string, salt: string): Promise<string>;
}
interface Codec {
  encode(message: string, password: string, salt: string): Promise<string>;
  decode(
    message: string,
    hash: string,
    salt: string,
  ): Promise<{ success: boolean; decoded?: string }>;
}
export interface Ciphertext {
  readonly ciphertext: string;
  readonly salt: string;
}
export interface Protector {
  encrypt(html: string, password: string): Promise<Ciphertext>;
  decrypt(payload: Ciphertext, password: string): Promise<string | null>;
  browserSource(): Promise<string>;
}

/**
 * Pinned adapter to upstream's actual codec, not a cryptographic reimplementation.
 * Keep the deep imports isolated here; upstream has no typed, stable public Node API.
 */
export function createProtector(): Protector {
  const require = createRequire(import.meta.url);
  let engine: CryptoEngine;
  let codec: Codec;
  try {
    const metadata = require('staticrypt/package.json') as { version?: string };
    if (metadata.version !== '3.5.4') throw new Error('unsupported version');
    engine = require('staticrypt/lib/cryptoEngine.js') as CryptoEngine;
    const module = require('staticrypt/lib/codec.js') as { init: (engine: CryptoEngine) => Codec };
    codec = module.init(engine);
  } catch {
    throw new ExhibitError('E_DEPENDENCY', 'The pinned StatiCrypt installation is unavailable.', {
      exitCode: 2,
      hint: 'Run pnpm install. Exhibit 0.1 uses StatiCrypt 3.5.4; update its adapter and contract tests together.',
    });
  }
  return {
    async encrypt(html, password) {
      try {
        const salt = engine.generateRandomSalt();
        return { ciphertext: await codec.encode(html, password, salt), salt };
      } catch {
        throw new ExhibitError('E_ENCRYPTION', 'Encryption failed before upload.', { exitCode: 2 });
      }
    },
    async decrypt(payload, password) {
      try {
        const result = await codec.decode(
          payload.ciphertext,
          await engine.hashPassword(password, payload.salt),
          payload.salt,
        );
        return result.success ? (result.decoded ?? null) : null;
      } catch {
        return null;
      }
    },
    async browserSource() {
      const [cryptoSource, codecSource, license] = await Promise.all([
        readFile(require.resolve('staticrypt/lib/cryptoEngine.js'), 'utf8'),
        readFile(require.resolve('staticrypt/lib/codec.js'), 'utf8'),
        readFile(new URL('../../assets/staticrypt-license.txt', import.meta.url), 'utf8'),
      ]);
      if (/<\/script/i.test(cryptoSource + codecSource)) {
        throw new ExhibitError('E_ENCRYPTION', 'Unexpected upstream script content.', {
          exitCode: 2,
        });
      }
      return `/* StatiCrypt 3.5.4
${license}
*/
const exhibitEngine = (() => { const exports = {};\n${cryptoSource}\nreturn exports; })();
const exhibitCodec = (() => { const exports = {};\n${codecSource}\nreturn exports.init(exhibitEngine); })();`;
    },
  };
}
