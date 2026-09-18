variable "region" {
  description = "Region for the S3 bucket. CloudFront is global."
  type        = string
  default     = "us-east-1"
}

variable "bucket_name" {
  description = "Globally unique name for a NEW Exhibit bucket. Do not point this example at an existing bucket without importing/reviewing it."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "Use 3–63 lowercase letters, numbers, and interior hyphens."
  }
}

variable "prefix" {
  description = "Exhibit object prefix; CloudFront origin_path maps its root to this prefix."
  type        = string
  default     = "exhibit/"
  validation {
    condition     = length(var.prefix) <= 128 && (var.prefix == "" || can(regex("^[a-zA-Z0-9][a-zA-Z0-9._-]*(/[a-zA-Z0-9][a-zA-Z0-9._-]*)*/?$", var.prefix)))
    error_message = "Use at most 128 characters of safe slash-separated segments, no leading slash or traversal."
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
