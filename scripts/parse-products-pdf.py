#!/usr/bin/env python3
"""
OPTIMIZED PDF Products Parser - Memory-efficient streaming parser

Key optimizations:
1. Process 8-page cycles one at a time (not all pages at once)
2. Yield products as generator to avoid building huge list in memory
3. Clear cycle data after processing to free memory
4. Target: <500MB RAM usage (down from 7GB)

Usage:
    python3 parse-products-pdf-optimized.py <path-to-pdf>

Example:
    python3 parse-products-pdf-optimized.py Prodotti.pdf > products.json
"""

import sys
import json
import re
from typing import List, Dict, Any, Optional, Generator
from dataclasses import dataclass, asdict
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print(json.dumps({"error": "pdfplumber not installed. Run: pip3 install pdfplumber"}))
    sys.exit(1)


@dataclass
class ParsedProduct:
    """Structured product data from PDF (8-page cycle)"""
    # Page 1 fields (0)
    id_articolo: str
    nome_articolo: str
    descrizione: Optional[str] = None

    # Page 2 fields (1)
    gruppo_articolo: Optional[str] = None
    contenuto_imballaggio: Optional[str] = None
    nome_ricerca: Optional[str] = None

    # Page 3 fields (2)
    unita_prezzo: Optional[str] = None
    id_gruppo_prodotti: Optional[str] = None
    descrizione_gruppo_articolo: Optional[str] = None
    qta_minima: Optional[str] = None

    # Page 4 fields (3)
    qta_multipli: Optional[str] = None
    qta_massima: Optional[str] = None
    figura: Optional[str] = None
    id_blocco_articolo: Optional[str] = None
    pacco_gamba: Optional[str] = None

    # Page 5 fields (4)
    grandezza: Optional[str] = None
    id_configurazione: Optional[str] = None
    creato_da: Optional[str] = None
    data_creata: Optional[str] = None
    dataareaid: Optional[str] = None

    # Page 6 fields (5)
    qta_predefinita: Optional[str] = None
    visualizza_numero_prodotto: Optional[str] = None
    sconto_assoluto_totale: Optional[str] = None
    id_prodotto: Optional[str] = None

    # Page 7 fields (6)
    sconto_linea: Optional[str] = None
    modificato_da: Optional[str] = None
    datetime_modificato: Optional[str] = None
    articolo_ordinabile: Optional[str] = None

    # Page 8 fields (7)
    purch_price: Optional[str] = None
    pcs_id_configurazione_standard: Optional[str] = None
    qta_standard: Optional[str] = None
    fermato: Optional[str] = None
    id_unita: Optional[str] = None


