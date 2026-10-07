"""CDK assertions for the compute stack: each property spec 2026-10-05 §4,
§10 and §11 names, so a refactor cannot quietly add a NAT gateway, drop
MFA or widen the worker's S3 access."""
import json
from pathlib import Path

import aws_cdk as cdk
import pytest
from aws_cdk.assertions import Match, Template

from compute_stack import AZS, ComputeStack, compute_context
from lambda_bundle import BUNDLE

ACCOUNT, REGION = '123456789012', 'us-east-1'
SITE = 'https://d3rhfcclqjt4tf.cloudfront.net'
ORIGINS = [SITE, 'http://localhost:5173', 'http://localhost:5391']
CONTEXT = {f'availability-zones:account={ACCOUNT}:region={REGION}': [f'us-east-1{c}' for c in 'abcdef']}


@pytest.fixture(scope='module')
def template():
    app = cdk.App(context=CONTEXT)
    stack = ComputeStack(app, 'ElectronOrbitalViewerComputeStack', data_bucket_name='data-bucket', site_origin=SITE,
                         alert_email='owner@example.com', image_tag='abc123',
                         env=cdk.Environment(account=ACCOUNT, region=REGION))
    return Template.from_stack(stack)


def resources(template, type_):
    return list(template.find_resources(type_).values())


def props(template, type_):
    return [r['Properties'] for r in resources(template, type_)]


def test_network_has_no_nat_and_only_public_subnets(template):
    template.resource_count_is('AWS::EC2::NatGateway', 0)
    template.resource_count_is('AWS::EC2::Subnet', 2)
    for subnet in props(template, 'AWS::EC2::Subnet'):
        assert subnet['MapPublicIpOnLaunch'] is True and subnet['AvailabilityZone'] in AZS
    assert 'us-east-1e' not in AZS                               # use1-az3 has no Fargate ARM64
    endpoints = props(template, 'AWS::EC2::VPCEndpoint')
    assert len(endpoints) == 2 and {e['VpcEndpointType'] for e in endpoints} == {'Gateway'}
    services = json.dumps([e['ServiceName'] for e in endpoints])
    assert '.s3' in services and '.dynamodb' in services


def test_worker_security_group_has_no_inbound_rules(template):
    (sg,) = props(template, 'AWS::EC2::SecurityGroup')
    assert 'SecurityGroupIngress' not in sg
    template.resource_count_is('AWS::EC2::SecurityGroupIngress', 0)


def test_two_fargate_environments_of_32_vcpus_and_a_queue_each(template):
    envs = props(template, 'AWS::Batch::ComputeEnvironment')
    assert sorted(e['ComputeResources']['Type'] for e in envs) == ['FARGATE', 'FARGATE_SPOT']
    assert {e['ComputeResources']['MaxvCpus'] for e in envs} == {32}
    template.resource_count_is('AWS::Batch::JobQueue', 2)


def test_job_definition(template):
    (jd,) = props(template, 'AWS::Batch::JobDefinition')
    c = jd['ContainerProperties']
    assert jd['PlatformCapabilities'] == ['FARGATE'] and jd['PropagateTags'] is True
    assert c['RuntimePlatform'] == {'CpuArchitecture': 'ARM64', 'OperatingSystemFamily': 'LINUX'}
    assert c['NetworkConfiguration'] == {'AssignPublicIp': 'ENABLED'}
    rules = jd['RetryStrategy']['EvaluateOnExit']
    assert jd['RetryStrategy']['Attempts'] == 3
    assert rules[0] == {'Action': 'RETRY', 'OnStatusReason': 'Your Spot Task was interrupted*'}
    assert all(r['Action'] == 'EXIT' for r in rules[1:])
    assert c['Command'] == ['run', 'Ref::key', '--aws']
    env = {e['Name']: e['Value'] for e in c['Environment']}
    assert env['DATA_BUCKET'] == 'data-bucket' and 'JOBS_TABLE' in env
    assert json.dumps(c['Image']).endswith(':abc123"]]}')


