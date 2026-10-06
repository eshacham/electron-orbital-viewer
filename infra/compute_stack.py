"""On-demand molecule generation in AWS (spec 2026-10-05 §10, §11).

A separate stack beside ElectronOrbitalViewerStack, which it never changes:
it imports the molecule data bucket by name (-c dataBucketName=..., which
deploy.sh reads from the site stack's MoleculeDataBucketName output), so no
CloudFormation export couples the two, and `cdk destroy` on this stack
removes every fixed cost while the site and every result stay.

Costs are deliberate: no NAT gateway (tasks get a public IP in a public
subnet; S3 and DynamoDB go through free gateway endpoints), no WAF, X-Ray,
Container Insights, flow logs or custom metrics; 30-day log retention.
"""
import json
import sys
from pathlib import Path

from aws_cdk import (CfnOutput, Duration, RemovalPolicy, Size, Stack, Tags,
                     aws_apigatewayv2 as apigw, aws_apigatewayv2_authorizers as authorizers,
                     aws_apigatewayv2_integrations as integrations, aws_batch as batch, aws_cognito as cognito,
                     aws_dynamodb as dynamodb, aws_ec2 as ec2, aws_ecr as ecr, aws_ecs as ecs, aws_events as events,
                     aws_events_targets as targets, aws_iam as iam, aws_lambda as lambda_, aws_logs as logs,
                     aws_s3 as s3, aws_sns as sns, aws_sns_subscriptions as subscriptions)
from constructs import Construct

from lambda_bundle import REPO, build_lambda_bundle

sys.path.insert(0, str(REPO / 'tools'))
from jobs.batch_runner import SPOT_INTERRUPTION, TAGS  # noqa: E402  (one source for the retry rule and tags)

AZS = ['us-east-1a', 'us-east-1b']   # not us-east-1e: it is use1-az3 in this account, which has no Fargate ARM64
DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5391']
ROUTES = [('POST', '/api/v1/jobs/preview'), ('POST', '/api/v1/jobs'), ('GET', '/api/v1/jobs'),
          ('GET', '/api/v1/jobs/{key}'), ('GET', '/api/v1/costs')]
DEFAULT_THROTTLE = {'ThrottlingRateLimit': 5, 'ThrottlingBurstLimit': 10}
SUBMIT_THROTTLE = {'ThrottlingRateLimit': 1, 'ThrottlingBurstLimit': 5}
MAX_VCPUS = 32
LOG_RETENTION = logs.RetentionDays.ONE_MONTH
WORKER_LOG_GROUP = '/electron-orbital-viewer/worker'
CONTEXT_KEYS = ('dataBucketName', 'siteOrigin', 'alertEmail', 'imageTag')


def compute_context(node) -> dict | None:
    """The four -c values infra/deploy.sh passes, as ComputeStack keywords;
    None when none is given, so a site-only `cdk deploy ElectronOrbitalViewerStack`
    needs none of them. Some but not all is a mistake, refused by name."""
    values = {k: node.try_get_context(k) for k in CONTEXT_KEYS}
    if not any(values.values()):
        return None
    missing = [k for k, v in values.items() if not v]
    if missing:
        raise ValueError(f'compute stack context missing: {", ".join(missing)} (infra/deploy.sh passes all four)')
    return {'data_bucket_name': values['dataBucketName'], 'site_origin': values['siteOrigin'].rstrip('/'),
            'alert_email': values['alertEmail'], 'image_tag': values['imageTag']}


class ComputeStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, *, data_bucket_name: str, site_origin: str,
                 alert_email: str, image_tag: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        for k, v in TAGS.items():
            Tags.of(self).add(k, v)
        origins = [site_origin, *DEV_ORIGINS]

        def log_group(cid, name=None):
            return logs.LogGroup(self, cid, log_group_name=name, retention=LOG_RETENTION,
                                 removal_policy=RemovalPolicy.DESTROY)

        # -- network: public subnets only, no NAT -------------------------------
        vpc = ec2.Vpc(self, 'Vpc', ip_addresses=ec2.IpAddresses.cidr('10.40.0.0/16'), availability_zones=AZS,
                      nat_gateways=0, restrict_default_security_group=False,
                      subnet_configuration=[ec2.SubnetConfiguration(name='public', subnet_type=ec2.SubnetType.PUBLIC,
                                                                    cidr_mask=24)],
                      gateway_endpoints={'S3': ec2.GatewayVpcEndpointOptions(service=ec2.GatewayVpcEndpointAwsService.S3),
                                         'DynamoDB': ec2.GatewayVpcEndpointOptions(
                                             service=ec2.GatewayVpcEndpointAwsService.DYNAMODB)})
        workers_sg = ec2.SecurityGroup(self, 'WorkerSecurityGroup', vpc=vpc, allow_all_outbound=True,
                                       description='Batch workers: outbound only (image pull, AWS APIs, logs)')

        # -- data ---------------------------------------------------------------
        bucket = s3.Bucket.from_bucket_name(self, 'MoleculeData', data_bucket_name)
        table = dynamodb.Table(self, 'Jobs', partition_key=dynamodb.Attribute(name='pk', type=dynamodb.AttributeType.STRING),
                               billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
                               point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                                   point_in_time_recovery_enabled=True),
                               removal_policy=RemovalPolicy.RETAIN)
        table.add_global_secondary_index(index_name='byMonth',
                                         partition_key=dynamodb.Attribute(name='month', type=dynamodb.AttributeType.STRING),
                                         sort_key=dynamodb.Attribute(name='submittedAt', type=dynamodb.AttributeType.STRING))
        repository = ecr.Repository(self, 'WorkerRepository', repository_name='electron-orbital-viewer-worker',
                                    removal_policy=RemovalPolicy.DESTROY, empty_on_delete=True,
                                    lifecycle_rules=[ecr.LifecycleRule(max_image_count=5,
                                                                       description='keep the last 5 worker images')])

        # -- alerts -------------------------------------------------------------
        topic = sns.Topic(self, 'Alerts', display_name='Orbital viewer compute alerts')
        topic.add_subscription(subscriptions.EmailSubscription(alert_email))

        # -- Batch --------------------------------------------------------------
        def environment(cid, spot):
            return batch.FargateComputeEnvironment(self, cid, vpc=vpc, spot=spot, maxv_cpus=MAX_VCPUS,
                                                   vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
                                                   security_groups=[workers_sg])
        queues = {}
        for capacity, cid, spot in (('spot', 'Spot', True), ('on-demand', 'OnDemand', False)):
            queues[capacity] = batch.JobQueue(self, f'{cid}Queue', priority=1, compute_environments=[
                batch.OrderedComputeEnvironment(compute_environment=environment(f'{cid}Environment', spot), order=1)])

        worker_role = iam.Role(self, 'WorkerRole', assumed_by=iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
                               description='The worker: its own job records, and molecules/jobs/* only')
        worker_role.add_to_policy(iam.PolicyStatement(
            actions=['dynamodb:GetItem', 'dynamodb:UpdateItem'], resources=[table.table_arn],
            conditions={'ForAllValues:StringNotLike': {'dynamodb:LeadingKeys': ['METER#*', 'CONFIG', 'RESOLVE#*',
                                                                                 'BILLING#*']}}))
        # Delete lets a retry clear a partial root a reclaimed attempt left
        # (S3Sink.clear_partial); the bucket is versioned, so it only adds a marker.
        worker_role.add_to_policy(iam.PolicyStatement(actions=['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
                                                      resources=[bucket.arn_for_objects('molecules/jobs/*')]))
        worker_logs = log_group('WorkerLogs', WORKER_LOG_GROUP)
        job_definition = batch.EcsJobDefinition(
            self, 'WorkerJob', propagate_tags=True, parameters={'key': 'none'}, timeout=Duration.minutes(10), retry_attempts=3,
            retry_strategies=[
                batch.RetryStrategy.of(batch.Action.RETRY, batch.Reason.custom(on_status_reason=SPOT_INTERRUPTION)),
                batch.RetryStrategy.of(batch.Action.EXIT, batch.Reason.custom(on_status_reason='*')),
                batch.RetryStrategy.of(batch.Action.EXIT, batch.Reason.custom(on_reason='*')),
                batch.RetryStrategy.of(batch.Action.EXIT, batch.Reason.custom(on_exit_code='*'))],
            container=batch.EcsFargateContainerDefinition(
                self, 'WorkerContainer', image=ecs.ContainerImage.from_ecr_repository(repository, image_tag),
                cpu=2, memory=Size.gibibytes(8), assign_public_ip=True,
                fargate_cpu_architecture=ecs.CpuArchitecture.ARM64,
                fargate_operating_system_family=ecs.OperatingSystemFamily.LINUX,
                fargate_platform_version=ecs.FargatePlatformVersion.LATEST,
                job_role=worker_role, command=['run', 'Ref::key', '--aws'],
                environment={'JOBS_TABLE': table.table_name, 'DATA_BUCKET': data_bucket_name,
                             'AWS_DEFAULT_REGION': self.region},
                logging=ecs.LogDriver.aws_logs(stream_prefix='worker', log_group=worker_logs)))

        # -- Lambdas ------------------------------------------------------------
        code = lambda_.Code.from_asset(str(build_lambda_bundle()))

        def function(cid, handler, role, timeout, env):
            return lambda_.Function(self, cid, runtime=lambda_.Runtime.PYTHON_3_12,
                                    architecture=lambda_.Architecture.ARM_64, handler=handler, code=code,
                                    memory_size=256, timeout=Duration.seconds(timeout), role=role,
                                    environment={'JOBS_TABLE': table.table_name, **env},
                                    log_group=log_group(f'{cid}Logs'))

        def lambda_role(cid, description):
            role = iam.Role(self, cid, assumed_by=iam.ServicePrincipal('lambda.amazonaws.com'), description=description)
            role.add_managed_policy(iam.ManagedPolicy.from_aws_managed_policy_name(
                'service-role/AWSLambdaBasicExecutionRole'))
            return role

        api_role = lambda_role('ApiRole', 'api Lambda: job table, SubmitJob to the two queues')
        table.grant_read_write_data(api_role)
        api_role.add_to_policy(iam.PolicyStatement(
            actions=['batch:SubmitJob'],
            resources=[queues['spot'].job_queue_arn, queues['on-demand'].job_queue_arn,
                       self.format_arn(service='batch', resource='job-definition',
                                       resource_name=f'{job_definition.job_definition_name}:*')]))
        api_role.add_to_policy(iam.PolicyStatement(
            actions=['batch:TagResource'], resources=[self.format_arn(service='batch', resource='job', resource_name='*')]))
        api_fn = function('ApiFunction', 'jobs.lambdas.api_handler', api_role, 29, {
            'SPOT_QUEUE': queues['spot'].job_queue_arn, 'ON_DEMAND_QUEUE': queues['on-demand'].job_queue_arn,
            'JOB_DEFINITION': job_definition.job_definition_arn})

        reconcile_role = lambda_role('ReconcileRole', 'reconcile Lambda: job table, Batch/ECS reads, alerts')
        table.grant_read_write_data(reconcile_role)
        # DescribeJobs takes no resource-level permission; DescribeTasks does.
        reconcile_role.add_to_policy(iam.PolicyStatement(actions=['batch:DescribeJobs'], resources=['*']))
        reconcile_role.add_to_policy(iam.PolicyStatement(
            actions=['ecs:DescribeTasks'],
            resources=[Stack.of(self).format_arn(service='ecs', resource='task', resource_name='*')]))
        reconcile_role.add_to_policy(iam.PolicyStatement(
            actions=['batch:TerminateJob'], resources=[self.format_arn(service='batch', resource='job', resource_name='*')]))
        topic.grant_publish(reconcile_role)
        reconcile_fn = function('ReconcileFunction', 'jobs.lambdas.reconcile_handler', reconcile_role, 120,
                                {'ALERT_TOPIC_ARN': topic.topic_arn})

        billing_role = lambda_role('BillingRole', 'billing Lambda: Cost Explorer read, one table write')
        billing_role.add_to_policy(iam.PolicyStatement(actions=['ce:GetCostAndUsage'], resources=['*']))
        billing_role.add_to_policy(iam.PolicyStatement(actions=['dynamodb:PutItem', 'dynamodb:GetItem'],
                                                       resources=[table.table_arn]))
        billing_fn = function('BillingFunction', 'jobs.lambdas.billing_handler', billing_role, 30, {})

        queue_arns = [queues['spot'].job_queue_arn, queues['on-demand'].job_queue_arn]
        events.Rule(self, 'BatchStateChanges', description='Every state change of our Batch jobs → reconcile',
                    event_pattern=events.EventPattern(source=['aws.batch'], detail_type=['Batch Job State Change'],
                                                      detail={'jobQueue': queue_arns}),
                    targets=[targets.LambdaFunction(reconcile_fn)])
        events.Rule(self, 'ReconcileSweep', schedule=events.Schedule.rate(Duration.minutes(15)),
                    targets=[targets.LambdaFunction(reconcile_fn)])
        events.Rule(self, 'DailyBilling', schedule=events.Schedule.cron(minute='0', hour='6'),
                    targets=[targets.LambdaFunction(billing_fn)])

        # -- Cognito --------------------------------------------------------------
        pool = cognito.UserPool(
            self, 'Owners', self_sign_up_enabled=False, sign_in_aliases=cognito.SignInAliases(email=True),
            mfa=cognito.Mfa.REQUIRED, mfa_second_factor=cognito.MfaSecondFactor(otp=True, sms=False),
            password_policy=cognito.PasswordPolicy(min_length=14, require_lowercase=True, require_uppercase=True,
                                                   require_digits=True, require_symbols=True,
                                                   temp_password_validity=Duration.days(3)),
            account_recovery=cognito.AccountRecovery.EMAIL_ONLY, feature_plan=cognito.FeaturePlan.ESSENTIALS,
            removal_policy=RemovalPolicy.DESTROY)
        redirects = [f'{o}{p}' for o in origins for p in ('/', '/admin.html')]
        client = pool.add_client(
            'WebClient', generate_secret=False, auth_flows=cognito.AuthFlow(user_srp=True),
            o_auth=cognito.OAuthSettings(flows=cognito.OAuthFlows(authorization_code_grant=True),
                                         scopes=[cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL,
                                                 cognito.OAuthScope.PROFILE],
                                         callback_urls=redirects, logout_urls=redirects),
            supported_identity_providers=[cognito.UserPoolClientIdentityProvider.COGNITO],
            access_token_validity=Duration.minutes(60), id_token_validity=Duration.minutes(60),
            refresh_token_validity=Duration.hours(12), prevent_user_existence_errors=True,
            enable_token_revocation=True)
        domain = pool.add_domain('Login', cognito_domain=cognito.CognitoDomainOptions(
            domain_prefix=f'orbital-viewer-{self.account}'),
            managed_login_version=cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN)
        cognito.CfnManagedLoginBranding(self, 'LoginBranding', user_pool_id=pool.user_pool_id,
                                        client_id=client.user_pool_client_id, use_cognito_provided_values=True)

        # -- HTTP API -------------------------------------------------------------
        api = apigw.HttpApi(self, 'JobsApi', api_name='electron-orbital-viewer-jobs', create_default_stage=True,
                            cors_preflight=apigw.CorsPreflightOptions(
                                allow_origins=origins, allow_headers=['authorization', 'content-type'],
                                allow_methods=[apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST,
                                               apigw.CorsHttpMethod.OPTIONS],
                                max_age=Duration.hours(1)))
        # CloudFormation's ProviderURL has no scheme; a JWT issuer must match the token's `iss` exactly.
        issuer = f'https://cognito-idp.{self.region}.amazonaws.com/{pool.user_pool_id}'
        jwt = authorizers.HttpJwtAuthorizer('CognitoJwt', jwt_issuer=issuer,
                                            jwt_audience=[client.user_pool_client_id])
        integration = integrations.HttpLambdaIntegration('ApiIntegration', api_fn)
        stage = api.default_stage.node.default_child
        for method, path in ROUTES:
            for route in api.add_routes(path=path, methods=[apigw.HttpMethod(method)], integration=integration,
                                        authorizer=jwt):
                stage.node.add_dependency(route)         # route settings name routes that must exist first
        access_logs = log_group('ApiAccessLogs')
        stage.default_route_settings = apigw.CfnStage.RouteSettingsProperty(
            throttling_rate_limit=DEFAULT_THROTTLE['ThrottlingRateLimit'],
            throttling_burst_limit=DEFAULT_THROTTLE['ThrottlingBurstLimit'])
        stage.route_settings = {'POST /api/v1/jobs': SUBMIT_THROTTLE}
        stage.access_log_settings = apigw.CfnStage.AccessLogSettingsProperty(
            destination_arn=access_logs.log_group_arn,
            format=json.dumps({'requestId': '$context.requestId', 'ip': '$context.identity.sourceIp',
                               'time': '$context.requestTime', 'route': '$context.routeKey',
                               'status': '$context.status', 'latencyMs': '$context.responseLatency',
                               'authError': '$context.authorizer.error', 'error': '$context.error.message'}))

        # -- outputs (deploy.sh and jobs.sh read these) ------------------------------
        for name, value in (('JobsApiUrl', api.api_endpoint), ('UserPoolId', pool.user_pool_id),
                            ('UserPoolClientId', client.user_pool_client_id),
                            ('CognitoAuthority', issuer),
                            ('CognitoDomain', domain.base_url()), ('JobsTableName', table.table_name),
                            ('WorkerRepositoryUri', repository.repository_uri),
                            ('ApiFunctionName', api_fn.function_name), ('ApiRoleName', api_role.role_name),
                            ('WorkerLogGroup', worker_logs.log_group_name)):
            CfnOutput(self, name, value=value)
