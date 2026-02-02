#!/usr/bin/env python3
"""
Parse Saleslines PDF (single order) - 2-table structure
Outputs JSON to stdout (one article per line)

Best practices:
- Memory optimization: yield pattern, page = None after use
- Italian number format parsing: "16,25 €" → 16.25
- JSON streaming: ensure_ascii=False for Italian chars
- Robust error handling with continue on row errors
"""

import pdfplumber
import json
import sys
import re
from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class ParsedArticle:
    """Article data from Saleslines PDF"""
    line_number: str
    article_code: str
    quantity: float
    unit_price: float
    discount_percent: float
    line_amount: float
    description: Optional[str] = None


def parse_italian_decimal(value: str) -> Optional[float]:
    """Parse Italian decimal: '16,25 €' → 16.25, '12,64 %' → 12.64"""
    if not value:
        return None
    # Remove € and % symbols and spaces
    value = value.replace('€', '').replace('%', '').strip()
    # Replace comma with dot
    value = value.replace(',', '.')
    try:
        return float(value)
    except ValueError:
        return None


def parse_saleslines_pdf(pdf_path: str):
    """
    Parse Saleslines PDF with 2-table structure.
    Yields one ParsedArticle per line.

    Table 1 (Page 1): LINEA, NOME ARTICOLO, QTÀ ORDINATA, UNITÀ DI PREZZO, SCONTO %
    Table 2 (Page 2): IMPORTO DELLA LINEA, NOME (description)
    """
    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) < 2:
            print(f"Error: PDF has less than 2 pages", file=sys.stderr)
            return

        # Extract both tables
        page1 = pdf.pages[0]
        page2 = pdf.pages[1]

        tables1 = page1.extract_tables()
        tables2 = page2.extract_tables()

        # Free memory
        page1 = None
        page2 = None

        if not tables1 or not tables2:
            print(f"Error: Missing tables in PDF", file=sys.stderr)
            return

        table1 = tables1[0]
        table2 = tables2[0]

        # Skip header rows
        if len(table1) <= 1 or len(table2) <= 1:
            return

        # Process rows (skip header at index 0, skip totals at last row)
        max_rows = min(len(table1) - 1, len(table2) - 1)  # -1 to skip "Count=11 Sum=52,00"

        for row_idx in range(1, max_rows):
            try:
                # Table 1: [LINEA, NOME ARTICOLO, QTÀ, PREZZO, SCONTO %, APPLICA SCONTO %]
                row1 = table1[row_idx] if row_idx < len(table1) else []
                line_number = (row1[0] or '').strip() if len(row1) > 0 else None
                article_code = (row1[1] or '').strip() if len(row1) > 1 else None
                quantity = parse_italian_decimal(row1[2]) if len(row1) > 2 else None
                unit_price = parse_italian_decimal(row1[3]) if len(row1) > 3 else None
                # APPLICA SCONTO % is in column 5, not column 4 (SCONTO % is always 0)
                discount_percent = parse_italian_decimal(row1[5]) if len(row1) > 5 else None

                # Table 2: [IMPORTO DELLA LINEA, PREZZO NETTO (skip), NOME]
                row2 = table2[row_idx] if row_idx < len(table2) else []
                line_amount = parse_italian_decimal(row2[0]) if len(row2) > 0 else None
                description_raw = (row2[2] or '').strip() if len(row2) > 2 else None

                # Clean description: remove article code if it appears at the start
                description = description_raw
                if description and article_code and description.startswith(article_code):
                    description = description[len(article_code):].strip()
                    # Remove leading newline if present
                    if description.startswith('\n'):
                        description = description[1:].strip()

                # Validate required fields
                if not article_code or quantity is None or unit_price is None:
                    continue

                # Validate value ranges
                if quantity <= 0:
                    print(f"Warning: Invalid quantity {quantity} at row {row_idx}, skipping", file=sys.stderr)
                    continue
                if unit_price < 0:
                    print(f"Warning: Invalid unit price {unit_price} at row {row_idx}, skipping", file=sys.stderr)
                    continue
                if discount_percent is not None and (discount_percent < 0 or discount_percent > 100):
                    print(f"Warning: Invalid discount {discount_percent}% at row {row_idx}, clamping to 0-100", file=sys.stderr)
                    discount_percent = max(0.0, min(100.0, discount_percent))

                article = ParsedArticle(
                    line_number=line_number or '',
                    article_code=article_code,
                    quantity=quantity,
                    unit_price=unit_price,
                    discount_percent=discount_percent or 0.0,
                    line_amount=line_amount or (quantity * unit_price * (1 - (discount_percent or 0) / 100)),
                    description=description
                )

                yield article

            except Exception as e:
                print(f"Warning: Error parsing row {row_idx}: {e}", file=sys.stderr)
                continue

        # Free memory
        tables1 = None
        tables2 = None


def main():
    """Main entry point - outputs JSON to stdout"""
    if len(sys.argv) < 2:
        print("Usage: parse-saleslines-pdf.py <pdf_path>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        for article in parse_saleslines_pdf(pdf_path):
            # Output one JSON object per line
            print(json.dumps(asdict(article), ensure_ascii=False))

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
