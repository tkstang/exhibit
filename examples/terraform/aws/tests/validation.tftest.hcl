mock_provider "aws" {}

variables {
  bucket_name = "exhibit-validation-example"
}

run "default_prefix" {
  command = plan

  assert {
    condition     = output.exhibit_config.storage.prefix == "exhibit/"
    error_message = "The default prefix must remain scoped below the bucket root."
  }
  assert {
    condition     = one(aws_cloudfront_distribution.artifacts.origin).origin_path == "/exhibit"
    error_message = "CloudFront must map its root to the configured prefix."
  }
}

run "nested_prefix_without_slash" {
  command = plan
  variables {
    prefix = "exhibits/projects"
  }
  assert {
    condition     = output.exhibit_config.storage.prefix == "exhibits/projects/"
    error_message = "Normalize a nested prefix with exactly one trailing slash."
  }
}

run "nested_prefix_with_slash" {
  command = plan
  variables {
    prefix = "exhibits/projects/"
  }
  assert {
    condition     = output.exhibit_config.storage.prefix == "exhibits/projects/"
    error_message = "Retain an already normalized prefix."
  }
}

run "empty_prefix" {
  command = plan
  variables {
    prefix = ""
  }
  expect_failures = [var.prefix]
}

run "traversal_prefix" {
  command = plan
  variables {
    prefix = "exhibit/../other"
  }
  expect_failures = [var.prefix]
}

run "wildcard_prefix" {
  command = plan
  variables {
    prefix = "exhibit/*"
  }
  expect_failures = [var.prefix]
}

run "punycode_bucket" {
  command = plan
  variables {
    bucket_name = "xn--example"
  }
  expect_failures = [var.bucket_name]
}

run "sthree_bucket" {
  command = plan
  variables {
    bucket_name = "sthree-example"
  }
  expect_failures = [var.bucket_name]
}

run "demo_bucket" {
  command = plan
  variables {
    bucket_name = "amzn-s3-demo-example"
  }
  expect_failures = [var.bucket_name]
}

run "access_point_bucket" {
  command = plan
  variables {
    bucket_name = "example-s3alias"
  }
  expect_failures = [var.bucket_name]
}

run "object_lambda_bucket" {
  command = plan
  variables {
    bucket_name = "example--ol-s3"
  }
  expect_failures = [var.bucket_name]
}

run "directory_bucket" {
  command = plan
  variables {
    bucket_name = "example--x-s3"
  }
  expect_failures = [var.bucket_name]
}

run "table_bucket" {
  command = plan
  variables {
    bucket_name = "example--table-s3"
  }
  expect_failures = [var.bucket_name]
}

run "reserved_an_suffix" {
  command = plan
  variables {
    bucket_name = "example-an"
  }
  expect_failures = [var.bucket_name]
}

run "account_regional_bucket" {
  command = plan
  variables {
    bucket_name = "example-123456789012-us-east-1-an"
  }
  expect_failures = [var.bucket_name]
}

run "multiregion_bucket" {
  command = plan
  variables {
    bucket_name = "example.mrap"
  }
  expect_failures = [var.bucket_name]
}

run "ip_address_bucket" {
  command = plan
  variables {
    bucket_name = "192.168.5.4"
  }
  expect_failures = [var.bucket_name]
}
