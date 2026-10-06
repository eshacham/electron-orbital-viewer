#!/bin/bash
# The owner's controls for on-demand generation in AWS (spec 2026-10-05 §10.2).
#
#   infra/jobs.sh pause                  refuse new jobs (POST /api/v1/jobs answers 503 "paused")
#   infra/jobs.sh resume                 accept them again
#   infra/jobs.sh status                 kill switch, this month's meter, and whether the budget stop is attached
#   infra/jobs.sh api METHOD PATH [JSON] call the job API through its Lambda with your AWS credentials
#   infra/jobs.sh wait KEY [SECONDS]     poll a job every 20 s until DONE/FAILED or SECONDS (default 480) pass
#
# `api` invokes the api Lambda directly with an HTTP API payload: the same
# handlers, without the Cognito token (your IAM credentials are the
# authority) and without API Gateway's throttles. It exists so the rollout
# can run from a terminal; the browser path is checked separately.
#
# Kept to macOS /bin/bash 3.2: no associative arrays, no ${var,,}, no mapfile.
set -euo pipefail

STACK=ElectronOrbitalViewerComputeStack
output() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

# Builds an HTTP API payload 2.0 event (what tools/jobs/lambdas.py's
# handle_http reads: requestContext.http.method, rawPath,
# queryStringParameters, body, isBase64Encoded). Kept in a variable rather
# than a heredoc inside $(...), which bash 3.2 parses unreliably.
EVENT_PY='
import json, sys
from urllib.parse import parse_qsl, urlsplit
method, target, body = sys.argv[1], sys.argv[2], sys.argv[3]
url = urlsplit(target)
print(json.dumps({"version": "2.0", "rawPath": url.path,
                  "queryStringParameters": dict(parse_qsl(url.query)) or None,
                  "body": body or None, "isBase64Encoded": False,
                  "requestContext": {"http": {"method": method.upper()}, "requestId": "jobs.sh"}}))
'

# Prints the proxy response: the HTTP status on the first line, then the body.
RESPONSE_PY='
import json, sys
r = json.load(open(sys.argv[1]))
if not isinstance(r, dict) or "statusCode" not in r:
    sys.exit("Lambda error: " + json.dumps(r))
print(r["statusCode"])
print(json.dumps(json.loads(r["body"]), indent=1))
'

api() {
  local method=$1 target=$2 body=${3:-} fn event out
  fn=$(output ApiFunctionName)
  event=$(python3 -c "$EVENT_PY" "$method" "$target" "$body")
  out=$(mktemp)
  aws lambda invoke --function-name "$fn" --cli-binary-format raw-in-base64-out --payload "$event" "$out" >/dev/null
  python3 -c "$RESPONSE_PY" "$out" || { rm -f "$out"; return 1; }
  rm -f "$out"
}

case "${1:-}" in
  pause|resume)
    [ "$1" = pause ] && value=false || value=true
    aws dynamodb update-item --table-name "$(output JobsTableName)" --key '{"pk":{"S":"CONFIG"}}' \
      --update-expression 'SET generationEnabled = :e' --expression-attribute-values "{\":e\":{\"BOOL\":$value}}"
    echo "generation $([ "$value" = true ] && echo resumed || echo paused)"
    ;;
  status)
    table=$(output JobsTableName)
    month=$(date -u +%Y-%m)
    enabled=$(aws dynamodb get-item --table-name "$table" --key '{"pk":{"S":"CONFIG"}}' \
      --query 'Item.generationEnabled.BOOL' --output text)
    echo "generation enabled: $([ "$enabled" = False ] && echo no || echo yes)"
    aws dynamodb get-item --table-name "$table" --key "{\"pk\":{\"S\":\"METER#$month\"}}" --output json \
      | python3 -c '
import json, sys
raw = sys.stdin.read().strip()
item = json.loads(raw).get("Item") if raw else None
m = sys.argv[1]
if not item:
    print(f"meter {m}: nothing reserved or spent yet")
else:
    spent, reserved, committed = (int(item.get(k, {"N": "0"})["N"]) / 1e6 for k in ("spent", "reserved", "committed"))
    print(f"meter {m}: spent ${spent:.4f}, reserved ${reserved:.4f}, committed ${committed:.4f} of $8.80")
' "$month"
    attached=$(aws iam list-attached-role-policies --role-name "$(output ApiRoleName)" \
      --query "AttachedPolicies[?PolicyArn=='$(output DenySubmitPolicyArn)'] | length(@)" --output text)
    echo "budget stop (deny batch:SubmitJob on the api role): $([ "$attached" = 0 ] && echo not attached || echo ATTACHED)"
    ;;
  api)
    [ $# -ge 3 ] || { echo "usage: $0 api METHOD PATH [JSON]" >&2; exit 2; }
    api "$2" "$3" "${4:-}"
    ;;
  wait)
    [ $# -ge 2 ] || { echo "usage: $0 wait KEY [SECONDS]" >&2; exit 2; }
    key=$2 limit=${3:-480} start=$(date +%s)
    while :; do
      line=$(api GET "/api/v1/jobs/$key" | python3 -c '
import json, sys
status, body = sys.stdin.read().split("\n", 1)
d = json.loads(body)
if status != "200":
    print("ERROR", status, json.dumps(d.get("error", d)))
else:
    print(d["status"], d.get("stage") or "-", d.get("attempt"), d.get("heartbeatAt") or "-")')
      echo "$(date -u +%H:%M:%S) $line"
      case "$line" in
        DONE*|FAILED*) exit 0 ;;
        ERROR*) exit 1 ;;
      esac
      [ $(( $(date +%s) - start )) -ge "$limit" ] && { echo "still running after ${limit}s; run wait again"; exit 0; }
      sleep 20
    done
    ;;
  -h|--help|help)
    sed -n '2,13p' "$0"
    ;;
  *)
    sed -n '2,13p' "$0"
    exit 2
    ;;
esac