def test_table_is_on_demand_with_the_month_index_and_pitr(template):
    (table,) = props(template, 'AWS::DynamoDB::Table')
    assert table['BillingMode'] == 'PAY_PER_REQUEST'
    assert table['KeySchema'] == [{'AttributeName': 'pk', 'KeyType': 'HASH'}]
    assert table['PointInTimeRecoverySpecification'] == {'PointInTimeRecoveryEnabled': True}
    (gsi,) = table['GlobalSecondaryIndexes']
    assert gsi['IndexName'] == 'byMonth' and gsi['KeySchema'] == [
        {'AttributeName': 'month', 'KeyType': 'HASH'}, {'AttributeName': 'submittedAt', 'KeyType': 'RANGE'}]


def test_worker_role_writes_only_molecules_jobs(template):
    roles = template.find_resources('AWS::IAM::Role', {'Properties': {'Description': Match.string_like_regexp('worker')}})
    (role_id,) = roles
    policies = [p['Properties']['PolicyDocument']['Statement'] for p in resources(template, 'AWS::IAM::Policy')
                if {'Ref': role_id} in p['Properties']['Roles']]
    statements = [s for doc in policies for s in doc]
    s3 = [s for s in statements if any(a.startswith('s3:') for a in (s['Action'] if isinstance(s['Action'], list) else [s['Action']]))]
    assert len(s3) == 1
    # Delete clears a partial root a reclaimed attempt left (preflight D7); the
    # bucket is versioned, so a delete only adds a marker and loses nothing.
    assert sorted(s3[0]['Action']) == ['s3:DeleteObject', 's3:GetObject', 's3:PutObject']
    assert json.dumps(s3[0]['Resource']).endswith('/molecules/jobs/*"]]}')
    # No ListBucket (Ruling D8-IAM): a GetObject carries no s3:prefix, so a
    # prefix-scoped grant could not turn a missing key's 403 into a 404, and
    # S3Sink already reads 403 as missing. Least privilege wins.
    assert not any('s3:ListBucket' in (s['Action'] if isinstance(s['Action'], list) else [s['Action']])
                   for p in resources(template, 'AWS::IAM::Policy')
                   for s in p['Properties']['PolicyDocument']['Statement'])
    ddb = [s for s in statements if 'dynamodb:UpdateItem' in s['Action']]
    assert ddb[0]['Condition']['ForAllValues:StringNotLike']['dynamodb:LeadingKeys'] == \
        ['METER#*', 'CONFIG', 'RESOLVE#*', 'BILLING#*']
    assert not any('*' == a or a.endswith(':*') for s in statements for a in
                   (s['Action'] if isinstance(s['Action'], list) else [s['Action']]))


def test_api_throttles_cors_and_access_logs(template):
    (stage,) = props(template, 'AWS::ApiGatewayV2::Stage')
    assert stage['StageName'] == '$default' and stage['AutoDeploy'] is True
    assert stage['DefaultRouteSettings'] == {'ThrottlingRateLimit': 5, 'ThrottlingBurstLimit': 10}
    assert stage['RouteSettings'] == {'POST /api/v1/jobs': {'ThrottlingRateLimit': 1, 'ThrottlingBurstLimit': 5}}
    assert 'DestinationArn' in stage['AccessLogSettings']
    (api,) = props(template, 'AWS::ApiGatewayV2::Api')
    cors = api['CorsConfiguration']
    assert cors['AllowOrigins'] == ORIGINS
    assert set(cors['AllowHeaders']) == {'authorization', 'content-type'}
    assert set(cors['AllowMethods']) == {'GET', 'POST', 'OPTIONS'} and 'AllowCredentials' not in cors


def test_every_route_needs_a_token_for_this_client_only(template):
    routes = props(template, 'AWS::ApiGatewayV2::Route')
    assert sorted(r['RouteKey'] for r in routes) == sorted(
        ['POST /api/v1/jobs/preview', 'POST /api/v1/jobs', 'GET /api/v1/jobs', 'GET /api/v1/jobs/{key}', 'GET /api/v1/costs'])
    assert {r['AuthorizationType'] for r in routes} == {'JWT'}
    (auth,) = props(template, 'AWS::ApiGatewayV2::Authorizer')
    (client_id,) = template.find_resources('AWS::Cognito::UserPoolClient')
    # A token minted for any other app client carries another client_id and is refused.
    assert auth['JwtConfiguration']['Audience'] == [{'Ref': client_id}]
    issuer = json.dumps(auth['JwtConfiguration']['Issuer'])
    assert 'https://cognito-idp.' in issuer and '.amazonaws.com/' in issuer


