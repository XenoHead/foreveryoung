#!/usr/bin/env python3
import json
import urllib.request
from pathlib import Path

CSV_PATH = Path(__file__).parent.parent / "discogs_data" / "first10.csv"
API_URL = "http://127.0.0.1:9200/api/parse-test"

csv_text = CSV_PATH.read_text(encoding="utf-8")
payload = json.dumps({"csv": csv_text}).encode("utf-8")

req = urllib.request.Request(
    API_URL,
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        print(json.dumps(data, indent=2))
except urllib.error.HTTPError as e:
    print("HTTP error:", e.status, e.reason)
    print(e.read().decode("utf-8"))
except Exception as e:
    print("Error:", e)
