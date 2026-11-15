import json
import os
import urllib.request

base = os.environ["FROLIC_E2E_BARRIER_URL"]
run = os.environ.get("FROLIC_E2E_RUN", "default")

with urllib.request.urlopen(base + "/state?run=" + run, timeout=30) as res:
    state = json.load(res)

print(json.dumps({"released_at": state["released_at"], "stamp": state["released_at"]}))
