# Electron Orbital Viewer — AWS

Two CDK stacks in us-east-1. `deploy.sh` and `jobs.sh` pin `AWS_REGION`/`AWS_DEFAULT_REGION` to us-east-1, and refuse to run if the AWS CLI still resolves another region.

- **ElectronOrbitalViewerStack** (`infra_stack.py`): the site (S3 + CloudFront) and the molecule data bucket (`molecules/…`, served through CloudFront with Origin Access Control).
- **ElectronOrbitalViewerComputeStack** (`compute_stack.py`, `cost_guards.py`): on-demand generation (spec `docs/superpowers/specs/2026-10-05-on-demand-generation-design.md` §10–§11). It holds AWS Batch on Fargate / Fargate Spot (ARM64), the jobs table (DynamoDB), the worker repository (ECR), three Lambdas (`api`, `reconcile`, `billing`), an HTTP API behind Cognito (TOTP MFA), the $10 budget with its deny-SubmitJob action, four alarms, and cost-anomaly alerts (off until you turn them on; see below). It imports the data bucket by name and never changes the site stack. `deploy.sh destroy-compute` removes every fixed cost and leaves the site and all results.

## Prerequisites

- AWS CLI configured for the account; Node.js and npm; Python 3; the CDK CLI (`npm i -g aws-cdk`).
- OrbStack running (its `docker buildx` builds the ARM64 worker image).
- `infra/owner.env` with one line, `ALERT_EMAIL=<your email>`. It is gitignored. Budget, alarm and anomaly emails go there. `deploy.sh` only reads it (it passes the address as the CDK context value `alertEmail`); never commit it or paste its contents anywhere.

## Deploying

```
infra/deploy.sh            # all: compute stack, worker image, then the site built against it
infra/deploy.sh site       # the site only (rebuilds the frontend with the compute stack's settings)
infra/deploy.sh compute    # the compute stack only
infra/deploy.sh image      # build and push the worker image (no-op if ECR already has this content)
infra/deploy.sh destroy-compute   # empty ECR, destroy the compute stack (the jobs table is retained)
```

