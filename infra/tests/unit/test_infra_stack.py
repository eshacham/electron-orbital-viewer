import aws_cdk as core
import aws_cdk.assertions as assertions

from infra_stack import InfraStack

def test_s3_bucket_created():
    app = core.App()
    stack = InfraStack(app, "electron-orbital-viewer")
    template = assertions.Template.from_stack(stack)

    template.has_resource_properties("AWS::S3::Bucket", {
        "WebsiteConfiguration": {
            "IndexDocument": "index.html",
            "ErrorDocument": "index.html"
        }
    })

def test_cloudfront_distribution_created():
    app = core.App()
    stack = InfraStack(app, "electron-orbital-viewer")
    template = assertions.Template.from_stack(stack)

    template.resource_count_is("AWS::CloudFront::Distribution", 1)