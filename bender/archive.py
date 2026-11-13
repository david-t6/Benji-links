#!/usr/bin/env python3
"""Copy new (encrypted) quiz submissions from ntfy into bender/data/submissions.json.
ntfy only keeps messages ~12h, so this runs on a schedule. Payloads stay encrypted."""
import json, os, re, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.loads(re.search(r"=\s*(\{.*\})\s*;", open(os.path.join(HERE, "config.js")).read(), re.S).group(1))
path = os.path.join(HERE, "data", "submissions.json")
data = json.load(open(path))
have = {it["id"] for it in data["items"]}
url = f"https://ntfy.sh/{cfg['topic']}/json?poll=1&since=all"
with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "bender-archive"}), timeout=60) as r:
    lines = r.read().decode().splitlines()
new = 0
for l in lines:
    try: m = json.loads(l)
    except ValueError: continue
    if m.get("event") != "message" or m["id"] in have: continue
    if m.get("time", 0) < cfg.get("startAfter", 0): continue
    data["items"].append({"id": m["id"], "time": m["time"], "message": m.get("message", "")}); have.add(m["id"]); new += 1
data["items"].sort(key=lambda x: x["time"])
if new:
    data["last_id"] = data["items"][-1]["id"]
    json.dump(data, open(path, "w"), indent=0)
print(f"archived {new} new, {len(data['items'])} total")
