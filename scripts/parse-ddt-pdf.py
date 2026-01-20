#!/usr/bin/env python3
"""
Parse Documenti di trasporto.pdf - 6-page cycle structure
Outputs JSON to stdout (one DDT per line)
"""

import pdfplumber
import json
import sys
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Optional


@dataclass
class ParsedDDT:
    """DDT data from Documenti di trasporto.pdf"""
    # Page 1/6: DDT Identification
    id: str  # Internal ID
    ddt_number: str  # e.g., "DDT/26000613"
    delivery_date: Optional[str]  # ISO 8601
    order_number: str  # Match key! e.g., "ORD/26000695"

    # Page 2/6: Customer
    customer_account: Optional[str]
    sales_name: Optional[str]

    # Page 3/6: Delivery Name
    delivery_name: Optional[str]

    # Page 4/6: TRACKING (Key page!)
    tracking_number: Optional[str]  # e.g., "445291888246"
    delivery_terms: Optional[str]  # e.g., "CFR"
    delivery_method: Optional[str]  # Courier: "FedEx", "UPS", "DHL"

    # Page 5/6: Location
    delivery_city: Optional[str]


def parse_italian_date(date_str: str) -> Optional[str]:
    """Parse Italian date to ISO 8601: DD/MM/YYYY → YYYY-MM-DD"""
    if not date_str or date_str.strip() == "":
        return None
    try:
        dt = datetime.strptime(date_str.strip(), "%d/%m/%Y")
        return dt.date().isoformat()
    except ValueError:
        return None


def parse_ddt_pdf(pdf_path: str):
    """
    Parse Documenti di trasporto.pdf with 6-page cycle structure.
    Yields one ParsedDDT per DDT entry.
    """
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)

        # Process in 6-page cycles
        for cycle_start in range(0, total_pages, 6):
            # Extract all 6 pages as tables
            tables = []
            for i in range(6):
                page_idx = cycle_start + i
                if page_idx >= total_pages:
                    break

                page = pdf.pages[page_idx]
                page_tables = page.extract_tables()

                if not page_tables or not page_tables[0]:
                    tables.append([])
                else:
                    tables.append(page_tables[0])

                page = None

            # Need all 6 pages
            if len(tables) < 6:
                break

            # Skip if first table empty
            if not tables[0] or len(tables[0]) <= 1:
                continue

            num_rows = len(tables[0])

            for row_idx in range(1, num_rows):  # Skip header
                try:
                    # Page 1/6: DDT ID (5 columns)
                    # Columns: [PDF_DDT, ID, DDT_NUMBER, DELIVERY_DATE, ORDER_NUMBER]
                    row1 = tables[0][row_idx] if row_idx < len(tables[0]) else [None] * 5
                    ddt_id = row1[1] if len(row1) > 1 else None
                    ddt_number = row1[2] if len(row1) > 2 else None
                    delivery_date = parse_italian_date(row1[3]) if len(row1) > 3 else None
                    order_number = row1[4] if len(row1) > 4 else None

                    # Skip if no DDT number or order number
                    if not ddt_number or not order_number:
                        continue

                    # Skip garbage rows
                    if ddt_id == "0" or ddt_number == "0":
                        continue

                    # Page 2/6: Customer (2 columns)
                    row2 = tables[1][row_idx] if row_idx < len(tables[1]) else [None] * 2
                    customer_account = row2[0] if len(row2) > 0 else None
                    sales_name = row2[1] if len(row2) > 1 else None

                    # Page 3/6: Delivery Name (2 columns - use first)
                    row3 = tables[2][row_idx] if row_idx < len(tables[2]) else [None] * 2
                    delivery_name = row3[0] if len(row3) > 0 else None

                    # Page 4/6: TRACKING (3 columns) ⭐ KEY PAGE
                    # Columns: [TRACKING_NUMBER, DELIVERY_TERMS, DELIVERY_METHOD]
                    row4 = tables[3][row_idx] if row_idx < len(tables[3]) else [None] * 3
                    tracking_number = row4[0] if len(row4) > 0 and row4[0] and row4[0].strip() else None
                    delivery_terms = row4[1] if len(row4) > 1 else None
                    delivery_method = row4[2] if len(row4) > 2 else None

                    # Page 5/6: Location (3 columns)
                    row5 = tables[4][row_idx] if row_idx < len(tables[4]) else [None] * 3
                    delivery_city = row5[0] if len(row5) > 0 else None

                    # Create ParsedDDT
                    ddt = ParsedDDT(
                        id=ddt_id,
                        ddt_number=ddt_number,
                        delivery_date=delivery_date,
                        order_number=order_number,
                        customer_account=customer_account,
                        sales_name=sales_name,
                        delivery_name=delivery_name,
                        tracking_number=tracking_number,
                        delivery_terms=delivery_terms,
                        delivery_method=delivery_method,
                        delivery_city=delivery_city
                    )

                    yield ddt

                except Exception as e:
                    print(f"Warning: Error parsing row {row_idx} in cycle {cycle_start}: {e}", file=sys.stderr)
                    continue

            tables = None


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: parse-ddt-pdf.py <pdf_path>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        for ddt in parse_ddt_pdf(pdf_path):
            print(json.dumps(asdict(ddt), ensure_ascii=False))

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