def test_cognito_owner_only_with_totp(template):
    (pool,) = props(template, 'AWS::Cognito::UserPool')
    assert pool['AdminCreateUserConfig']['AllowAdminCreateUserOnly'] is True
    assert pool['MfaConfiguration'] == 'ON' and pool['EnabledMfas'] == ['SOFTWARE_TOKEN_MFA']
    policy = pool['Policies']['PasswordPolicy']
    assert policy['MinimumLength'] >= 14 and all(policy[k] for k in
                                                 ('RequireLowercase', 'RequireUppercase', 'RequireNumbers', 'RequireSymbols'))
    (client,) = props(template, 'AWS::Cognito::UserPoolClient')
    assert client['GenerateSecret'] is False and client['AllowedOAuthFlows'] == ['code']
    assert (client['AccessTokenValidity'], client['RefreshTokenValidity']) == (60, 720)
    assert client['TokenValidityUnits'] == {'AccessToken': 'minutes', 'IdToken': 'minutes', 'RefreshToken': 'minutes'}
    expected = [f'{o}{p}' for o in ORIGINS for p in ('/', '/admin.html')]
    assert client['CallbackURLs'] == expected and client['LogoutURLs'] == expected
    assert {'openid', 'email'} <= set(client['AllowedOAuthScopes'])    # what the 6B-2 client asks for
    assert client['EnableTokenRevocation'] is True                    # sign-out revokes the refresh token
    # Rotation stays off: 6B-2's single-refresh guard assumes the refresh token
    # it holds stays valid after a refresh (preflight D12).
    assert 'RefreshTokenRotation' not in client
    (domain,) = props(template, 'AWS::Cognito::UserPoolDomain')
    assert domain['ManagedLoginVersion'] == 2 and domain['Domain'] == f'orbital-viewer-{ACCOUNT}'
    template.resource_count_is('AWS::Cognito::ManagedLoginBranding', 1)


def test_lambdas_and_their_bundle(template):
    fns = props(template, 'AWS::Lambda::Function')
    assert sorted(f['Handler'] for f in fns) == ['jobs.lambdas.api_handler', 'jobs.lambdas.billing_handler',
                                                 'jobs.lambdas.reconcile_handler']
    assert {f['Runtime'] for f in fns} == {'python3.12'} and {tuple(f['Architectures']) for f in fns} == {('arm64',)}
    assert all('TracingConfig' not in f for f in fns)            # no X-Ray
    names = {p.relative_to(BUNDLE).as_posix() for p in BUNDLE.rglob('*') if p.is_file()}
    assert 'jobs/handlers.py' in names and 'jobs/basis_counts.json' in names and 'rfc8785/__init__.py' in names
    assert not any(n.startswith('jobs/tests/') for n in names)


def test_every_log_group_keeps_30_days_and_every_lambda_uses_one(template):
    groups = template.find_resources('AWS::Logs::LogGroup')
    assert len(groups) == 5 and {g['Properties']['RetentionInDays'] for g in groups.values()} == {30}
    for f in props(template, 'AWS::Lambda::Function'):
        assert f['LoggingConfig']['LogGroup']['Ref'] in groups


def test_everything_taggable_carries_both_tags(template):
    untagged = []
    for logical_id, r in template.to_json()['Resources'].items():
        p = r.get('Properties', {})
        tags = p.get('Tags', p.get('UserPoolTags'))
        if tags is None:
            continue
        pairs = {t['Key']: t['Value'] for t in tags} if isinstance(tags, list) else tags
        if pairs.get('app') != 'electron-orbital-viewer' or pairs.get('component') != 'compute':
            untagged.append(logical_id)
    assert untagged == []
    for type_ in ('AWS::Batch::JobDefinition', 'AWS::Lambda::Function', 'AWS::DynamoDB::Table', 'AWS::ECR::Repository',
                  'AWS::ApiGatewayV2::Api', 'AWS::SNS::Topic'):
        assert all('Tags' in p for p in props(template, type_)), type_


