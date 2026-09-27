# AWS Terraform Reference

This directory is the private S3 + CloudFront reference deployment. It extends the root
[AGENTS.md](../../../AGENTS.md). The operator walkthrough lives in [README.md](README.md);
the check details live in
[Infrastructure checks](../../../docs/engineering/development.md#infrastructure-checks).

## Contracts

- The CSP is declared once in `main.tf` `locals` as `csp = join("; ", [ ... ])` with a literal,
  JSON-compatible list of double-quoted strings: no variables, functions, interpolation, or
  trailing comma inside the brackets. The response-headers policy uses
  `content_security_policy = local.csp`. `pnpm lint` (`tools/verification/contracts.ts`) parses
  that list and requires it to equal `CONTENT_SECURITY_POLICY` in
  [policy.ts](../../../src/security/policy.ts).
- To change the CSP, edit `src/security/policy.ts` first, then mirror the exact directive list
  here and in the single `Content-Security-Policy:` line of
  `src/skills/exhibit-setup/references/deployment.md`.
- Tests are `run` blocks in `tests/validation.tftest.hcl` against `mock_provider "aws" {}`, and
  every block uses `command = plan`. Extend that file rather than adding test files; never add
  `command = apply` or drop the mock provider.
- Files shipped in the npm package are listed in root `package.json` `files`; a new file that
  must ship needs that list updated.

## Verification

- Run `pnpm terraform:check` from the repository root. It runs `terraform fmt -check -recursive`,
  `init -backend=false -lockfile=readonly -input=false`, `validate`, and `test` in this
  directory. It may download providers but never contacts AWS or creates resources. It needs
  Terraform >= 1.7.0, < 2.0.0 (CI pins 1.15.1). Run `pnpm lint` too when the CSP changes.
- `terraform fmt` is the only formatter here; oxfmt ignores `examples/terraform/**`.
- Do not run bare `terraform init` without `-backend=false`; it can configure a backend and
  write state.

## Safety

- Never run `terraform apply` or plan against a real account, and never change IAM, DNS, or
  CDN resources, without explicit approval. The README's plan/apply steps are for operators.
- Never commit `.terraform/`, `terraform.tfstate*`, `*.tfplan`, or `terraform.tfvars`.
  `.terraform.lock.hcl` is committed and checks read it with `-lockfile=readonly`, so update it
  deliberately when provider constraints change.
