import csv
from pathlib import Path

src = Path(__file__).parent.parent / "discogs_data" / "foreveryoungrecords-inventory-fixed.csv"
dst = Path(__file__).parent.parent / "discogs_data" / "first10.csv"

with open(src, "r", encoding="utf-8", newline="") as f:
    r = csv.reader(f)
    hdr = next(r)
    for _ in range(10):
        next(r)
    rows = [next(r) for _ in range(10)]

with open(dst, "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(hdr)
    w.writerows(rows)

print(f"Wrote {len(rows)+1} rows to {dst}")
