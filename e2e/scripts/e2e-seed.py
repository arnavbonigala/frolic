import datetime
import json
import os
import urllib.request

base = os.environ["FROLIC_E2E_URL"]
run = os.environ.get("FROLIC_E2E_RUN", "default")
scenario = os.environ.get("FROLIC_E2E_SCENARIO", "demo")

payload = {"run": run}
if scenario:
    payload["scenario"] = scenario

req = urllib.request.Request(
    base + "/e2e/seed",
    data=json.dumps(payload).encode(),
    headers={"content-type": "application/json", "x-e2e-secret": os.environ["FROLIC_E2E_SECRET"]},
    method="POST",
)
with urllib.request.urlopen(req, timeout=120) as res:
    body = json.load(res)


def clock(ms):
    if ms is None:
        return "not set"
    return datetime.datetime.utcfromtimestamp(ms / 1000 - 8 * 3600).strftime("%-I:%M %p") + " Pacific"


plan = body.get("plan") or {}
print("run      " + body["run"])
print("group    " + body["groupId"])
print("scenario " + (scenario or "three-phone"))
print("plan     " + plan.get("title", "?"))
print("line     " + plan.get("line", "?"))
print("chips    " + " / ".join(plan.get("chips", [])))
print("starts   " + clock(plan.get("startsAt")))
print("deadline " + clock(body.get("deadline")))
print("revealAt " + str(body.get("reveal_at")))
for who in ("maya", "dev", "jordan"):
    print(who.ljust(8) + body["users"][who]["link"])
