#!/usr/bin/env python3
"""
Parse Ordini.pdf - 7-page cycle structure
Outputs JSON to stdout (one order per line)
"""

import pdfplumber
import json
import sys
import re
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Optional


@dataclass
class ParsedOrder:
    """Order data from Ordini.pdf - 20 fields"""

    # Page 1/7: Order Identification
    id: str  # Internal ID (e.g., "70.962")
    order_number: str  # e.g., "ORD/26000887"
    customer_profile_id: str  # e.g., "1002241"
    customer_name: str  # e.g., "Carrazza Giovanni"

    # Page 2/7: Delivery
    delivery_name: Optional[str]
    delivery_address: Optional[str]

    # Page 3/7: Dates
    creation_date: str  # ISO 8601
    delivery_date: Optional[str]  # ISO 8601
    remaining_sales_financial: Optional[str]

    # Page 4/7: Status
    customer_reference: Optional[str]
    sales_status: Optional[str]  # "Ordine aperto", "Consegnato"
    order_type: Optional[str]  # "Ordine di vendita"
    document_status: Optional[str]  # "Nessuno", "Documento di trasporto"

    # Page 5/7: Transfer
    sales_origin: Optional[str]  # "Agent"
    transfer_status: Optional[str]  # "Trasferito"
    transfer_date: Optional[str]  # ISO 8601

    # Page 6/7: Amounts
    completion_date: Optional[str]  # ISO 8601
    discount_percent: Optional[str]  # Keep as string for precision
    gross_amount: Optional[str]  # Italian format: "105,60 €"

    # Page 7/7: Total
    total_amount: Optional[str]  # Italian format: "82,91 €"


def parse_italian_datetime(date_str: str) -> Optional[str]:
    """Parse Italian datetime to ISO 8601: DD/MM/YYYY HH:MM:SS → YYYY-MM-DDTHH:MM:SS"""
    if not date_str or date_str.strip() == "":
        return None
    try:
        # Format: "20/01/2026 12:04:22"
        dt = datetime.strptime(date_str.strip(), "%d/%m/%Y %H:%M:%S")
        return dt.isoformat()
    except ValueError:
        return None


def parse_italian_date(date_str: str) -> Optional[str]:
    """Parse Italian date to ISO 8601: DD/MM/YYYY → YYYY-MM-DD"""
    if not date_str or date_str.strip() == "":
        return None
    try:
        # Format: "21/01/2026"
        dt = datetime.strptime(date_str.strip(), "%d/%m/%Y")
        return dt.date().isoformat()
    except ValueError:
        return None


def normalize_multiline(text: Optional[str]) -> Optional[str]:
    """Normalize multiline text (e.g., addresses) to single line"""
    if not text:
        return None
    # Replace newlines with comma-space
    return re.sub(r"\s+", " ", text.strip())


