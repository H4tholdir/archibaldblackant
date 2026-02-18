#!/usr/bin/env python3
"""
Archibald Prices PDF Parser with 3-Page Cycle Support using pdfplumber

Parses price data from Archibald PDF export with Italian locale handling.
Verified structure: 3 pages per cycle with table-based extraction.
"""

import sys
import json
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

try:
    import pdfplumber
except ImportError:
    print(json.dumps({"error": "pdfplumber not installed. Run: pip3 install pdfplumber"}), file=sys.stderr)
    sys.exit(1)

@dataclass
class ParsedPrice:
    """Parsed price record from PDF (3-page cycle)"""

    # Page 1: ID, CODICE CONTO, ACCOUNT:, DESCRIZIONE ACCOUNT:, ITEM SELECTION:
    id: Optional[str] = None
    codice_conto: Optional[str] = None
    account: Optional[str] = None
    descrizione_account: Optional[str] = None
    item_selection: Optional[str] = None

    # Page 2: ITEM DESCRIPTION:, DA DATA, DATA, QUANTITÀIMPORTODA (4 columns)
    item_description: Optional[str] = None
    da_data: Optional[str] = None
    data: Optional[str] = None
    quantita_p2: Optional[str] = None  # From page 2

    # Page 3: QUANTITÀIMPORTO, UNITÀ DI PREZZO, IMPORTO UNITARIO:, VALUTA, PREZZO NETTO BRASSELER (5 columns)
    quantita_p3: Optional[str] = None  # From page 3
    unita_di_prezzo: Optional[str] = None
    importo_unitario: Optional[str] = None  # KEY FIELD (Italian format: "234,59 €")
    valuta: Optional[str] = None
    prezzo_netto_brasseler: Optional[str] = None