The order matters: the compute stack needs the site's CloudFront origin (CORS and sign-in redirects), and the site's build needs the compute stack's API URL and Cognito settings (`VITE_JOBS_API_URL`, `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_DOMAIN`). `all` handles it. The worker image's tag is a hash of its committed inputs (`tools/jobs` less its tests and its `*.md`, the generator's `tools/molecules/*.py`, the lock and `.dockerignore`), so commit before deploying; documentation is left out of both the tag and the image, so a README edit is not a new worker. `compute` on its own does not push the image, and it **refuses** (exit 1) when the repository exists but ECR lacks the tag it would name, since every new job would then fail to pull its image: run `image` first, or `all`. Sourcing `deploy.sh` only defines its functions (its tests do that); executing it runs a phase.

Every site build is followed by two checks that refuse the deploy:

- `node tools/check_admin_split.mjs dist`: the owner's dashboard (`/admin.html`) must not leak into the viewer's bundle (Phase 6B-2).
- The molecule data version: `tools/molecules/version.py` and `src/molecules/data_version.ts` must agree, and that version's `index.json` must already be published behind CloudFront.

A first compute deploy can take over ten minutes. If a terminal or tool cuts the command off, CloudFormation carries on. Watch `aws cloudformation describe-stacks --stack-name ElectronOrbitalViewerComputeStack --query 'Stacks[0].StackStatus'`, then run the same phase again.

After a deploy, `deploy.sh site` prints `JOBS_AWS_API_URL=…`. Put it in `.env.local` at the repo root (gitignored) for the dev server's "AWS" choice.

### The cost-anomaly monitor (off by default)

The anomaly monitor filters on the `app` cost-allocation tag, and creating it before that tag is active could roll back the whole compute deploy. So the compute phases pass `-c anomalyMonitor=off` until it is turned on:

```
ANOMALY_MONITOR=on infra/deploy.sh compute    # once step 3 under "Owner actions" has succeeded
```

When `ANOMALY_MONITOR` is unset, `deploy.sh` keeps whatever the deployed stack has, so a routine redeploy never removes the monitor. `ANOMALY_MONITOR=off` removes it.

### Destroying the compute stack

`deploy.sh destroy-compute` first checks that the app synthesises, then empties the worker repository and destroys the compute stack. The site and every result in the data bucket stay. **The jobs table is retained**: its job history and monthly meters survive, and it costs next to nothing. Delete it by hand if you want it gone. A later redeploy creates a **new, empty table**, so if you redeploy in the same month, the meter starts again at $0 and does not count what that month has already spent. The $10 AWS Budget, which counts the account's real cost, is still the backstop.

After `destroy-compute`:

- **The live site still has the deleted stack's API URL and Cognito settings** baked in, so its owner sign-in points at nothing. Run `infra/deploy.sh site` to rebuild it without them (the sign-in is hidden again).
- **A later redeploy creates a new user pool and a new SNS subscription.** Repeat owner actions 1 and 2 below: confirm the new subscription email, then create your sign-in again and enrol TOTP. The old authenticator entry no longer works. The anomaly monitor comes back off; turn it on again with `ANOMALY_MONITOR=on`.

## Owner actions (once per compute stack: repeat 1–2 after a destroy-compute and redeploy)

1. Confirm the SNS subscription email ("AWS Notification - Subscription Confirmation"). Budget emails need no confirmation.
2. Create your sign-in. The email is the one in `infra/owner.env`:
   ```
   source infra/owner.env && aws cognito-idp admin-create-user \
     --user-pool-id "$(aws cloudformation describe-stacks --stack-name ElectronOrbitalViewerComputeStack --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)" \
     --username "$ALERT_EMAIL" --user-attributes Name=email,Value="$ALERT_EMAIL" Name=email_verified,Value=true \
     --desired-delivery-mediums EMAIL
   ```
   Then sign in from the site's "Owner sign-in", set a password and enrol an authenticator app (TOTP).
3. **The controller activates the cost-allocation tags with the CLI** (the owner asked for this, 2026-10-05): `aws ce update-cost-allocation-tags-status --cost-allocation-tags-status TagKey=app,Status=Active TagKey=component,Status=Active`. It succeeds only once AWS Billing has seen the tags on a billed resource, which is up to 24 h after the first job; before that it fails with `Tag keys not found: app,component` (checked 2026-10-05). Try it after the first AWS job, and again at each later task until it succeeds; record the result in the ledger. The daily billing figure and the anomaly monitor filter on these tags. Once it has succeeded (`{"Errors": []}`), turn the anomaly monitor on with `ANOMALY_MONITOR=on infra/deploy.sh compute`.

## Controls

```
infra/jobs.sh pause | resume        # the kill switch: POST /api/v1/jobs answers 409 "paused" while paused
infra/jobs.sh status                # kill switch, this month's meter, whether the budget stop is attached
infra/jobs.sh api GET /api/v1/costs # the job API through its Lambda, with your AWS credentials
infra/jobs.sh wait <key>            # follow a job (stops after 8 minutes; run again to keep following)
```

`jobs.sh api` prints the HTTP status on its first line, then the JSON body. Since Phase 6C a submit must name the option the owner approved and the quote id its preview showed: `infra/jobs.sh api POST /api/v1/jobs/preview '{"recipe":"single","molecule":{"name":"water"}}'`, then `infra/jobs.sh api POST /api/v1/jobs '{"recipe":"single","molecule":{"name":"water"},"option":"spot","quoteId":"<from the preview>"}'`. A quote id that no longer matches the server's own recomputation answers 409 `quote-changed`. It invokes the api Lambda directly with an HTTP API payload, so it skips Cognito (your IAM credentials are the authority) and API Gateway's throttles.

The `Api5xx` alarm emails on a single 5xx, because every answer the API expects to give is a 4xx: `paused` is 409, a PubChem outage 424, the budget 422, `quote-changed` and `option-unavailable` 409. A 5xx is therefore a fault (an unhandled error, a Lambda timeout). The $10 budget counts spend before credits and refunds, so a credited account still reaches its 100 % stop. Only this account's Cost Anomaly Detection and the stack's own Batch-FAILED rule may publish to the alert topic.

If the budget action fires, it attaches the deny-SubmitJob policy to the api role. Running jobs finish; new ones fail with `submit-failed`. Once you have looked at the cause, undo it with `aws budgets execute-budget-action --execution-type REVERSE_BUDGET_ACTION …` (the ids are under Budgets → electron-orbital-viewer-monthly → Actions), and check with `jobs.sh status`.

## Tests

```
python3 -m venv infra/.venv   # deploy.sh recreates it on every run; the tests need the dev requirements too
infra/.venv/bin/python -m pip install -r infra/requirements.txt -r infra/requirements-dev.txt
(cd infra && .venv/bin/python -m pytest tests -q)
```

The site stack's test needs `dist/`, so run `npm run build` first if it is absent.