def parse_orders_pdf(pdf_path: str):
    """
    Parse Ordini.pdf with 7-page cycle structure.
    Yields one ParsedOrder per order.
    """
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)

        # Process in 7-page cycles
        for cycle_start in range(0, total_pages, 7):
            # Extract all 7 pages as tables
            tables = []
            for i in range(7):
                page_idx = cycle_start + i
                if page_idx >= total_pages:
                    break

                page = pdf.pages[page_idx]
                page_tables = page.extract_tables()

                if not page_tables or not page_tables[0]:
                    # Skip if no table found
                    tables.append([])
                else:
                    tables.append(page_tables[0])

                # Free memory
                page = None

            # Need all 7 pages for complete cycle
            if len(tables) < 7:
                break

            # Skip if tables are empty
            if not tables[0] or len(tables[0]) <= 1:  # Header only
                continue

            # Combine rows (row N = same order across all 7 pages)
            num_rows = len(tables[0])

            for row_idx in range(1, num_rows):  # Skip header (row 0)
                # Extract fields from each page
                try:
                    # Page 1/7: Order ID (4 columns)
                    row1 = (
                        tables[0][row_idx] if row_idx < len(tables[0]) else [None] * 4
                    )
                    order_id = row1[0] if len(row1) > 0 else None
                    order_number = row1[1] if len(row1) > 1 else None
                    customer_profile_id = row1[2] if len(row1) > 2 else None
                    customer_name = row1[3] if len(row1) > 3 else None

                    # Skip if no order ID
                    if not order_id or not order_number:
                        continue

                    # Skip garbage rows (ID = "0" pattern from other PDFs)
                    if order_id == "0" or order_number == "0":
                        continue

                    # Page 2/7: Delivery (2 columns)
                    row2 = (
                        tables[1][row_idx] if row_idx < len(tables[1]) else [None] * 2
                    )
                    delivery_name = row2[0] if len(row2) > 0 else None
                    delivery_address = (
                        normalize_multiline(row2[1]) if len(row2) > 1 else None
                    )

                    # Page 3/7: Dates (3 columns)
                    row3 = (
                        tables[2][row_idx] if row_idx < len(tables[2]) else [None] * 3
                    )
                    creation_date = (
                        parse_italian_datetime(row3[0]) if len(row3) > 0 else None
                    )
                    delivery_date = (
                        parse_italian_date(row3[1]) if len(row3) > 1 else None
                    )
                    remaining_sales_financial = row3[2] if len(row3) > 2 else None

                    # Page 4/7: Status (4 columns)
                    row4 = (
                        tables[3][row_idx] if row_idx < len(tables[3]) else [None] * 4
                    )
                    customer_reference = row4[0] if len(row4) > 0 else None
                    sales_status = row4[1] if len(row4) > 1 else None
                    order_type = row4[2] if len(row4) > 2 else None
                    document_status = row4[3] if len(row4) > 3 else None

                    # Page 5/7: Transfer (3 columns)
                    row5 = (
                        tables[4][row_idx] if row_idx < len(tables[4]) else [None] * 3
                    )
                    sales_origin = row5[0] if len(row5) > 0 else None
                    transfer_status = row5[1] if len(row5) > 1 else None
                    transfer_date = (
                        parse_italian_date(row5[2]) if len(row5) > 2 else None
                    )

                    # Page 6/7: Amounts (4 columns)
                    row6 = (
                        tables[5][row_idx] if row_idx < len(tables[5]) else [None] * 4
                    )
                    completion_date = (
                        parse_italian_date(row6[0]) if len(row6) > 0 else None
                    )
                    # Skip row6[1] = "Preventivo" (always "No")
                    discount_percent = row6[2] if len(row6) > 2 else None
                    gross_amount = row6[3] if len(row6) > 3 else None

                    # Page 7/7: Total (2 columns)
                    row7 = (
                        tables[6][row_idx] if row_idx < len(tables[6]) else [None] * 2
                    )
                    total_amount = row7[0] if len(row7) > 0 else None
                    # Skip row7[1] = "ORDINE OMAGGIO" (gift flag)

                    # Create ParsedOrder
                    order = ParsedOrder(
                        id=order_id,
                        order_number=order_number,
                        customer_profile_id=customer_profile_id,
                        customer_name=customer_name,
                        delivery_name=delivery_name,
                        delivery_address=delivery_address,
                        creation_date=creation_date,
                        delivery_date=delivery_date,
                        remaining_sales_financial=remaining_sales_financial,
                        customer_reference=customer_reference,
                        sales_status=sales_status,
                        order_type=order_type,
                        document_status=document_status,
                        sales_origin=sales_origin,
                        transfer_status=transfer_status,
                        transfer_date=transfer_date,
                        completion_date=completion_date,
                        discount_percent=discount_percent,
                        gross_amount=gross_amount,
                        total_amount=total_amount,
                    )

                    yield order

                except Exception as e:
                    # Skip malformed rows
                    print(
                        f"Warning: Error parsing row {row_idx} in cycle {cycle_start}: {e}",
                        file=sys.stderr,
                    )
                    continue

            # Free tables memory
            tables = None


def main():
    """Main entry point - outputs JSON to stdout"""
    if len(sys.argv) < 2:
        print("Usage: parse-orders-pdf.py <pdf_path>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        for order in parse_orders_pdf(pdf_path):
            # Output one JSON object per line
            print(json.dumps(asdict(order), ensure_ascii=False))

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