class PricesPDFParser:
    """Parser for Archibald prices PDF export with 3-page cycles"""

    PAGES_PER_CYCLE = 3

    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path

    def _detect_cycle_size(self) -> int:
        """Auto-detect cycle size by scanning for repeated 'ID' header in first column."""
        expected = self.__class__.PAGES_PER_CYCLE
        with pdfplumber.open(self.pdf_path) as pdf:
            anchor_pages = []
            for page_idx, page in enumerate(pdf.pages):
                table = page.extract_table()
                if table and len(table) > 0:
                    header_row = table[0]
                    if header_row and len(header_row) > 0:
                        first_col = (header_row[0] or '').strip().upper()
                        if first_col == 'ID':
                            anchor_pages.append(page_idx)
                if len(anchor_pages) >= 2:
                    break

        if len(anchor_pages) >= 2:
            detected = anchor_pages[1] - anchor_pages[0]
            status = "OK" if detected == expected else "CHANGED"
            self._emit_cycle_warning(detected, expected, status)
            return detected

        self._emit_cycle_warning(expected, expected, "DETECTION_FAILED")
        return expected

    def _emit_cycle_warning(self, detected: int, expected: int, status: str) -> None:
        warning = {"parser": "prices", "detected": detected, "expected": expected, "status": status}
        print(f"CYCLE_SIZE_WARNING:{json.dumps(warning)}", file=sys.stderr)

    def parse(self) -> List[ParsedPrice]:
        """
        Parse all prices from PDF using table extraction

        Memory optimization: Re-opens PDF for each cycle to force garbage collection.
        Reduces memory from ~GB to <100MB following pdfplumber best practices.
        """
        prices = []
        self.PAGES_PER_CYCLE = self._detect_cycle_size()
        print(f"Detected cycle size: {self.PAGES_PER_CYCLE} pages", file=sys.stderr)

        try:
            # First pass: get total pages
            with pdfplumber.open(self.pdf_path) as pdf:
                total_pages = len(pdf.pages)
                num_cycles = total_pages // self.PAGES_PER_CYCLE

            # Process each cycle with fresh PDF instance (critical for memory!)
            for cycle_idx in range(num_cycles):
                # Re-open PDF for this cycle only - forces garbage collection
                with pdfplumber.open(self.pdf_path) as pdf:
                    # Calculate page indices for this cycle
                    page_1_idx = cycle_idx * self.PAGES_PER_CYCLE + 0
                    page_2_idx = cycle_idx * self.PAGES_PER_CYCLE + 1
                    page_3_idx = cycle_idx * self.PAGES_PER_CYCLE + 2

                    # Extract tables from each page
                    try:
                        table1 = pdf.pages[page_1_idx].extract_table()  # ID, ITEM SELECTION, etc.
                        table2 = pdf.pages[page_2_idx].extract_table()  # ITEM DESCRIPTION, dates
                        table3 = pdf.pages[page_3_idx].extract_table()  # IMPORTO UNITARIO (price)
                    except Exception as e:
                        print(f"Warning: Failed to extract tables for cycle {cycle_idx}: {e}", file=sys.stderr)
                        continue

                    if not table1 or not table2 or not table3:
                        print(f"Warning: Missing tables for cycle {cycle_idx}", file=sys.stderr)
                        continue

                    # Process each row (skip header at index 0)
                    for row_idx in range(1, min(len(table1), len(table2), len(table3))):
                        try:
                            row1 = table1[row_idx] if row_idx < len(table1) else []
                            row2 = table2[row_idx] if row_idx < len(table2) else []
                            row3 = table3[row_idx] if row_idx < len(table3) else []

                            # Page 1 columns: ID, CODICE CONTO, ACCOUNT:, DESCRIZIONE ACCOUNT:, ITEM SELECTION:
                            id_val = self._get_cell(row1, 0)
                            codice_conto = self._get_cell(row1, 1)
                            account = self._get_cell(row1, 2)
                            descrizione_account = self._get_cell(row1, 3)
                            item_selection = self._get_cell(row1, 4)

                            # Page 2 columns: ITEM DESCRIPTION:, DA DATA, DATA, QUANTITÀIMPORTODA (4 columns)
                            item_description = self._get_cell(row2, 0)
                            da_data = self._get_cell(row2, 1)
                            data = self._get_cell(row2, 2)
                            quantita_p2 = self._get_cell(row2, 3)

                            # Page 3 columns: QUANTITÀIMPORTO, UNITÀ DI PREZZO, IMPORTO UNITARIO:, VALUTA, PREZZO NETTO BRASSELER (5 columns)
                            quantita_p3 = self._get_cell(row3, 0)
                            unita_di_prezzo = self._get_cell(row3, 1)
                            importo_unitario = self._get_cell(row3, 2)  # KEY FIELD - the actual price!
                            valuta = self._get_cell(row3, 3)
                            prezzo_netto_brasseler = self._get_cell(row3, 4)

                            # Filter garbage: ID="0" or empty
                            if not id_val or id_val.strip() in ["0", ""]:
                                continue

                            # Create ParsedPrice object
                            price = ParsedPrice(
                                id=id_val,
                                codice_conto=codice_conto,
                                account=account,
                                descrizione_account=descrizione_account,
                                item_selection=item_selection,
                                item_description=item_description,
                                da_data=da_data,
                                data=data,
                                quantita_p2=quantita_p2,
                                quantita_p3=quantita_p3,
                                unita_di_prezzo=unita_di_prezzo,
                                importo_unitario=importo_unitario,  # Italian format preserved
                                valuta=valuta,
                                prezzo_netto_brasseler=prezzo_netto_brasseler,
                            )

                            prices.append(price)

                        except Exception as e:
                            print(f"Warning: Failed to parse row {row_idx} in cycle {cycle_idx}: {e}", file=sys.stderr)
                            continue

                # PDF context closed here, memory freed before next cycle

        except Exception as e:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
            raise

        return prices

    def _get_cell(self, row: List[Any], index: int) -> Optional[str]:
        """Safely get cell value from row, handling None and out-of-bounds"""
        if not row or index >= len(row):
            return None
        value = row[index]
        if value is None:
            return None
        return str(value).strip() if str(value).strip() else None

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
