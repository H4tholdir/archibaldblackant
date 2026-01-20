#!/usr/bin/env python3
"""
Parse Fatture.pdf - 7-page cycle structure
Outputs JSON to stdout (one invoice per line)
"""

import pdfplumber
import json
import sys
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Optional


@dataclass
class ParsedInvoice:
    """Invoice data from Fatture.pdf - 7-page cycle"""
    # Page 1/7: Invoice Identification
    id: str  # Internal ID
    invoice_number: str  # e.g., "FT/26000123"
    invoice_date: Optional[str]  # ISO 8601
    customer_account: str  # Match key! e.g., "1002241"

    # Page 2/7: Billing
    billing_name: Optional[str]
    quantity: Optional[str]
    sales_balance: Optional[str]

    # Page 3/7: Amount fields
    amount: Optional[str]  # Italian format: "105,60 €"
    vat_amount: Optional[str]
    total_amount: Optional[str]
    payment_terms: Optional[str]


def parse_italian_date(date_str: str) -> Optional[str]:
    """Parse Italian date to ISO 8601: DD/MM/YYYY → YYYY-MM-DD"""
    if not date_str or date_str.strip() == "":
        return None
    try:
        dt = datetime.strptime(date_str.strip(), "%d/%m/%Y")
        return dt.date().isoformat()
    except ValueError:
        return None


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


def parse_invoices_pdf(pdf_path: str):
    """
    Parse Fatture.pdf with 7-page cycle structure.
    Yields one ParsedInvoice per invoice.
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
                    tables.append([])
                else:
                    tables.append(page_tables[0])

                page = None

            # Need all 7 pages for complete cycle
            if len(tables) < 7:
                break

            # Skip if first table empty
            if not tables[0] or len(tables[0]) <= 1:
                continue

            num_rows = len(tables[0])

            for row_idx in range(1, num_rows):  # Skip header
                try:
                    # Page 1/7: Invoice ID, Date, Customer Account (4 columns)
                    invoice_id = get_column_value(tables[0], row_idx, "ID")
                    invoice_number = get_column_value(tables[0], row_idx, "FATTURA")

                    invoice_date_raw = get_column_value(tables[0], row_idx, "DATA")
                    invoice_date = parse_italian_date(invoice_date_raw)

                    customer_account = get_column_value(tables[0], row_idx, "CONTO CLIENTE")

                    # Skip if no invoice number or customer account
                    if not invoice_number or not customer_account:
                        continue

                    # Skip garbage rows
                    if invoice_id == "0" or invoice_number == "0":
                        continue

                    # Page 2/7: Billing Name, Quantity, Sales Balance (3 columns)
                    billing_name = get_column_value(tables[1], row_idx, "NOME FATTURAZIONE")
                    quantity = get_column_value(tables[1], row_idx, "QUANTITA")
                    sales_balance = get_column_value(tables[1], row_idx, "SALDO VENDITE")

                    # Page 3/7: Amount fields (4 columns)
                    amount = get_column_value(tables[2], row_idx, "IMPORTO")
                    vat_amount = get_column_value(tables[2], row_idx, "IVA")
                    total_amount = get_column_value(tables[2], row_idx, "TOTALE")
                    payment_terms = get_column_value(tables[2], row_idx, "TERMINI")

                    # Create ParsedInvoice
                    invoice = ParsedInvoice(
                        id=invoice_id,
                        invoice_number=invoice_number,
                        invoice_date=invoice_date,
                        customer_account=customer_account,
                        billing_name=billing_name,
                        quantity=quantity,
                        sales_balance=sales_balance,
                        amount=amount,
                        vat_amount=vat_amount,
                        total_amount=total_amount,
                        payment_terms=payment_terms
                    )

                    yield invoice

                except Exception as e:
                    print(f"Warning: Error parsing row {row_idx} in cycle {cycle_start}: {e}", file=sys.stderr)
                    continue

            tables = None


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: parse-invoices-pdf.py <pdf_path>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        for invoice in parse_invoices_pdf(pdf_path):
            print(json.dumps(asdict(invoice), ensure_ascii=False))

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
