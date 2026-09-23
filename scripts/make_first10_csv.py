#!/usr/bin/env python3
import csv
from pathlib import Path

src = Path(__file__).parent.parent / "discogs_data" / "foreveryoungrecords-inventory-fixed.csv"
dst = Path(__file__).parent.parent / "discogs_data" / "first10.csv"

with open(src, "r", encoding="utf-8", newline="") as f:
    reader = csv.reader(f)
    rows = [next(reader)] + [next(reader) for _ in range(10)]

with open(dst, "w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f, lineterminator="\n")
    writer.writerows(rows)

print(f"Wrote {len(rows)} rows to {dst}")
