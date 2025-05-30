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