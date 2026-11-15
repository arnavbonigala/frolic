import json
import os
import sys
import urllib.request

base = os.environ["FROLIC_E2E_URL"]
run = os.environ.get("FROLIC_E2E_RUN", "default")
expect = int(os.environ.get("FROLIC_E2E_EXPECT_REVEALS", "1"))

req = urllib.request.Request(
    base + "/e2e/reveals?run=" + run,
    headers={"x-e2e-secret": os.environ["FROLIC_E2E_SECRET"]},
)
with urllib.request.urlopen(req, timeout=60) as res:
    body = json.load(res)

count = len(body["reveals"])
print(json.dumps({"reveal_count": count, "reveals": body["reveals"]}))
if count != expect:
    print("expected " + str(expect) + " reveal, saw " + str(count), file=sys.stderr)
    sys.exit(1)
