locals {
  prefix = "${trimsuffix(var.prefix, "/")}/"
  csp = join("; ", [
    "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'",
    "img-src data:", "font-src data:", "media-src data: blob:",
    "frame-src 'self' blob:", "connect-src 'none'", "object-src 'none'",
    "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"
  ])
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = var.bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "artifacts" {
  name                              = "${substr(var.bucket_name, 0, 48)}-${substr(sha1(var.bucket_name), 0, 8)}-oac"
  description                       = "Signed reads from this distribution to private S3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_cache_policy" "artifacts" {
  name        = "${var.bucket_name}-no-cache"
  comment     = "Artifact replacement/removal prioritizes freshness over edge caching"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0
  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = false
    enable_accept_encoding_gzip   = false
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "artifacts" {
  name = "${var.bucket_name}-security"
  security_headers_config {
    content_security_policy {
      content_security_policy = local.csp
      override                = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = false
      override                   = true
    }
  }
  custom_headers_config {
    items {
      header   = "X-Robots-Tag"
      value    = "noindex, nofollow"
      override = true
    }
    items {
      header   = "Cache-Control"
      value    = "no-store, max-age=0"
      override = true
    }
  }
}

resource "aws_cloudfront_distribution" "artifacts" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Exhibit encrypted artifact distribution"
  price_class     = var.price_class
  aliases         = var.domain_name == null ? [] : [var.domain_name]

  origin {
    domain_name              = aws_s3_bucket.artifacts.bucket_regional_domain_name
    origin_id                = "private-s3"
    origin_path              = "/${trimsuffix(local.prefix, "/")}"
    origin_access_control_id = aws_cloudfront_origin_access_control.artifacts.id
  }

  default_cache_behavior {
    target_origin_id           = "private-s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.artifacts.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.artifacts.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.domain_name == null
    acm_certificate_arn            = var.acm_certificate_arn
    ssl_support_method             = var.domain_name == null ? null : "sni-only"
    minimum_protocol_version       = var.domain_name == null ? "TLSv1" : "TLSv1.2_2021"
  }

  lifecycle {
    precondition {
      condition     = (var.domain_name == null) == (var.acm_certificate_arn == null)
      error_message = "Set both domain_name and acm_certificate_arn, or neither. The certificate must be in us-east-1."
    }
    precondition {
      condition     = var.route53_zone_id == null || var.domain_name != null
      error_message = "route53_zone_id requires domain_name."
    }
  }
}

data "aws_iam_policy_document" "bucket" {
  statement {
    sid       = "AllowOnlyThisCloudFrontDistribution"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/${local.prefix}*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.artifacts.arn]
    }
  }
  statement {
    sid       = "DenyNonTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket     = aws_s3_bucket.artifacts.id
  policy     = data.aws_iam_policy_document.bucket.json
  depends_on = [aws_s3_bucket_public_access_block.artifacts]
}

# Attach the output policy to an existing IAM role/user after reviewing it.
# No access keys, IAM users, or broad account permissions are created here.
data "aws_iam_policy_document" "publisher" {
  statement {
    sid       = "ListExhibitPrefix"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.artifacts.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = [local.prefix, "${local.prefix}*"]
    }
  }
  statement {
    sid       = "ManageExhibitObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/${local.prefix}*"]
  }
}

resource "aws_route53_record" "artifacts" {
  count   = var.route53_zone_id != null && var.domain_name != null ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.artifacts.domain_name
    zone_id                = aws_cloudfront_distribution.artifacts.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "artifacts_ipv6" {
  count   = var.route53_zone_id != null && var.domain_name != null ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "AAAA"
  alias {
    name                   = aws_cloudfront_distribution.artifacts.domain_name
    zone_id                = aws_cloudfront_distribution.artifacts.hosted_zone_id
    evaluate_target_health = false
  }
}
