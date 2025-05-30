# Electron Orbital Viewer CDK Deployment

This CDK application deploys the Electron Orbital Viewer React app to AWS S3 with CloudFront for content delivery.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js and npm installed (for the React app)
- Python 3.6+ installed (for the CDK app)

## Deployment Steps

1. Build the React app:
   ```
   cd ..
   npm run build
   ```

2. Deploy the CDK stack:
   ```
   cd cdk
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   cdk deploy
   ```

3. After deployment, the CloudFront URL will be displayed in the output.

## Useful CDK Commands

* `cdk ls`          list all stacks in the app
* `cdk synth`       emits the synthesized CloudFormation template
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk destroy`     destroy the deployed stack