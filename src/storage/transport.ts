/** Small S3 wire subset: a DI seam, not an alternate SDK implementation. */
export interface ObjectAddress { readonly Bucket: string; readonly Key: string; }
export interface PutRequest extends ObjectAddress {
  readonly Body: string;
  readonly ContentType: string;
  readonly ContentDisposition: string;
  readonly CacheControl: string;
  readonly Metadata: Record<string, string>;
  readonly IfMatch?: string;
  readonly IfNoneMatch?: string;
}
export interface HeadResponse {
  readonly ETag?: string;
  readonly ContentLength?: number;
  readonly ContentType?: string;
  readonly ContentDisposition?: string;
  readonly Metadata?: Record<string, string>;
}
export interface ListRequest {
  readonly Bucket: string;
  readonly Prefix: string;
  readonly Delimiter: string;
  readonly MaxKeys: number;
  readonly ContinuationToken?: string;
}
export interface ListResponse {
  readonly Contents?: readonly { readonly Key?: string }[];
  readonly IsTruncated?: boolean;
  readonly NextContinuationToken?: string;
}
export interface S3Transport {
  put(input: PutRequest): Promise<{ readonly ETag?: string }>;
  head(input: ObjectAddress): Promise<HeadResponse>;
  list(input: ListRequest): Promise<ListResponse>;
  remove(input: ObjectAddress & { readonly IfMatch: string }): Promise<void>;
}
