#!/usr/bin/env python3
"""
Preview the first 10 CSV rows using the same transformation logic as
staff.foreveryoung/_worker.js handleImportCsv.
"""
import csv
import re
from pathlib import Path

CSV_PATH = Path(__file__).parent.parent / "discogs_data" / "foreveryoungrecords-inventory-fixed.csv"

def determine_format(raw_fmt: str) -> str:
    # Preserve multi-disc/multi-cassette notation like "2xCD", "2 x LP", "3xCD".
    first_token = (raw_fmt or "").split(",")[0].strip()
    compact = first_token.lower().replace(" ", "")

    multi_match = re.search(r"^(\d+)x", compact)
    qty_prefix = f"{multi_match.group(1)}x" if multi_match else ""
    body = re.sub(r"^\d+x", "", compact)

    if body.startswith(("dvd", "video", "vhs", "blu-ray", "bd")):
        base = "DVD"
    elif body.startswith("cass"):
        base = "Cassette"
    elif body.startswith(("lp", "vinyl", '12"')):
        base = "LP"
    elif body.startswith(("cd", "hdcd", "sacd")):
        base = "CD"
    else:
        base = "CD"

    return qty_prefix + base


def clean_description(raw_desc: str) -> str:
    clean = (raw_desc or "").strip()
    if not clean:
        return clean

    import re
    junk_prefix = re.compile(r"^(?:\d+\s+)?(?:CD|Digipak|Vinyl|Sleeve|Case|Pack|Booklet|Card|Jacket|LP|Cassette|DVD|HDCD|SACD|2xLP|3xLP|4xLP|2xCass)\s*(?:Set|s)?\s*(?:is\s+)?[-–]?\s*", re.IGNORECASE)
    prev = None
    while clean != prev:
        prev = clean
        clean = re.sub(r"^\s*[-–]\s*", "", clean)
        clean = junk_prefix.sub("", clean)
    return clean.strip()


def q(v):
    if v is None or v == "":
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def p(v, flt=False):
    if v is None or v == "":
        return "NULL"
    n = float(v) if flt else int(v)
    return f"{n:.2f}" if flt else str(n)


def main():
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = []
        for i, row in enumerate(reader):
            if i >= 10:
                break
            rows.append(row)

    columns = [
        "Artist", "Title", "Format", "Discogs_ID", "Discogs_url", "Price", "Description",
        "Condition_Media", "Condition_Sleeve", "Seller_Reference_Number", "Quantity",
        "Label", "Release_Catalog_Number", "Release_Country", "Release_Date", "Genre",
        "Front_Image_URL", "Back_Image_URL", "YouTube_Audio_Image_URLs", "Bar_Code",
        "Number_In_Set", "Listing_ID", "Status", "Accept_Offer", "Weight", "Format_Quantity",
        "External_ID",
    ]

    print(f"Previewing first {len(rows)} rows from {CSV_PATH}\n")
    for row in rows:
        release_id = row.get("release_id", "").strip()
        discogs_url = f"https://www.discogs.com/release/{''.join(c for c in release_id if c.isdigit())}" if release_id else ""
        status_raw = row.get("status", "").strip()
        raw_qty = row.get("quantity", "").strip()
        quantity = 0 if re.search(r"sold", status_raw, re.IGNORECASE) else p(raw_qty)

        values = [
            re.sub(r"\s*\((\d+)\)\s*$", "", row.get("artist", "").strip()),
            row.get("title", "").strip(),
            determine_format(row.get("format", "")),
            release_id,
            discogs_url,
            p(row.get("price", ""), flt=True),
            clean_description(row.get("comments", "")),
            row.get("media_condition", "").strip(),
            row.get("sleeve_condition", "").strip(),
            row.get("location", "").strip(),
            quantity,
            row.get("label", "").strip(),
            row.get("catno", "").strip(),
            None,
            row.get("listed", "").strip(),
            None,
            None,
            None,
            None,
            None,
            None,
            row.get("listing_id", "").strip(),
            row.get("status", "").strip(),
            row.get("accept_offer", "").strip(),
            p(row.get("weight", ""), flt=True),
            p(row.get("format_quantity", "")),
            row.get("external_id", "").strip(),
        ]

        for col, val in zip(columns, values):
            display = q(val) if val is not None else "NULL"
            print(f"  {col}: {display}")
        print()

    print("-- Sample INSERT for row 1 --")
    r0_status = rows[0].get("status", "").strip()
    r0_qty = 0 if re.search(r"sold", r0_status, re.IGNORECASE) else p(rows[0].get("quantity", ""))
    values_str = ", ".join(q(v) if v is not None else "NULL" for v in [
        re.sub(r"\s*\((\d+)\)\s*$", "", rows[0].get("artist", "").strip()),
        rows[0].get("title", "").strip(),
        determine_format(rows[0].get("format", "")),
        rows[0].get("release_id", "").strip(),
        f"https://www.discogs.com/release/{''.join(c for c in rows[0].get('release_id', '') if c.isdigit())}",
        p(rows[0].get("price", ""), flt=True),
        clean_description(rows[0].get("comments", "")),
        rows[0].get("media_condition", "").strip(),
        rows[0].get("sleeve_condition", "").strip(),
        rows[0].get("location", "").strip(),
        r0_qty,
        rows[0].get("label", "").strip(),
        rows[0].get("catno", "").strip(),
        None,
        rows[0].get("listed", "").strip(),
        None,
        None,
        None,
        None,
        None,
        None,
        rows[0].get("listing_id", "").strip(),
        r0_status,
        rows[0].get("accept_offer", "").strip(),
        p(rows[0].get("weight", ""), flt=True),
        p(rows[0].get("format_quantity", "")),
        rows[0].get("external_id", "").strip(),
    ])
    print(f"INSERT INTO Online_Inventory ({', '.join(columns)}) VALUES ({values_str});")


if __name__ == "__main__":
    main()
