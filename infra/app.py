#!/usr/bin/env python3
import os

import aws_cdk as cdk

from compute_stack import ComputeStack, compute_context
from infra_stack import InfraStack


app = cdk.App()
InfraStack(app, "ElectronOrbitalViewerStack",
    # If you don't specify 'env', this stack will be environment-agnostic.
    # Account/Region-dependent features and context lookups will not work,
    # but a single synthesized template can be deployed anywhere.

    # Uncomment the next line to specialize this stack for the AWS Account
    # and Region that are implied by the current CLI configuration.

    env=cdk.Environment(account=os.getenv('CDK_DEFAULT_ACCOUNT'), region=os.getenv('CDK_DEFAULT_REGION')),

    # For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html
    )

# On-demand generation (spec 2026-10-05 §10): defined only when infra/deploy.sh
# passes its four context values, so a site-only deploy needs none of them.
compute = compute_context(app.node)
if compute:
    ComputeStack(app, "ElectronOrbitalViewerComputeStack", **compute,
                 env=cdk.Environment(account=os.getenv('CDK_DEFAULT_ACCOUNT'), region=os.getenv('CDK_DEFAULT_REGION')))

app.synth()
