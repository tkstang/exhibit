# Private S3 + CloudFront reference deployment

This example creates a **new** private bucket and public HTTPS CloudFront viewer
endpoint. It does not deploy an Exhibit application server: artifacts are static
files whose passwords decrypt locally in the browser.

> Review and validate before applying. The initial source-delivery environment did
> not have Terraform/provider downloads or AWS access. No apply or real AWS smoke
> test was run. See the repository's `VERIFICATION.md`.

## Resources

Private S3 with Block Public Access, bucket-owner-enforced ownership, and
S3-managed server-side encryption; CloudFront OAC with signed private origin reads;
zero-TTL cache policy; security/CSP/inline-delivery-compatible headers; optional
custom-domain aliases using an existing certificate; least-privilege publisher
policy **output**, not an automatically granted role/user.

The example creates no IAM access keys and no passwords. `force_destroy` is false.
It does not enable S3 versioning, automatic expiry, remote Terraform state, or an
application account system. For production, choose a reviewed remote Terraform
state backend and retain its access controls.

## Plan first

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit bucket_name to a NEW globally unique bucket name.
terraform fmt
terraform init
terraform validate
terraform plan -out exhibit.tfplan
# Review the plan and obtain deployment approval before the next command.
terraform apply exhibit.tfplan
```

Provisioning incurs AWS charges. Use the intended AWS account/profile. Do not point
this new-bucket configuration at an existing production bucket; adopting existing
resources requires import and a separately reviewed plan.

## Client configuration

After an approved apply:

```bash
terraform output -json exhibit_config > exhibit-config.json
terraform output -raw publisher_policy_json > publisher-policy.json
```

The first output is non-secret Exhibit config. The second is a policy document to
review and attach to the publisher's existing identity. It grants scoped
List/Get/Put/Delete, not administrator access. It is **not** the viewer policy.

```bash
exhibit --config ./exhibit-config.json doctor --json
exhibit --config ./exhibit-config.json doctor --probe --json
exhibit --config ./exhibit-config.json publish /path/to/non-sensitive-example.md --json
```

Wait for CloudFront propagation before interpreting initial CDN failures. Open a
returned URL in a fresh browser session and verify password decryption and the
inline HTML example.

## Prefix mapping

The default prefix is `exhibit/`. CloudFront origin_path is `/exhibit`, so
`https://<distribution>/review.html` retrieves `exhibit/review.html`. The output
configuration accounts for this: do not append the prefix again. Explicit `.html`
URLs need no CloudFront Function or index-document rewrite.

The [proposed bucket layout](../../../docs/bucket-layout.md) adds repository/project
namespaces with two proposed access policies: gate only `internal/`, or gate
everything except `public/`. This Terraform example implements neither policy
and does not configure VPN or Basic Auth restrictions. All paths under its configured
prefix, including `internal/`, use the public viewer endpoint. Do not publish
unencrypted internal content until a separately reviewed access gate is in place.

## Custom domain

Set `domain_name` and an existing validated `acm_certificate_arn` together. CloudFront
requires that certificate in `us-east-1`, regardless of the bucket's region. With
an existing `route53_zone_id`, this example also creates A/AAAA aliases. Otherwise,
configure DNS with your provider. Use a dedicated artifact hostname without login
cookies or trusted app interfaces.

## Origin restrictions

The bucket policy permits this specific CloudFront distribution's service principal
to read the configured prefix, and denies non-TLS requests. The origin is the
regional S3 REST endpoint, never the website endpoint. No public Allow principal,
public ACL, or viewer AWS key is required.

## Cache and removal semantics

The reference disables caching with all TTLs zero and adds `no-store`. This favors
freshness, not offline revocation. An old downloaded encrypted artifact remains
decryptable with its original password. Existing versioned buckets need their own
noncurrent-version retention policy; current-object deletion is not historical
version deletion.

The supplied CSP restricts network resources so only self-contained documents work.
Change it only with a corresponding viewer/security review and browser tests.
Run `doctor --probe` after changes, but remember a header comparison is not a
substitute for a real browser unlock.

## Destroy

`terraform destroy` is destructive and must be separately approved. A nonempty
bucket prevents automatic removal by design. Review its objects and retention
requirements; never suggest a recursive force-delete merely to get Terraform green.
