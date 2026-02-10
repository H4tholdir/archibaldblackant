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
    # Page 1/7: FATTURA PDF, ID FATTURA, DATA FATTURA, CONTO FATTURE (4 columns)
    id: str  # ID FATTURA (internal ID)
    invoice_number: str  # e.g., "FT/26000123"
    invoice_date: Optional[str]  # ISO 8601
    customer_account: str  # CONTO FATTURE (e.g., "1002241")

    # Page 2/7: NOME DI FATTURAZIONE, QUANTITÀ, SALDO VENDITE MST (3 columns)
    billing_name: Optional[str]
    quantity: Optional[str]
    sales_balance: Optional[str]

    # Page 3/7: SOMMA LINEA, SCONTO MST, SCONTO TOTALE: SOMMA FISCALE MST, IMPORTO FATTURA MST (4 columns)
    line_sum: Optional[str]  # Italian format: "105,60 €"
    discount_amount: Optional[str]
    tax_sum: Optional[str]
    invoice_amount: Optional[str]

    # Page 4/7: ORDINE DI ACQUISTO, RIFERIMENTO CLIENTE, SCADENZA (3 columns)
    purchase_order: Optional[str]
    customer_reference: Optional[str]
    due_date: Optional[str]  # ISO 8601

    # Page 5/7: ID TERMINE DI PAGAMENTO, OLTRE I GIORNI DI SCADENZA (2 columns)
    payment_term_id: Optional[str]
    days_past_due: Optional[str]

    # Page 6/7: LIQUIDA, IMPORTO MST, IDENTIFICATIVO ULTIMO PAGAMENTO: DATA DI ULTIMA LIQUIDAZIONE (4 columns)
    settled: Optional[str]
    amount: Optional[str]
    last_payment_id: Optional[str]
    last_settlement_date: Optional[str]

    # Page 7/7: CHIUSO, IMPORTO RIMANENTE MST, ID VENDITE (3 columns)
    closed: Optional[str]
    remaining_amount: Optional[str]
    order_number: Optional[str]  # ⭐ MATCH KEY! e.g., "ORD/26000887"


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
                    # Page 1/7: FATTURA PDF, ID FATTURA, DATA FATTURA, CONTO FATTURE (4 columns)
                    # Note: ID FATTURA contains the actual invoice number (e.g., "CF1/26000113")
                    invoice_id = get_column_value(tables[0], row_idx, "ID FATTURA")
                    invoice_number = invoice_id  # Use ID FATTURA as invoice_number

                    invoice_date_raw = get_column_value(tables[0], row_idx, "DATA FATTURA")
                    invoice_date = parse_italian_date(invoice_date_raw)

                    customer_account = get_column_value(tables[0], row_idx, "CONTO FATTURE")

                    # Skip if no invoice ID or customer account
                    if not invoice_id or not customer_account:
                        continue

                    # Skip garbage rows
                    if invoice_id == "0" or invoice_number == "0":
                        continue

                    # Page 2/7: NOME DI FATTURAZIONE, QUANTITÀ, SALDO VENDITE MST (3 columns)
                    billing_name = get_column_value(tables[1], row_idx, "NOME DI FATTURAZIONE")
                    quantity = get_column_value(tables[1], row_idx, "QUANTITÀ")
                    sales_balance = get_column_value(tables[1], row_idx, "SALDO VENDITE MST")

                    # Page 3/7: SOMMA LINEA, SCONTO MST, SCONTO TOTALE: SOMMA FISCALE MST, IMPORTO FATTURA MST (4 columns)
                    line_sum = get_column_value(tables[2], row_idx, "SOMMA LINEA")
                    discount_amount = get_column_value(tables[2], row_idx, "SCONTO MST")
                    tax_sum = get_column_value(tables[2], row_idx, "SOMMA FISCALE MST")
                    invoice_amount = get_column_value(tables[2], row_idx, "IMPORTO FATTURA MST")

                    # Page 4/7: ORDINE DI ACQUISTO, RIFERIMENTO CLIENTE, SCADENZA (3 columns)
                    purchase_order = get_column_value(tables[3], row_idx, "ORDINE DI ACQUISTO")
                    customer_reference = get_column_value(tables[3], row_idx, "RIFERIMENTO CLIENTE")

                    due_date_raw = get_column_value(tables[3], row_idx, "SCADENZA")
                    due_date = parse_italian_date(due_date_raw)

                    # Page 5/7: ID TERMINE DI PAGAMENTO, OLTRE I GIORNI DI SCADENZA (2 columns)
                    payment_term_id = get_column_value(tables[4], row_idx, "ID TERMINE DI PAGAMENTO")
                    days_past_due = get_column_value(tables[4], row_idx, "OLTRE I GIORNI DI SCADENZA")

                    # Page 6/7: LIQUIDA, IMPORTO MST, IDENTIFICATIVO ULTIMO PAGAMENTO, DATA DI ULTIMA LIQUIDAZIONE (4 columns)
                    settled = get_column_value(tables[5], row_idx, "LIQUIDA")
                    amount = get_column_value(tables[5], row_idx, "IMPORTO MST")
                    last_payment_id = get_column_value(tables[5], row_idx, "IDENTIFICATIVO ULTIMO PAGAMENTO")
                    last_settlement_date_raw = get_column_value(tables[5], row_idx, "DATA DI ULTIMA LIQUIDAZIONE")
                    last_settlement_date = parse_italian_date(last_settlement_date_raw)

                    # Page 7/7: CHIUSO, IMPORTO RIMANENTE MST, ID VENDITE (3 columns)
                    closed = get_column_value(tables[6], row_idx, "CHIUSO")
                    remaining_amount = get_column_value(tables[6], row_idx, "IMPORTO RIMANENTE MST")
                    order_number = get_column_value(tables[6], row_idx, "ID VENDITE")  # ⭐ MATCH KEY!

                    # Create ParsedInvoice
                    invoice = ParsedInvoice(
                        id=invoice_id,
                        invoice_number=invoice_number,
                        invoice_date=invoice_date,
                        customer_account=customer_account,
                        billing_name=billing_name,
                        quantity=quantity,
                        sales_balance=sales_balance,
                        line_sum=line_sum,
                        discount_amount=discount_amount,
                        tax_sum=tax_sum,
                        invoice_amount=invoice_amount,
                        purchase_order=purchase_order,
                        customer_reference=customer_reference,
                        due_date=due_date,
                        payment_term_id=payment_term_id,
                        days_past_due=days_past_due,
                        settled=settled,
                        amount=amount,
                        last_payment_id=last_payment_id,
                        last_settlement_date=last_settlement_date,
                        closed=closed,
                        remaining_amount=remaining_amount,
                        order_number=order_number
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
