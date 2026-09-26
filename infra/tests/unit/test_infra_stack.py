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

# Generated molecule data (spec §4.2) lives in its own bucket, not in git and
# not in the app bucket: the app's BucketDeployment prunes everything that is
# not in dist/, so data stored beside the app would be deleted on every app
# deploy.

def _template():
    app = core.App()
    return assertions.Template.from_stack(InfraStack(app, "electron-orbital-viewer"))


def test_molecule_data_bucket_is_private_and_versioned():
    template = _template()
    template.has_resource_properties("AWS::S3::Bucket", {
        "VersioningConfiguration": {"Status": "Enabled"},
        "PublicAccessBlockConfiguration": {
            "BlockPublicAcls": True,
            "BlockPublicPolicy": True,
            "IgnorePublicAcls": True,
            "RestrictPublicBuckets": True,
        },
    })


def test_molecule_data_bucket_survives_stack_deletion():
    template = _template()
    buckets = template.find_resources("AWS::S3::Bucket", {
        "Properties": {"VersioningConfiguration": {"Status": "Enabled"}},
    })
    assert len(buckets) == 1
    (bucket,) = buckets.values()
    assert bucket["DeletionPolicy"] == "Retain"
    assert bucket["UpdateReplacePolicy"] == "Retain"


def test_cloudfront_serves_molecules_from_the_data_bucket():
    template = _template()
    template.has_resource_properties("AWS::CloudFront::Distribution", {
        "DistributionConfig": assertions.Match.object_like({
            "CacheBehaviors": [assertions.Match.object_like({
                "PathPattern": "molecules/*",
                "ViewerProtocolPolicy": "redirect-to-https",
            })],
        }),
    })
    # Read through CloudFront only: an Origin Access Control, never a public bucket.
    template.resource_count_is("AWS::CloudFront::OriginAccessControl", 1)


def test_data_bucket_name_is_an_output_for_the_publish_script():
    template = _template()
    template.has_output("MoleculeDataBucketName", {})