def test_ecr_keeps_the_last_five_images(template):
    (repo,) = props(template, 'AWS::ECR::Repository')
    policy = json.loads(repo['LifecyclePolicy']['LifecyclePolicyText'])
    assert policy['rules'][0]['selection']['countNumber'] == 5
    # CloudFormation empties it itself (no custom resource), so a plain
    # `cdk destroy` does not end in DELETE_FAILED on a non-empty repository.
    assert repo['EmptyOnDelete'] is True


def test_reconcile_describes_only_ecs_tasks(template):
    statements = [s for p in props(template, 'AWS::IAM::Policy') for s in p['PolicyDocument']['Statement']]
    (describe,) = [s for s in statements if s['Action'] == 'ecs:DescribeTasks']
    assert describe['Resource'] == {'Fn::Join': ['', ['arn:', {'Ref': 'AWS::Partition'},
                                                      f':ecs:{REGION}:{ACCOUNT}:task/*']]}


def test_outputs_for_deploy_and_jobs_scripts(template):
    for name in ('JobsApiUrl', 'UserPoolId', 'UserPoolClientId', 'CognitoAuthority', 'CognitoDomain', 'JobsTableName',
                 'WorkerRepositoryUri', 'ApiFunctionName', 'ApiRoleName', 'WorkerLogGroup'):
        template.has_output(name, {})


def test_context_is_all_or_nothing():
    assert compute_context(cdk.App().node) is None
    full = {'dataBucketName': 'b', 'siteOrigin': SITE + '/', 'alertEmail': 'o@example.com', 'imageTag': 't'}
    assert compute_context(cdk.App(context=full).node) == {'data_bucket_name': 'b', 'site_origin': SITE,
                                                           'alert_email': 'o@example.com', 'image_tag': 't'}
    with pytest.raises(ValueError, match='alertEmail, imageTag'):
        compute_context(cdk.App(context={'dataBucketName': 'b', 'siteOrigin': SITE}).node)


def test_reconcile_hears_batch_and_sweeps_and_billing_runs_daily(template):
    rules = props(template, 'AWS::Events::Rule')
    assert sorted(r['ScheduleExpression'] for r in rules if 'ScheduleExpression' in r) == \
        ['cron(0 6 * * ? *)', 'rate(15 minutes)']
    (changes,) = [r for r in rules if 'EventPattern' in r and 'status' not in r['EventPattern']['detail']]
    assert changes['EventPattern']['detail-type'] == ['Batch Job State Change']
    assert len(changes['EventPattern']['detail']['jobQueue']) == 2


def test_nothing_the_spec_rules_out(template):
    for forbidden in ('AWS::EC2::NatGateway', 'AWS::EC2::FlowLog', 'AWS::WAFv2::WebACL', 'AWS::Logs::MetricFilter'):
        template.resource_count_is(forbidden, 0)
    # No custom resources: their provider Lambdas' log groups would escape the 30-day rule.
    assert not [r for r in template.to_json()['Resources'].values() if r['Type'].startswith('Custom::')]


def test_the_data_bucket_gets_no_policy_from_this_stack(template):
    # The bucket belongs to the site stack and stays unlistable to the world
    # (6B-2); the worker's ListBucket is in its own role's policy, not here.
    template.resource_count_is('AWS::S3::Bucket', 0)
    template.resource_count_is('AWS::S3::BucketPolicy', 0)


# -- Task 8: cost guards -------------------------------------------------------


def test_batch_failures_email_and_four_alarms(template):
    rules = props(template, 'AWS::Events::Rule')
    (failed,) = [r for r in rules if r.get('EventPattern', {}).get('detail', {}).get('status') == ['FAILED']]
    assert 'Ref' in json.dumps(failed['Targets'][0]['Arn'])               # the alerts topic
    alarms = props(template, 'AWS::CloudWatch::Alarm')
    assert len(alarms) == 4 and all(a['AlarmActions'] for a in alarms)
    assert sorted(a['MetricName'] for a in alarms) == ['5xx', 'Errors', 'Errors', 'Errors']
    assert {a['Namespace'] for a in alarms} == {'AWS/Lambda', 'AWS/ApiGateway'}   # AWS metrics only, no custom ones


