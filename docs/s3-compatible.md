# S3-compatible storage

The transport supports a custom API `endpoint`, `region`, and `forcePathStyle`.
That avoids an artificial provider-plugin system while allowing many S3-like
services to use the same adapter.

```json
{
  "storage": {
    "provider": "s3",
    "bucket": "artifacts",
    "region": "auto",
    "prefix": "exhibit/",
    "endpoint": "https://your-s3-api.example.com",
    "forcePathStyle": false
  },
  "publicBaseUrl": "https://share.example.com"
}
```

These are placeholders, not provider-specific credentials or guaranteed settings.
Use the region/addressing rules required by your actual service. Loopback HTTP is
allowed for local development; non-loopback endpoints must use HTTPS.

## Compatibility is a contract, not a logo list

A backend must support PutObject, HeadObject, ListObjectsV2 pagination, DeleteObject,
user metadata, inline HTML headers, and the following conditional semantics:

- creating with `If-None-Match: *` rejects an existing key;
- overwriting with `If-Match` rejects a stale ETag;
- deleting with `If-Match` rejects a stale ETag.

It must expose an ETag in successful responses. The credential mechanism must work
with the AWS SDK's SigV4/client setup. Exhibit intentionally refuses to drop a
condition and retry. Some S3-compatible services do not implement every operation
or condition even though basic uploads work.

Run `doctor --probe` against the **specific service/version** before adopting it.
No live R2, MinIO, B2, or other non-AWS backend was qualified in this delivery.

## Private origin hosting is separate

Changing an API endpoint does not provision a CDN or make its bucket privately
readable by that CDN. CloudFront OAC is an AWS S3 integration, not a universal
S3-compatible authorization mechanism.

For example, a private R2 bucket served through a Worker binding requires its own
reviewed Worker/route architecture; attaching a public custom-domain bucket is a
different visibility choice. MinIO behind a reverse proxy needs a separately
configured private origin and appropriate header behavior. The v1 repo deliberately
does not ship speculative infrastructure for each service.

The invariant remains: public ciphertext URL, private storage where the hosting
architecture supports it, no cloud write credentials in the browser, correct
headers, and tested conditional mutations.
