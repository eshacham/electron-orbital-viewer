"""The stops and alarms around the compute stack's spending (spec §11).

Within CloudWatch's ten free alarms and with no custom metrics: four
alarms (each Lambda's errors, the API's 5xx), an EventBridge rule that
emails every Batch FAILED, and -- instead of a metric filter, which would be
a custom metric -- the reconcile Lambda publishing straight to the topic
when its sweep finds stale jobs (it already holds the list, so the email
names the jobs). The $10 budget's action denies batch:SubmitJob to the api
role only: running jobs, reconcile and settlement carry on.

The CUSTOM cost anomaly monitor watches the `app` tag, but Billing has never
seen that tag on a first deploy of this stack (preflight D14): asking
Cost Explorer to create a tag monitor before the tag is active risks
rolling back the whole deploy, and the monitor is inert until activation
anyway. So it (and its subscription) are gated behind the CDK context
`anomalyMonitor == 'on'` (default off); a later redeploy turns it on once
the tag has been activated.
"""
import json

from aws_cdk import Duration, aws_budgets as budgets, aws_ce as ce, aws_cloudwatch as cloudwatch, \
    aws_cloudwatch_actions as cw_actions, aws_events as events, aws_events_targets as targets, aws_iam as iam
from constructs import Construct

BUDGET_USD = 10
BUDGET_EMAIL_PERCENTAGES = (50, 80, 100)
ANOMALY_IMPACT_USD = 1


def add_cost_guards(scope: Construct, *, topic, api_role: iam.Role, alert_email: str, functions: dict, api,
                    queue_arns: list, app_tag: str) -> iam.ManagedPolicy:
    topic.add_to_resource_policy(iam.PolicyStatement(
        actions=['sns:Publish'], resources=[topic.topic_arn],
        principals=[iam.ServicePrincipal('costalerts.amazonaws.com')]))

    events.Rule(scope, 'BatchFailed', description='A Batch job FAILED: email the owner',
                event_pattern=events.EventPattern(source=['aws.batch'], detail_type=['Batch Job State Change'],
                                                  detail={'jobQueue': queue_arns, 'status': ['FAILED']}),
                targets=[targets.SnsTopic(topic, message=events.RuleTargetInput.from_text(
                    f'Batch job {events.EventField.from_path("$.detail.jobName")} FAILED: '
                    f'{events.EventField.from_path("$.detail.statusReason")}'))])

    action = cw_actions.SnsAction(topic)
    for name, fn in functions.items():
        fn.metric_errors(period=Duration.minutes(5)).create_alarm(
            scope, f'{name}Errors', threshold=1, evaluation_periods=1, alarm_description=f'{name} Lambda errors',
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING).add_alarm_action(action)
    api.metric_server_error(period=Duration.minutes(5)).create_alarm(
        scope, 'Api5xx', threshold=1, evaluation_periods=1, alarm_description='Jobs API 5xx',
        treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING).add_alarm_action(action)

    # Account-wide on purpose: it works before the cost-allocation tags are
    # active, it counts the untaggable Cost Explorer calls, and this account
    # has no other workload (its only other budget is a zero-spend alert).
    budget = budgets.CfnBudget(scope, 'MonthlyBudget', budget=budgets.CfnBudget.BudgetDataProperty(
        budget_name='electron-orbital-viewer-monthly', budget_type='COST', time_unit='MONTHLY',
        budget_limit=budgets.CfnBudget.SpendProperty(amount=BUDGET_USD, unit='USD')),
        notifications_with_subscribers=[budgets.CfnBudget.NotificationWithSubscribersProperty(
            notification=budgets.CfnBudget.NotificationProperty(
                comparison_operator='GREATER_THAN', notification_type='ACTUAL', threshold=pct,
                threshold_type='PERCENTAGE'),
            subscribers=[budgets.CfnBudget.SubscriberProperty(subscription_type='EMAIL', address=alert_email)])
            for pct in BUDGET_EMAIL_PERCENTAGES])
    deny_submit = iam.ManagedPolicy(scope, 'DenySubmitJob', description='Attached by the $10 budget action',
                                    statements=[iam.PolicyStatement(effect=iam.Effect.DENY,
                                                                    actions=['batch:SubmitJob'], resources=['*'])])
    budget_role = iam.Role(scope, 'BudgetActionRole', assumed_by=iam.ServicePrincipal('budgets.amazonaws.com'),
                           description='Lets AWS Budgets attach the deny-SubmitJob policy to the api role')
    budget_role.add_to_policy(iam.PolicyStatement(
        actions=['iam:AttachRolePolicy', 'iam:DetachRolePolicy'], resources=[api_role.role_arn],
        conditions={'ArnEquals': {'iam:PolicyARN': deny_submit.managed_policy_arn}}))
    budgets.CfnBudgetsAction(
        scope, 'StopSubmissions', budget_name=budget.ref, action_type='APPLY_IAM_POLICY',
        action_threshold=budgets.CfnBudgetsAction.ActionThresholdProperty(type='PERCENTAGE', value=100),
        approval_model='AUTOMATIC', notification_type='ACTUAL', execution_role_arn=budget_role.role_arn,
        definition=budgets.CfnBudgetsAction.DefinitionProperty(
            iam_action_definition=budgets.CfnBudgetsAction.IamActionDefinitionProperty(
                policy_arn=deny_submit.managed_policy_arn, roles=[api_role.role_name])),
        subscribers=[budgets.CfnBudgetsAction.SubscriberProperty(type='EMAIL', address=alert_email)])

    # Ruling D14: gated off by default. A first deploy's `app` tag is not yet
    # an active cost-allocation tag, and CreateAnomalyMonitor on an unknown or
    # inactive tag can roll back the whole stack. A later redeploy with
    # `-c anomalyMonitor=on` turns this on once the tag is active.
    if scope.node.try_get_context('anomalyMonitor') == 'on':
        # A tag monitor, not a service one: AWS gives new accounts a default
        # services monitor and allows only one of that kind.
        monitor = ce.CfnAnomalyMonitor(scope, 'CostAnomalies', monitor_name='electron-orbital-viewer',
                                       monitor_type='CUSTOM', monitor_specification=json.dumps(
                                           {'Tags': {'Key': 'app', 'Values': [app_tag], 'MatchOptions': ['EQUALS']}}))
        ce.CfnAnomalySubscription(scope, 'CostAnomalyAlerts', subscription_name='electron-orbital-viewer',
                                  frequency='IMMEDIATE', monitor_arn_list=[monitor.attr_monitor_arn],
                                  subscribers=[ce.CfnAnomalySubscription.SubscriberProperty(
                                      type='SNS', address=topic.topic_arn)],
                                  threshold_expression=json.dumps({'Dimensions': {
                                      'Key': 'ANOMALY_TOTAL_IMPACT_ABSOLUTE', 'Values': [str(ANOMALY_IMPACT_USD)],
                                      'MatchOptions': ['GREATER_THAN_OR_EQUAL']}}))
    return deny_submit
