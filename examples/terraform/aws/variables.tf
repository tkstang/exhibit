variable "region" {
  description = "Region for the S3 bucket. CloudFront is global."
  type        = string
  default     = "us-east-1"
}

variable "bucket_name" {
  description = "Globally unique name for a NEW Exhibit bucket. Do not point this example at an existing bucket without importing/reviewing it."
  type        = string
  nullable    = false
  validation {
    # Deliberately exclude dots, which also excludes IPv4 names and .mrap aliases.
    # AWS reserves every -an suffix for account regional buckets, not this global namespace.
    # https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html
    condition = (
      can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.bucket_name)) &&
      !can(regex("^(xn--|sthree-|amzn-s3-demo-)", var.bucket_name)) &&
      !can(regex("(-s3alias|--ol-s3|--x-s3|--table-s3|-an)$", var.bucket_name))
    )
    error_message = "Use 3-63 lowercase letters, numbers, and interior hyphens, without AWS reserved prefixes or suffixes. This example uses the shared global namespace."
  }
}

variable "prefix" {
  description = "Nonempty Exhibit object prefix; CloudFront origin_path maps its root to this prefix."
  type        = string
  default     = "exhibit/"
  nullable    = false
  validation {
    condition     = length(var.prefix) <= 128 && can(regex("^[a-zA-Z0-9][a-zA-Z0-9._-]*(/[a-zA-Z0-9][a-zA-Z0-9._-]*)*/?$", var.prefix))
    error_message = "Use a nonempty prefix of at most 128 characters of safe slash-separated segments, no leading slash or traversal."
  }
}

variable "domain_name" {
  description = "Optional dedicated artifact hostname. Pair with an existing us-east-1 ACM certificate."
  type        = string
  default     = null
  nullable    = true
}

variable "acm_certificate_arn" {
  description = "Optional existing, validated ACM certificate ARN in us-east-1. Never use an app/auth hostname for artifacts."
  type        = string
  default     = null
  nullable    = true
}

variable "route53_zone_id" {
  description = "Optional existing Route53 hosted zone for the custom hostname. If null, create DNS with your provider manually."
  type        = string
  default     = null
  nullable    = true
}

variable "price_class" {
  type        = string
  default     = "PriceClass_100"
  description = "CloudFront geographic price class."
}
