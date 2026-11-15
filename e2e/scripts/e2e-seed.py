import json
import os
import urllib.request

base = os.environ["FROLIC_E2E_URL"]
run = os.environ.get("FROLIC_E2E_RUN", "default")

req = urllib.request.Request(
    base + "/e2e/seed",
    data=json.dumps({"run": run}).encode(),
    headers={"content-type": "application/json", "x-e2e-secret": os.environ["FROLIC_E2E_SECRET"]},
    method="POST",
)
with urllib.request.urlopen(req, timeout=120) as res:
    body = json.load(res)

print(json.dumps(body))