def test_budget_and_its_stop_on_the_api_role_only(template):
    (budget,) = props(template, 'AWS::Budgets::Budget')
    assert budget['Budget']['BudgetLimit'] == {'Amount': 10, 'Unit': 'USD'} and budget['Budget']['TimeUnit'] == 'MONTHLY'
    assert sorted(n['Notification']['Threshold'] for n in budget['NotificationsWithSubscribers']) == [50, 80, 100]
    (action,) = props(template, 'AWS::Budgets::BudgetsAction')
    assert action['ActionThreshold'] == {'Type': 'PERCENTAGE', 'Value': 100} and action['ApprovalModel'] == 'AUTOMATIC'
    (api_role,) = template.find_resources('AWS::IAM::Role', {'Properties': {'Description': Match.string_like_regexp('^api Lambda')}})
    assert action['Definition']['IamActionDefinition']['Roles'] == [{'Ref': api_role}]
    (deny,) = props(template, 'AWS::IAM::ManagedPolicy')
    assert deny['PolicyDocument']['Statement'] == [{'Action': 'batch:SubmitJob', 'Effect': 'Deny', 'Resource': '*'}]
    assert 'Roles' not in deny                                    # attached only by the action, never at deploy


def test_cost_anomaly_monitor_off_by_default(template):
    # Ruling D14: Billing has never seen the `app` tag on a first deploy, so
    # the CUSTOM tag monitor stays gated behind -c anomalyMonitor=on until the
    # tag is activated (else CreateAnomalyMonitor risks rolling back the deploy).
    template.resource_count_is('AWS::CE::AnomalyMonitor', 0)
    template.resource_count_is('AWS::CE::AnomalySubscription', 0)


def test_cost_anomaly_monitor_watches_this_app_when_turned_on():
    app = cdk.App(context={**CONTEXT, 'anomalyMonitor': 'on'})
    stack = ComputeStack(app, 'ElectronOrbitalViewerComputeStack', data_bucket_name='data-bucket', site_origin=SITE,
                         alert_email='owner@example.com', image_tag='abc123',
                         env=cdk.Environment(account=ACCOUNT, region=REGION))
    on_template = Template.from_stack(stack)
    (monitor,) = props(on_template, 'AWS::CE::AnomalyMonitor')
    assert monitor['MonitorType'] == 'CUSTOM'
    assert json.loads(monitor['MonitorSpecification'])['Tags']['Values'] == ['electron-orbital-viewer']
    (sub,) = props(on_template, 'AWS::CE::AnomalySubscription')
    assert sub['Subscribers'][0]['Type'] == 'SNS'


def test_the_deny_policy_is_an_output_for_jobs_sh(template):
    template.has_output('DenySubmitPolicyArn', {})


def test_api_role_may_tag_what_its_submit_names(template):
    # SubmitJob with tags is also authorised as batch:TagResource, checked
    # against the job definition and queue in the request, not only the new
    # job: the first AWS submit (Task 12) was refused on the job definition.
    (role_id,) = template.find_resources('AWS::IAM::Role', {'Properties': {'Description': Match.string_like_regexp('^api Lambda')}})
    statements = [s for p in resources(template, 'AWS::IAM::Policy') if {'Ref': role_id} in p['Properties']['Roles']
                  for s in p['Properties']['PolicyDocument']['Statement']]
    (submit,) = [s for s in statements if s['Action'] == 'batch:SubmitJob']
    (tag,) = [s for s in statements if s['Action'] == 'batch:TagResource']
    assert len(submit['Resource']) == 3                          # the two queues and the job definition
    assert all(r in tag['Resource'] for r in submit['Resource'])
    jobs = [r for r in tag['Resource'] if r not in submit['Resource']]
    assert len(jobs) == 1 and json.dumps(jobs[0]).endswith(':job/*"]]}')
