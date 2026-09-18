output "exhibit_config" {
  description = "Non-secret configuration; write with terraform output -json exhibit_config."
  value = {
    schemaVersion = 1
    storage = {
      provider       = "s3"
      bucket         = aws_s3_bucket.artifacts.id
      region         = var.region
      prefix         = local.prefix
      forcePathStyle = false
    }
    publicBaseUrl = "https://${var.domain_name != null ? var.domain_name : aws_cloudfront_distribution.artifacts.domain_name}"
  }
}

output "publisher_policy_json" {
  description = "Least-privilege publisher policy to attach to your existing role. Never attach it to viewers."
  value       = data.aws_iam_policy_document.publisher.json
}

output "distribution_id" {
  value = aws_cloudfront_distribution.artifacts.id
}

output "bucket_name" {
  value = aws_s3_bucket.artifacts.id
}
