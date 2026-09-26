from aws_cdk import (
    Stack,
    RemovalPolicy,
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_iam as iam,
    CfnOutput
)
from constructs import Construct
import os

class InfraStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Create an S3 bucket to host the website
        website_bucket = s3.Bucket(
            self, "ElectronOrbitalViewerBucket",
            website_index_document="index.html",
            website_error_document="index.html",
            public_read_access=True,
            block_public_access=s3.BlockPublicAccess.BLOCK_ACLS,
            removal_policy=RemovalPolicy.DESTROY,  # NOT recommended for production
            auto_delete_objects=True,  # NOT recommended for production
        )
        
        # Grant public read access to the bucket
        website_bucket.add_to_resource_policy(
            iam.PolicyStatement(
                actions=["s3:GetObject"],
                resources=[website_bucket.arn_for_objects("*")],
                principals=[iam.AnyPrincipal()]
            )
        )
        
        # CloudFront distribution for the website
        distribution = cloudfront.Distribution(
            self, "ElectronOrbitalViewerDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin(website_bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
            ),
            default_root_object="index.html",
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                )
            ]
        )
        
        # Generated molecule data (spec 4.2): density grids, orbital bases and
        # scans produced offline by tools/molecules/. It lives in its own
        # bucket rather than in git -- a regenerated data set would otherwise
        # add tens of MB to the public repo's history for good -- and rather
        # than in the app bucket, whose deployment below prunes everything
        # that is not in dist/.
        #
        # Private and versioned, read only through CloudFront (Origin Access
        # Control). Each data release goes under its own prefix
        # (molecules/v1/, v2/ ...) so a published link never changes meaning;
        # tools/molecules/publish.py uploads it. Retained on stack deletion:
        # regenerating it takes hours of quantum-chemistry compute.
        data_bucket = s3.Bucket(
            self, "MoleculeDataBucket",
            versioned=True,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
            removal_policy=RemovalPolicy.RETAIN,
        )
        distribution.add_behavior(
            "molecules/*",
            origins.S3BucketOrigin.with_origin_access_control(data_bucket),
            viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
        )

        # Deploy the website to S3 - using the production build from Vite
        # Vite automatically minifies code in production builds
        s3deploy.BucketDeployment(
            self, "DeployElectronOrbitalViewer",
            sources=[s3deploy.Source.asset(os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist"))],
            destination_bucket=website_bucket,
            distribution=distribution,
            distribution_paths=["/*"],
        )
        
        # Output the CloudFront URL
        CfnOutput(self, "CloudFrontURL", value=f"https://{distribution.distribution_domain_name}")
        CfnOutput(self, "BucketURL", value=website_bucket.bucket_website_url)
        # tools/molecules/publish.py reads this to know where to upload.
        CfnOutput(self, "MoleculeDataBucketName", value=data_bucket.bucket_name)