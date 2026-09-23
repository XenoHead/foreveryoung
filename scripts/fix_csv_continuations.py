#!/usr/bin/env python3
"""
Clean a Discogs inventory CSV so every logical row occupies exactly one physical line.

The exporter often embeds literal newlines inside quoted description fields. That is
valid CSV, but line-based consumers (and some DB loaders) treat those newlines as
row boundaries. This script reads the file with Python's csv parser, then writes it
back with any newline characters inside fields replaced by spaces.

Usage:
    python scripts/fix_csv_continuations.py \
        discogs_data/foreveryoungrecords-inventory-20260922-0746.csv \
        discogs_data/foreveryoungrecords-inventory-fixed.csv
"""

import argparse
import csv
import sys


def clean_csv(input_path: str, output_path: str, newline_replacement: str = " ") -> None:
    with open(input_path, "r", encoding="utf-8", newline="") as fin:
        reader = csv.reader(fin)
        rows = list(reader)

    with open(output_path, "w", encoding="utf-8", newline="") as fout:
        writer = csv.writer(fout, lineterminator="\n")
        for row in rows:
            cleaned = [cell.replace("\r\n", newline_replacement)
                            .replace("\n", newline_replacement)
                            .replace("\r", newline_replacement)
                       for cell in row]
            writer.writerow(cleaned)

    print(f"Wrote {len(rows)} rows to {output_path}")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Flatten newline continuations in a CSV.")
    parser.add_argument("input", help="Input CSV file path")
    parser.add_argument("output", help="Output CSV file path")
    parser.add_argument(
        "--keep-newlines",
        action="store_true",
        help="Keep newlines as \\n literal text instead of replacing with spaces",
    )
    args = parser.parse_args(argv)

    replacement = "\\n" if args.keep_newlines else " "
    clean_csv(args.input, args.output, replacement)


if __name__ == "__main__":
    main()
