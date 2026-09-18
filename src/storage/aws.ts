import {
  S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand,
} from '@aws-sdk/client-s3';

import type { Config } from '#core/types';
import type { S3Transport } from './transport.js';

export function createAwsTransport(config: Config): { transport: S3Transport; close(): void } {
  const client = new S3Client({
    region: config.storage.region,
    ...(config.storage.endpoint ? { endpoint: config.storage.endpoint } : {}),
    forcePathStyle: config.storage.forcePathStyle,
    maxAttempts: 3,
    // Intentionally no credentials option: AWS's normal credential chain owns it.
  });
  const requestOptions = () => ({ abortSignal: AbortSignal.timeout(30_000) });
  return {
    transport: {
      put: (input) => client.send(new PutObjectCommand(input), requestOptions()),
      head: (input) => client.send(new HeadObjectCommand(input), requestOptions()),
      list: (input) => client.send(new ListObjectsV2Command(input), requestOptions()),
      async remove(input) { await client.send(new DeleteObjectCommand(input), requestOptions()); },
    },
    close() { client.destroy(); },
  };
}
