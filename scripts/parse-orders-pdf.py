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
    order_number: Optional[str]  # e.g., "ORD/26000887" - None for pending orders
    customer_profile_id: Optional[str]  # e.g., "1002241" - None for pending orders
    customer_name: Optional[str]  # e.g., "Carrazza Giovanni" - None for pending orders

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


def get_column_value(table: list, row_idx: int, header_text: str) -> Optional[str]:
    """
    Extract value from table by matching header text.
    More robust than hardcoded column indices.
    """
    if not table or len(table) < 2:  # Need header + data
        return None

    header_row = table[0]
    if row_idx >= len(table):
        return None

    data_row = table[row_idx]

    # Find column index by header text (case-insensitive, partial match)
    for idx, header in enumerate(header_row):
        if header and header_text.upper() in str(header).upper():
            if idx < len(data_row):
                value = data_row[idx]
                # Return None for empty strings
                if value is None or str(value).strip() == "":
                    return None
                return str(value).strip()

    return None


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
                # Extract fields from each page using header matching
                try:
                    # Page 1/7: ID, ID DI VENDITA, PROFILO CLIENTE, NOME VENDITE (4 columns)
                    order_id = get_column_value(tables[0], row_idx, "ID")
                    order_number = get_column_value(tables[0], row_idx, "ID DI VENDITA")
                    customer_profile_id = get_column_value(
                        tables[0], row_idx, "PROFILO CLIENTE"
                    )
                    customer_name = get_column_value(tables[0], row_idx, "NOME VENDITE")

                    # Skip if no internal ID (always required)
                    if not order_id:
                        continue

                    # Skip garbage rows (ID = "0" pattern from other PDFs)
                    if order_id == "0":
                        continue

                    # Allow orders without order_number (ID DI VENDITA) - these are pending orders
                    # waiting for Milano processing or intervention

                    # Page 2/7: NOME DI CONSEGNA, INDIRIZZO DI CONSEGNA (2 columns)
                    delivery_name = get_column_value(
                        tables[1], row_idx, "NOME DI CONSEGNA"
                    )
                    delivery_address_raw = get_column_value(
                        tables[1], row_idx, "INDIRIZZO DI CONSEGNA"
                    )
                    delivery_address = normalize_multiline(delivery_address_raw)

                    # Page 3/7: DATA DI CREAZIONE, DATA DI CONSEGNA, RIMANI VENDITE FINANZIARIE (3 columns)
                    creation_date_raw = get_column_value(
                        tables[2], row_idx, "DATA DI CREAZIONE"
                    )
                    creation_date = parse_italian_datetime(creation_date_raw)

                    # Validate creation_date - this is a required field
                    # If parsing fails, log details and raise error for investigation
                    if not creation_date:
                        error_msg = f"Missing required field: creation_date for order {order_id} (raw: '{creation_date_raw}')"
                        print(f"ERROR: {error_msg}", file=sys.stderr)
                        print(f"DEBUG: Table 2 headers: {tables[2][0] if tables[2] else 'N/A'}", file=sys.stderr)
                        raise ValueError(error_msg)

                    delivery_date_raw = get_column_value(
                        tables[2], row_idx, "DATA DI CONSEGNA"
                    )
                    delivery_date = parse_italian_date(delivery_date_raw)

                    remaining_sales_financial = get_column_value(
                        tables[2], row_idx, "RIMANI VENDITE FINANZIARIE"
                    )

                    # Page 4/7: RIFERIMENTO CLIENTE, STATO DELLE VENDITE, TIPO DI ORDINE, STATO DEL DOCUMENTO (4 columns)
                    customer_reference = get_column_value(
                        tables[3], row_idx, "RIFERIMENTO CLIENTE"
                    )
                    sales_status = get_column_value(
                        tables[3], row_idx, "STATO DELLE VENDITE"
                    )
                    order_type = get_column_value(tables[3], row_idx, "TIPO DI ORDINE")
                    document_status = get_column_value(
                        tables[3], row_idx, "STATO DEL DOCUMENTO"
                    )

                    # Page 5/7: ORIGINE VENDITE, STATO DEL TRASFERIMENTO, DATA DI TRASFERIMENTO (3 columns)
                    sales_origin = get_column_value(
                        tables[4], row_idx, "ORIGINE VENDITE"
                    )
                    transfer_status = get_column_value(
                        tables[4], row_idx, "STATO DEL TRASFERIMENTO"
                    )

                    transfer_date_raw = get_column_value(
                        tables[4], row_idx, "DATA DI TRASFERIMENTO"
                    )
                    transfer_date = parse_italian_date(transfer_date_raw)

                    # Page 6/7: DATA DI COMPLETAMENTO, PREVENTIVO, APPLICA SCONTO %, IMPORTO LORDO (4 columns)
                    completion_date_raw = get_column_value(
                        tables[5], row_idx, "DATA DI COMPLETAMENTO"
                    )
                    completion_date = parse_italian_date(completion_date_raw)

                    # Skip "PREVENTIVO" column - not needed
                    discount_percent = get_column_value(
                        tables[5], row_idx, "APPLICA SCONTO"
                    )
                    gross_amount = get_column_value(tables[5], row_idx, "IMPORTO LORDO")

                    # Page 7/7: IMPORTO TOTALE, ORDINE OMAGGIO (2 columns)
                    total_amount = get_column_value(
                        tables[6], row_idx, "IMPORTO TOTALE"
                    )
                    # Skip "ORDINE OMAGGIO" column - gift flag not needed

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
