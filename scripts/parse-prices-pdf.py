#!/usr/bin/env python3
"""
Archibald Prices PDF Parser with 3-Page Cycle Support

Parses price data from Archibald PDF export with Italian locale handling.
Verified structure: 3 pages per product (ID, Description, Price).
"""

import sys
import json
import re
from PyPDF2 import PdfReader
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

@dataclass
class ParsedPrice:
    """Parsed price record from PDF (3-page cycle)"""

    # Page 1: Identificazione
    product_id: str  # ID
    item_selection: Optional[str] = None  # ITEM SELECTION (K2, K3, etc.)
    account_code: Optional[str] = None  # CODICE CONTO
    account_description: Optional[str] = None  # ACCOUNT: DESCRIZIONE

    # Page 2: Descrizione
    product_name: Optional[str] = None  # ITEM DESCRIPTION
    price_valid_from: Optional[str] = None  # DA DATA
    price_valid_to: Optional[str] = None  # DATA
    quantity_from: Optional[str] = None  # QUANTITÀ (da)
    quantity_to: Optional[str] = None  # QUANTITÀ (a)

    # Page 3: Prezzi ← KEY PAGE
    unit_price: Optional[str] = None  # IMPORTO UNITARIO (keep Italian format: "1.234,56 €")
    currency: Optional[str] = None  # VALUTA
    price_unit: Optional[str] = None  # UNITÀ DI PREZZO
    net_price_brasseler: Optional[str] = None  # PREZZO NETTO BRASSELER (keep Italian format)

class PricesPDFParser:
    """Parser for Archibald prices PDF export with 3-page cycles"""

    PAGES_PER_CYCLE = 3  # ← VERIFIED: 3 pages per product

    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.reader = PdfReader(pdf_path)
        self.total_pages = len(self.reader.pages)

    def parse(self) -> List[ParsedPrice]:
        """Parse all prices from PDF with RAM optimization"""
        prices = []
        num_cycles = self.total_pages // self.PAGES_PER_CYCLE

        for cycle_idx in range(num_cycles):
            base_page = cycle_idx * self.PAGES_PER_CYCLE

            # Parse each page in cycle (streaming, one at a time)
            try:
                page1_data = self._parse_page_1(base_page)
                page2_data = self._parse_page_2(base_page + 1)
                page3_data = self._parse_page_3(base_page + 2)

                # Combine all pages
                price = ParsedPrice(
                    **page1_data,
                    **page2_data,
                    **page3_data
                )

                # Filter garbage: ID="0" or empty, following Phase 18/19 pattern
                if price.product_id and price.product_id.strip() != "0":
                    prices.append(price)

            except Exception as e:
                # Log error but continue parsing (resilient to malformed pages)
                print(f"Warning: Failed to parse cycle {cycle_idx}: {e}", file=sys.stderr)
                continue

        return prices

    def _parse_page_1(self, page_num: int) -> Dict[str, Any]:
        """
        Parse page 1: ID, CODICE CONTO, ACCOUNT DESCRIZIONE, ITEM SELECTION
        """
        text = self.reader.pages[page_num].extract_text()

        return {
            "product_id": self._extract_field(text, "ID") or "",
            "item_selection": self._extract_field(text, "ITEM SELECTION:"),
            "account_code": self._extract_field(text, "CODICE CONTO"),
            "account_description": self._extract_field(text, "ACCOUNT: DESCRIZIONE"),
        }

    def _parse_page_2(self, page_num: int) -> Dict[str, Any]:
        """
        Parse page 2: ITEM DESCRIPTION, DA DATA, DATA, QUANTITÀ
        """
        text = self.reader.pages[page_num].extract_text()

        return {
            "product_name": self._extract_field(text, "ITEM DESCRIPTION:"),
            "price_valid_from": self._extract_field(text, "DA DATA"),
            "price_valid_to": self._extract_field(text, "DATA"),
            "quantity_from": self._extract_field(text, "QUANTITÀ"),
            "quantity_to": None,  # May need separate extraction if range exists
        }

    def _parse_page_3(self, page_num: int) -> Dict[str, Any]:
        """
        Parse page 3: IMPORTO UNITARIO (KEY FIELD), VALUTA, UNITÀ DI PREZZO, PREZZO NETTO
        Keep Italian format: "1.234,56 €" (no conversion)
        """
        text = self.reader.pages[page_num].extract_text()

        return {
            "unit_price": self._extract_field(text, "IMPORTO UNITARIO:"),
            "currency": self._extract_field(text, "VALUTA"),
            "price_unit": self._extract_field(text, "UNITÀ DI PREZZO"),
            "net_price_brasseler": self._extract_field(text, "PREZZO NETTO BRASSELER"),
        }

    def _extract_field(self, text: str, field_name: str) -> Optional[str]:
        """
        Extract field value from text after field name
        Handles both "FIELD:" and "FIELD" patterns
        """
        # Try with colon first
        pattern = rf"{re.escape(field_name)}\s*[:\s]*(.*?)(?:\n|$)"
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)

        if match:
            value = match.group(1).strip()
            return value if value else None

        # Try without colon (for fields like "VALUTA EUR")
        pattern_no_colon = rf"{re.escape(field_name)}\s+(.*?)(?:\n|$)"
        match = re.search(pattern_no_colon, text, re.IGNORECASE | re.MULTILINE)

        if match:
            value = match.group(1).strip()
            return value if value else None

        return None

def main():
    """Main entry point - outputs JSON to stdout"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing PDF path argument"}), file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        parser = PricesPDFParser(pdf_path)
        prices = parser.parse()

        # Output as JSON array (compact for performance)
        output = [asdict(p) for p in prices]
        print(json.dumps(output, ensure_ascii=False))

    except FileNotFoundError:
        print(json.dumps({"error": f"PDF file not found: {pdf_path}"}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
