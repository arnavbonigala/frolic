import json
import os
import time
import urllib.request

name = os.environ["FROLIC_BARRIER_NAME"]
base = os.environ["FROLIC_E2E_BARRIER_URL"]
run = os.environ.get("FROLIC_E2E_RUN", "default")

req = urllib.request.Request(
    base + "/arrive?run=" + run,
    data=json.dumps({"name": name}).encode(),
    headers={"content-type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=300) as res:
    out = json.load(res)

print(json.dumps({"name": name, "arrived_at": out["arrived_at"], "released_at": out["released_at"], "offset_ms": out["offset_ms"]}))
