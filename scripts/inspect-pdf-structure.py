#!/usr/bin/env python3
"""
Diagnostic: inspect PDF table structure.
Shows headers, row counts, and sample data for each page.
Usage: python3 inspect-pdf-structure.py <pdf_path>
"""
import pdfplumber
import sys
import json


def inspect_pdf(pdf_path: str):
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        print(f"Total pages: {total}")
        print("=" * 60)

        for i, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            if not tables:
                print(f"Page {i+1}: NO TABLES")
                continue

            for t_idx, table in enumerate(tables):
                if not table:
                    print(f"Page {i+1} Table {t_idx}: EMPTY")
                    continue

                headers = [(h or '').strip() for h in table[0]]
                rows = len(table) - 1
                print(f"\nPage {i+1} Table {t_idx}: {rows} data rows")
                print(f"  Headers: {headers}")

                if rows > 0 and len(table) > 1:
                    sample = [(c or '')[:40] for c in table[1]]
                    print(f"  Row 1:   {sample}")
                if rows > 1 and len(table) > 2:
                    sample2 = [(c or '')[:40] for c in table[2]]
                    print(f"  Row 2:   {sample2}")

            if i >= 15:
                print(f"\n... (showing first 16 of {total} pages)")
                break


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: inspect-pdf-structure.py <pdf_path>", file=sys.stderr)
        sys.exit(1)
    inspect_pdf(sys.argv[1])
