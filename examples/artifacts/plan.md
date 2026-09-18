# Artifact publishing, without another platform

A small, portable publication primitive for humans and agents.

## Decision

Keep project state where it belongs. Publish selected Markdown and HTML snapshots to S3, then share a browser URL.

> Protected is the default. The recipient needs the URL and password, not a GitHub account or VPN.

## What ships

| Capability | Version one |
| --- | --- |
| Markdown | GFM, tables, task lists, fenced code |
| HTML | Standalone document with isolated execution |
| Storage | S3 with conditional writes |
| Agents | Stable CLI JSON and two skills |

## Publishing

```sh
exhibit publish design.md --json
xbt publish report.html --slug review-01
```

- [x] Keep the S3 bucket private.
- [x] Encrypt before uploading.
- [x] Keep passwords out of cloud metadata.
- [ ] Review the deployment plan before applying infrastructure.

## Boundaries

**Not a document editor.** No accounts, database, collaboration system, or hosted SaaS.

Separate review tooling can be added later without changing where project state lives.