class ProductsPDFParserOptimized:
    """Memory-efficient streaming parser for Archibald products PDF export"""

    PAGES_PER_CYCLE = 8

    def __init__(self, pdf_path: str):
        self.pdf_path = Path(pdf_path)
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

    def _detect_cycle_size(self) -> int:
        """Auto-detect cycle size by scanning for repeated 'ID ARTICOLO' header in first column."""
        expected = self.__class__.PAGES_PER_CYCLE
        with pdfplumber.open(self.pdf_path) as pdf:
            anchor_pages = []
            for page_idx, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                if tables and len(tables[0]) > 0:
                    header_row = tables[0][0]
                    if header_row and len(header_row) > 0:
                        first_col = (header_row[0] or '').strip().upper()
                        if first_col == 'ID ARTICOLO':
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
        warning = {"parser": "products", "detected": detected, "expected": expected, "status": status}
        print(f"CYCLE_SIZE_WARNING:{json.dumps(warning)}", file=sys.stderr)

    def parse_streaming(self) -> Generator[ParsedProduct, None, None]:
        """
        Memory-efficient streaming parser that yields products one by one.
        Processes N-page cycles incrementally to minimize memory usage.

        KEY OPTIMIZATION: Re-opens PDF for each cycle to force garbage collection.
        This reduces memory from ~9GB to ~450-500MB per the pdfplumber workaround:
        https://github.com/jsvine/pdfplumber/issues/193
        """
        self.PAGES_PER_CYCLE = self._detect_cycle_size()
        print(f"Detected cycle size: {self.PAGES_PER_CYCLE} pages", file=sys.stderr)

        # First pass: get total pages
        with pdfplumber.open(self.pdf_path) as pdf:
            total_pages = len(pdf.pages)
            cycles = total_pages // self.PAGES_PER_CYCLE

        # Process each cycle with fresh PDF instance (critical for memory!)
        for cycle in range(cycles):
            base_idx = cycle * self.PAGES_PER_CYCLE

            # Re-open PDF for this cycle only - forces garbage collection
            with pdfplumber.open(self.pdf_path) as pdf:
                # Extract tables for this cycle only (not all pages!)
                cycle_tables = []
                for offset in range(self.PAGES_PER_CYCLE):
                    page_idx = base_idx + offset
                    if page_idx < total_pages:
                        page = pdf.pages[page_idx]
                        tables = page.extract_tables()
                        if tables:
                            # Skip header row, get data rows only
                            table_data = tables[0][1:] if len(tables[0]) > 1 else []
                            cycle_tables.append(table_data)
                        else:
                            cycle_tables.append([])
                    else:
                        cycle_tables.append([])

            # Parse this cycle and yield products
            # (PDF context closed here, memory freed before next cycle)
            products = self._parse_single_cycle(cycle_tables)
            for product in products:
                yield product

            # Clear cycle data to free memory
            del cycle_tables

    def parse(self) -> List[ParsedProduct]:
        """
        Parse all products (for backward compatibility).
        Note: Uses streaming internally but collects all results.
        For memory efficiency, use parse_streaming() directly.
        """
        return list(self.parse_streaming())

    def _parse_single_cycle(self, cycle_tables: List[List[List[str]]]) -> List[ParsedProduct]:
        """Parse a single 8-page cycle and return products"""
        products = []

        if len(cycle_tables) != self.PAGES_PER_CYCLE:
            return products

        # Get data for all 8 pages
        page0_data, page1_data, page2_data, page3_data = cycle_tables[0:4]
        page4_data, page5_data, page6_data, page7_data = cycle_tables[4:8]

        # All pages should have same number of rows
        max_rows = max(
            len(page0_data), len(page1_data), len(page2_data), len(page3_data),
            len(page4_data), len(page5_data), len(page6_data), len(page7_data)
        )

        # Combine data row by row
        for row_idx in range(max_rows):
            page0 = page0_data[row_idx] if row_idx < len(page0_data) else []
            page1 = page1_data[row_idx] if row_idx < len(page1_data) else []
            page2 = page2_data[row_idx] if row_idx < len(page2_data) else []
            page3 = page3_data[row_idx] if row_idx < len(page3_data) else []
            page4 = page4_data[row_idx] if row_idx < len(page4_data) else []
            page5 = page5_data[row_idx] if row_idx < len(page5_data) else []
            page6 = page6_data[row_idx] if row_idx < len(page6_data) else []
            page7 = page7_data[row_idx] if row_idx < len(page7_data) else []

            # Combine all fields from 8 pages
            page1_fields = self._parse_page_1(page1)
            page2_fields = self._parse_page_2(page2)
            page3_fields = self._parse_page_3(page3)
            page4_fields = self._parse_page_4(page4)
            page5_fields = self._parse_page_5(page5)
            page6_fields = self._parse_page_6(page6)
            page7_fields = self._parse_page_7(page7)

            # Page 0 has ID + Name + Description
            id_articolo = (page0[0] or '').strip() if len(page0) > 0 else None
            nome_articolo = (page0[1] or '').strip() if len(page0) > 1 else None
            descrizione = (page0[2] or '').strip() if len(page0) > 2 else None

            if id_articolo and nome_articolo:
                product = ParsedProduct(
                    id_articolo=id_articolo,
                    nome_articolo=nome_articolo,
                    descrizione=descrizione,
                    **page1_fields,
                    **page2_fields,
                    **page3_fields,
                    **page4_fields,
                    **page5_fields,
                    **page6_fields,
                    **page7_fields,
                )
                products.append(product)

        return products

    def _parse_page_1(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 2: GRUPPO ARTICOLO, IMMAGINE, CONTENUTO DELL'IMBALLAGGIO, NOME DELLA RICERCA
        Columns: [GRUPPO_ARTICOLO, IMMAGINE (skip), CONTENUTO_IMBALLAGGIO, NOME_RICERCA]
        Note: IMMAGINE field (col 1) is skipped per user requirement
        """
        gruppo_articolo = (row[0] or '').strip() if len(row) > 0 else None
        # Skip IMMAGINE field (col 1) - contains System.Byte[]
        contenuto_imballaggio = (row[2] or '').strip() if len(row) > 2 else None
        nome_ricerca = (row[3] or '').strip() if len(row) > 3 else None

        return {
            'gruppo_articolo': gruppo_articolo,
            'contenuto_imballaggio': contenuto_imballaggio,
            'nome_ricerca': nome_ricerca,
        }

    def _parse_page_2(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 3: UNITÀ DI PREZZO, ID GRUPPO DI PRODOTTI, DESCRIZIONE GRUPPO ARTICOLO, QTÀ MINIMA"""
        unita_prezzo = (row[0] or '').strip() if len(row) > 0 else None
        id_gruppo_prodotti = (row[1] or '').strip() if len(row) > 1 else None
        descrizione_gruppo_articolo = (row[2] or '').strip() if len(row) > 2 else None
        qta_minima = (row[3] or '').strip() if len(row) > 3 else None

        return {
            'unita_prezzo': unita_prezzo,
            'id_gruppo_prodotti': id_gruppo_prodotti,
            'descrizione_gruppo_articolo': descrizione_gruppo_articolo,
            'qta_minima': qta_minima,
        }

    def _parse_page_3(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 4: QTÀ MULTIPLI, QTÀ MASSIMA, FIGURA, ID IN BLOCCO DELL'ARTICOLO, PACCO, GAMBA
        Columns: [QTA_MULTIPLI, QTA_MASSIMA, FIGURA, ID_BLOCCO_ARTICOLO, PACCO, GAMBA]
        Note: PACCO (col 4) and GAMBA (col 5) are combined into pacco_gamba
        """
        qta_multipli = (row[0] or '').strip() if len(row) > 0 else None
        qta_massima = (row[1] or '').strip() if len(row) > 1 else None
        figura = (row[2] or '').strip() if len(row) > 2 else None
        id_blocco_articolo = (row[3] or '').strip() if len(row) > 3 else None

        # Combine PACCO (col 4) and GAMBA (col 5) into pacco_gamba
        pacco = (row[4] or '').strip() if len(row) > 4 else ''
        gamba = (row[5] or '').strip() if len(row) > 5 else ''
        pacco_gamba = f"{pacco}{gamba}".strip() if pacco or gamba else None

        return {
            'qta_multipli': qta_multipli,
            'qta_massima': qta_massima,
            'figura': figura,
            'id_blocco_articolo': id_blocco_articolo,
            'pacco_gamba': pacco_gamba,
        }

    def _parse_page_4(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 5: GRANDEZZA, ID DI CONFIGURAZIONE, CREATO DA, DATA CREATA, DATAAREAID"""
        grandezza = (row[0] or '').strip() if len(row) > 0 else None
        id_configurazione = (row[1] or '').strip() if len(row) > 1 else None
        creato_da = (row[2] or '').strip() if len(row) > 2 else None
        data_creata = (row[3] or '').strip() if len(row) > 3 else None
        dataareaid = (row[4] or '').strip() if len(row) > 4 else None

        return {
            'grandezza': grandezza,
            'id_configurazione': id_configurazione,
            'creato_da': creato_da,
            'data_creata': data_creata,
            'dataareaid': dataareaid,
        }

    def _parse_page_5(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 6: QTÀ PREDEFINITA, VISUALIZZA IL NUMERO DI PRODOTTO, SCONTO ASSOLUTO TOTALE, ID"""
        qta_predefinita = (row[0] or '').strip() if len(row) > 0 else None
        visualizza_numero_prodotto = (row[1] or '').strip() if len(row) > 1 else None
        sconto_assoluto_totale = (row[2] or '').strip() if len(row) > 2 else None
        id_prodotto = (row[3] or '').strip() if len(row) > 3 else None

        return {
            'qta_predefinita': qta_predefinita,
            'visualizza_numero_prodotto': visualizza_numero_prodotto,
            'sconto_assoluto_totale': sconto_assoluto_totale,
            'id_prodotto': id_prodotto,
        }

    def _parse_page_6(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 7: SCONTO LINEA, MODIFICATO DA, DATETIME MODIFICATO, ARTICOLO ORDINABILE"""
        sconto_linea = (row[0] or '').strip() if len(row) > 0 else None
        modificato_da = (row[1] or '').strip() if len(row) > 1 else None
        datetime_modificato = (row[2] or '').strip() if len(row) > 2 else None
        articolo_ordinabile = (row[3] or '').strip() if len(row) > 3 else None

        return {
            'sconto_linea': sconto_linea,
            'modificato_da': modificato_da,
            'datetime_modificato': datetime_modificato,
            'articolo_ordinabile': articolo_ordinabile,
        }

    def _parse_page_7(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 8: PURCH PRICE, PCS ID DI CONFIGURAZIONE STANDARD, QTÀ STANDARD, FERMATO, ID UNITÀ"""
        purch_price = (row[0] or '').strip() if len(row) > 0 else None
        pcs_id_configurazione_standard = (row[1] or '').strip() if len(row) > 1 else None
        qta_standard = (row[2] or '').strip() if len(row) > 2 else None
        fermato = (row[3] or '').strip() if len(row) > 3 else None
        id_unita = (row[4] or '').strip() if len(row) > 4 else None

        return {
            'purch_price': purch_price,
            'pcs_id_configurazione_standard': pcs_id_configurazione_standard,
            'qta_standard': qta_standard,
            'fermato': fermato,
            'id_unita': id_unita,
        }


def main():
    if len(sys.argv) != 2:
        print(json.dumps({
            "error": "Usage: python3 parse-products-pdf-optimized.py <path-to-pdf>"
        }))
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        parser = ProductsPDFParserOptimized(pdf_path)

        # Use streaming to minimize memory
        products_list = []
        for product in parser.parse_streaming():
            products_list.append(asdict(product))

        # Output as JSON
        output = {
            "products": products_list,
            "count": len(products_list),
            "source": pdf_path,
        }

        print(json.dumps(output, indent=2, ensure_ascii=False))

    except FileNotFoundError as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Parse failed: {str(e)}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
