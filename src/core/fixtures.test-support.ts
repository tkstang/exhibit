import { createHash } from 'node:crypto';
import type { Config, PublicationReceipt, PublicationState } from './types.js';
import type { S3Transport, PutRequest, HeadResponse, ListRequest, ListResponse } from '#storage/transport';
import { createS3Store } from '#storage/s3-store';

export const config: Config = {
  schemaVersion: 1,
  storage: { provider: 's3', bucket: 'exhibit-test', region: 'us-east-1', prefix: 'exhibit/', forcePathStyle: false },
  publicBaseUrl: 'https://share.example.test', maxInputBytes: 2 * 1024 * 1024,
  brand: { name: 'Exhibit', accent: '#0f766e' },
};
export const date = '2026-09-17T12:00:00.000Z';
export function s3Error(name: string, status: number) { return { name, $metadata: { httpStatusCode: status } }; }

export class MemoryTransport implements S3Transport {
  readonly objects = new Map<string, { request: PutRequest; etag: string }>();
  readonly writes: PutRequest[] = [];
  readonly deletes: { Key: string; IfMatch: string }[] = [];
  listCalls = 0;
  async put(input: PutRequest) {
    const old = this.objects.get(input.Key);
    if ((input.IfNoneMatch === '*' && old) || (input.IfMatch && old?.etag !== input.IfMatch)) throw s3Error('PreconditionFailed', 412);
    const etag = `"${createHash('sha256').update(input.Body).digest('hex')}"`;
    this.writes.push(input);
    this.objects.set(input.Key, { request: input, etag });
    return { ETag: etag };
  }
  async head(input: { Bucket: string; Key: string }): Promise<HeadResponse> {
    const found = this.objects.get(input.Key);
    if (!found) throw s3Error('NotFound', 404);
    return { ETag: found.etag, Metadata: found.request.Metadata, ContentLength: Buffer.byteLength(found.request.Body), ContentType: found.request.ContentType, ContentDisposition: found.request.ContentDisposition };
  }
  async list(input: ListRequest): Promise<ListResponse> {
    this.listCalls += 1;
    const all = [...this.objects.keys()].filter((key) => key.startsWith(input.Prefix) && !key.slice(input.Prefix.length).includes('/')).sort();
    const start = Number(input.ContinuationToken ?? 0);
    const selected = all.slice(start, start + input.MaxKeys);
    const truncated = start + selected.length < all.length;
    return { Contents: selected.map((Key) => ({ Key })), IsTruncated: truncated, ...(truncated ? { NextContinuationToken: String(start + selected.length) } : {}) };
  }
  async remove(input: { Bucket: string; Key: string; IfMatch: string }) {
    const found = this.objects.get(input.Key);
    if (found && found.etag !== input.IfMatch) throw s3Error('PreconditionFailed', 412);
    this.deletes.push(input);
    this.objects.delete(input.Key);
  }
}
export function memory() {
  const transport = new MemoryTransport();
  const receipts = new Map<string, PublicationReceipt>();
  const state: PublicationState = {
    async read(slug, digest) { return receipts.get(`${slug}/${digest}`) ?? null; },
    async save(receipt) { receipts.set(`${receipt.slug}/${receipt.bodySha256}`, receipt); },
    async remove(slug) { for (const key of receipts.keys()) if (key.startsWith(`${slug}/`)) receipts.delete(key); },
  };
  return { transport, store: createS3Store(config, transport), state, receipts };
}
export function object(slug = 'fixture', body = '<html>fixture</html>') {
  return { slug, body, type: 'html' as const, kind: 'artifact' as const, protected: true, createdAt: date, updatedAt: date };
}
