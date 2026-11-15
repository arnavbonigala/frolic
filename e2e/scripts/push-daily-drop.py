import json
import os
import subprocess

session = os.environ.get("REVYL_SESSION_ID")
cmd = ["revyl", "device", "push", "--title", "Today's frolic", "--body", "Maya, Dev and Jordan are free and the sun sets at 4:58. Just saying."]
if session:
    cmd += ["--session-id", session]
print(subprocess.run(cmd, capture_output=True, text=True).stdout)
