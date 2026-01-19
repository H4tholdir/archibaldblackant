#!/usr/bin/env python3
"""
PDF Products Parser - Extracts structured product data from Archibald PDF exports

Parses Archibald "Prodotti.pdf" export with 8-page cycles per product.
Extracts all 26+ business fields across 8 pages.

Usage:
    python3 parse-products-pdf.py <path-to-pdf>

Example:
    python3 parse-products-pdf.py Prodotti.pdf > products.json
"""

import sys
import json
import re
from typing import List, Dict, Any, Optional
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
    # Page 1 fields
    id_articolo: str
    nome_articolo: str
    descrizione: Optional[str] = None

    # Page 2 fields
    gruppo_articolo: Optional[str] = None
    contenuto_imballaggio: Optional[str] = None
    nome_ricerca: Optional[str] = None

    # Page 3 fields
    unita_prezzo: Optional[str] = None
    id_gruppo_prodotti: Optional[str] = None
    descrizione_gruppo_articolo: Optional[str] = None
    qta_minima: Optional[str] = None

    # Page 4 fields
    qta_multipli: Optional[str] = None
    qta_massima: Optional[str] = None
    figura: Optional[str] = None
    id_blocco_articolo: Optional[str] = None
    pacco_gamba: Optional[str] = None

    # Page 5 fields
    grandezza: Optional[str] = None
    id_configurazione: Optional[str] = None
    creato_da: Optional[str] = None
    data_creata: Optional[str] = None
    dataareaid: Optional[str] = None

    # Page 6 fields
    qta_predefinita: Optional[str] = None
    visualizza_numero_prodotto: Optional[str] = None
    sconto_assoluto_totale: Optional[str] = None
    id_prodotto: Optional[str] = None

    # Page 7 fields
    sconto_linea: Optional[str] = None
    modificato_da: Optional[str] = None
    datetime_modificato: Optional[str] = None
    articolo_ordinabile: Optional[str] = None

    # Page 8 fields
    purch_price: Optional[str] = None
    pcs_id_configurazione_standard: Optional[str] = None
    qta_standard: Optional[str] = None
    fermato: Optional[str] = None
    id_unita: Optional[str] = None


class ProductsPDFParser:
    """Parser for Archibald products PDF export with 8-page cycles"""

    PAGES_PER_CYCLE = 8

    def __init__(self, pdf_path: str):
        self.pdf_path = Path(pdf_path)
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

    def parse(self) -> List[ParsedProduct]:
        """Parse all products from PDF using table extraction"""
        with pdfplumber.open(self.pdf_path) as pdf:
            total_pages = len(pdf.pages)

            # Extract tables from all pages
            all_tables = []
            for page_num in range(total_pages):
                page = pdf.pages[page_num]
                tables = page.extract_tables()

                if tables:
                    # Get first (and usually only) table on page
                    table = tables[0]
                    all_tables.append(table)
                else:
                    # No table found, append empty
                    all_tables.append([])

        # PDF has 8-page cycles
        products = self._parse_cyclic_tables(all_tables)

        return products

    def _parse_cyclic_tables(self, all_tables: List[List[List[str]]]) -> List[ParsedProduct]:
        """Parse tables in 8-page cycles and combine data"""
        products = []

        num_pages = len(all_tables)
        cycles = num_pages // self.PAGES_PER_CYCLE

        for cycle in range(cycles):
            base_idx = cycle * self.PAGES_PER_CYCLE

            # Get tables for this cycle (skip headers)
            page0_data = all_tables[base_idx][1:] if len(all_tables[base_idx]) > 1 else []
            page1_data = all_tables[base_idx + 1][1:] if len(all_tables[base_idx + 1]) > 1 else []
            page2_data = all_tables[base_idx + 2][1:] if len(all_tables[base_idx + 2]) > 1 else []
            page3_data = all_tables[base_idx + 3][1:] if len(all_tables[base_idx + 3]) > 1 else []
            page4_data = all_tables[base_idx + 4][1:] if len(all_tables[base_idx + 4]) > 1 else []
            page5_data = all_tables[base_idx + 5][1:] if len(all_tables[base_idx + 5]) > 1 else []
            page6_data = all_tables[base_idx + 6][1:] if len(all_tables[base_idx + 6]) > 1 else []
            page7_data = all_tables[base_idx + 7][1:] if len(all_tables[base_idx + 7]) > 1 else []

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

                # Parse each page's columns
                page1_fields = self._parse_page_1(page0)
                page2_fields = self._parse_page_2(page1)
                page3_fields = self._parse_page_3(page2)
                page4_fields = self._parse_page_4(page3)
                page5_fields = self._parse_page_5(page4)
                page6_fields = self._parse_page_6(page5)
                page7_fields = self._parse_page_7(page6)
                page8_fields = self._parse_page_8(page7)

                # Combine all pages into single product
                product = ParsedProduct(
                    **page1_fields,
                    **page2_fields,
                    **page3_fields,
                    **page4_fields,
                    **page5_fields,
                    **page6_fields,
                    **page7_fields,
                    **page8_fields
                )

                # Filter garbage records (ID = "0" or empty)
                if product.id_articolo and product.id_articolo.strip() and product.id_articolo.strip() != "0":
                    # Also filter footer rows
                    if not product.id_articolo.startswith('Count='):
                        products.append(product)

        return products

    def _parse_page_1(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 1: ID ARTICOLO, NOME ARTICOLO, DESCRIZIONE
        Columns: [ID_ARTICOLO, NOME_ARTICOLO, DESCRIZIONE]
        """
        id_articolo = (row[0] or '').strip() if len(row) > 0 else ''
        nome_articolo = (row[1] or '').strip() if len(row) > 1 else ''
        descrizione = (row[2] or '').strip() if len(row) > 2 else None

        # Clean empty strings to None
        descrizione = descrizione if descrizione else None

        return {
            'id_articolo': id_articolo,
            'nome_articolo': nome_articolo,
            'descrizione': descrizione
        }

    def _parse_page_2(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 2: GRUPPO ARTICOLO, CONTENUTO DELL'IMBALLAGGIO, NOME DELLA RICERCA
        Columns: [GRUPPO_ARTICOLO, CONTENUTO_IMBALLAGGIO, NOME_RICERCA]
        Note: IMMAGINE field is skipped per user requirement
        """
        gruppo_articolo = (row[0] or '').strip() if len(row) > 0 else None
        # Skip IMMAGINE field - not storing images
        contenuto_imballaggio = (row[1] or '').strip() if len(row) > 1 else None
        nome_ricerca = (row[2] or '').strip() if len(row) > 2 else None

        # Clean empty strings to None
        gruppo_articolo = gruppo_articolo if gruppo_articolo else None
        contenuto_imballaggio = contenuto_imballaggio if contenuto_imballaggio else None
        nome_ricerca = nome_ricerca if nome_ricerca else None

        return {
            'gruppo_articolo': gruppo_articolo,
            'contenuto_imballaggio': contenuto_imballaggio,
            'nome_ricerca': nome_ricerca
        }

    def _parse_page_3(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 3: UNITÀ DI PREZZO, ID GRUPPO DI PRODOTTI, DESCRIZIONE GRUPPO ARTICOLO, QTÀ MINIMA
        Columns: [UNITA_PREZZO, ID_GRUPPO_PRODOTTI, DESCRIZIONE_GRUPPO_ARTICOLO, QTA_MINIMA]
        """
        unita_prezzo = (row[0] or '').strip() if len(row) > 0 else None
        id_gruppo_prodotti = (row[1] or '').strip() if len(row) > 1 else None
        descrizione_gruppo_articolo = (row[2] or '').strip() if len(row) > 2 else None
        qta_minima = (row[3] or '').strip() if len(row) > 3 else None

        # Clean empty strings to None
        unita_prezzo = unita_prezzo if unita_prezzo else None
        id_gruppo_prodotti = id_gruppo_prodotti if id_gruppo_prodotti else None
        descrizione_gruppo_articolo = descrizione_gruppo_articolo if descrizione_gruppo_articolo else None
        qta_minima = qta_minima if qta_minima else None

        return {
            'unita_prezzo': unita_prezzo,
            'id_gruppo_prodotti': id_gruppo_prodotti,
            'descrizione_gruppo_articolo': descrizione_gruppo_articolo,
            'qta_minima': qta_minima
        }

    def _parse_page_4(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 4: QTÀ MULTIPLI, QTÀ MASSIMA, FIGURA, ID IN BLOCCO DELL'ARTICOLO, PACCO GAMBA
        Columns: [QTA_MULTIPLI, QTA_MASSIMA, FIGURA, ID_BLOCCO_ARTICOLO, PACCO_GAMBA]
        """
        qta_multipli = (row[0] or '').strip() if len(row) > 0 else None
        qta_massima = (row[1] or '').strip() if len(row) > 1 else None
        figura = (row[2] or '').strip() if len(row) > 2 else None
        id_blocco_articolo = (row[3] or '').strip() if len(row) > 3 else None
        pacco_gamba = (row[4] or '').strip() if len(row) > 4 else None

        # Clean empty strings to None
        qta_multipli = qta_multipli if qta_multipli else None
        qta_massima = qta_massima if qta_massima else None
        figura = figura if figura else None
        id_blocco_articolo = id_blocco_articolo if id_blocco_articolo else None
        pacco_gamba = pacco_gamba if pacco_gamba else None

        return {
            'qta_multipli': qta_multipli,
            'qta_massima': qta_massima,
            'figura': figura,
            'id_blocco_articolo': id_blocco_articolo,
            'pacco_gamba': pacco_gamba
        }

    def _parse_page_5(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 5: GRANDEZZA, ID DI CONFIGURAZIONE, CREATO DA, DATA CREATA, DATAAREAID
        Columns: [GRANDEZZA, ID_CONFIGURAZIONE, CREATO_DA, DATA_CREATA, DATAAREAID]
        """
        grandezza = (row[0] or '').strip() if len(row) > 0 else None
        id_configurazione = (row[1] or '').strip() if len(row) > 1 else None
        creato_da = (row[2] or '').strip() if len(row) > 2 else None
        data_creata = (row[3] or '').strip() if len(row) > 3 else None
        dataareaid = (row[4] or '').strip() if len(row) > 4 else None

        # Clean empty strings to None
        grandezza = grandezza if grandezza else None
        id_configurazione = id_configurazione if id_configurazione else None
        creato_da = creato_da if creato_da else None
        data_creata = data_creata if data_creata else None
        dataareaid = dataareaid if dataareaid else None

        return {
            'grandezza': grandezza,
            'id_configurazione': id_configurazione,
            'creato_da': creato_da,
            'data_creata': data_creata,
            'dataareaid': dataareaid
        }

    def _parse_page_6(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 6: QTÀ PREDEFINITA, VISUALIZZA IL NUMERO DI PRODOTTO, SCONTO ASSOLUTO TOTALE, ID
        Columns: [QTA_PREDEFINITA, VISUALIZZA_NUMERO_PRODOTTO, SCONTO_ASSOLUTO_TOTALE, ID]
        """
        qta_predefinita = (row[0] or '').strip() if len(row) > 0 else None
        visualizza_numero_prodotto = (row[1] or '').strip() if len(row) > 1 else None
        sconto_assoluto_totale = (row[2] or '').strip() if len(row) > 2 else None
        id_prodotto = (row[3] or '').strip() if len(row) > 3 else None

        # Clean empty strings to None
        qta_predefinita = qta_predefinita if qta_predefinita else None
        visualizza_numero_prodotto = visualizza_numero_prodotto if visualizza_numero_prodotto else None
        sconto_assoluto_totale = sconto_assoluto_totale if sconto_assoluto_totale else None
        id_prodotto = id_prodotto if id_prodotto else None

        return {
            'qta_predefinita': qta_predefinita,
            'visualizza_numero_prodotto': visualizza_numero_prodotto,
            'sconto_assoluto_totale': sconto_assoluto_totale,
            'id_prodotto': id_prodotto
        }

    def _parse_page_7(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 7: SCONTO LINEA, MODIFICATO DA, DATETIME MODIFICATO, ARTICOLO ORDINABILE
        Columns: [SCONTO_LINEA, MODIFICATO_DA, DATETIME_MODIFICATO, ARTICOLO_ORDINABILE]
        """
        sconto_linea = (row[0] or '').strip() if len(row) > 0 else None
        modificato_da = (row[1] or '').strip() if len(row) > 1 else None
        datetime_modificato = (row[2] or '').strip() if len(row) > 2 else None
        articolo_ordinabile = (row[3] or '').strip() if len(row) > 3 else None

        # Clean empty strings to None
        sconto_linea = sconto_linea if sconto_linea else None
        modificato_da = modificato_da if modificato_da else None
        datetime_modificato = datetime_modificato if datetime_modificato else None
        articolo_ordinabile = articolo_ordinabile if articolo_ordinabile else None

        return {
            'sconto_linea': sconto_linea,
            'modificato_da': modificato_da,
            'datetime_modificato': datetime_modificato,
            'articolo_ordinabile': articolo_ordinabile
        }

    def _parse_page_8(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 8: PURCH PRICE, PCS ID DI CONFIGURAZIONE STANDARD, QTÀ STANDARD, FERMATO, ID UNITÀ
        Columns: [PURCH_PRICE, PCS_ID_CONFIGURAZIONE_STANDARD, QTA_STANDARD, FERMATO, ID_UNITA]
        """
        purch_price = (row[0] or '').strip() if len(row) > 0 else None
        pcs_id_configurazione_standard = (row[1] or '').strip() if len(row) > 1 else None
        qta_standard = (row[2] or '').strip() if len(row) > 2 else None
        fermato = (row[3] or '').strip() if len(row) > 3 else None
        id_unita = (row[4] or '').strip() if len(row) > 4 else None

        # Clean empty strings to None
        purch_price = purch_price if purch_price else None
        pcs_id_configurazione_standard = pcs_id_configurazione_standard if pcs_id_configurazione_standard else None
        qta_standard = qta_standard if qta_standard else None
        fermato = fermato if fermato else None
        id_unita = id_unita if id_unita else None

        return {
            'purch_price': purch_price,
            'pcs_id_configurazione_standard': pcs_id_configurazione_standard,
            'qta_standard': qta_standard,
            'fermato': fermato,
            'id_unita': id_unita
        }


def main():
    """Main CLI entry point"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing PDF path argument"}))
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        parser = ProductsPDFParser(pdf_path)
        products = parser.parse()

        # Output as JSON array (compact for Node.js consumption)
        output = [asdict(p) for p in products]
        print(json.dumps(output, ensure_ascii=False, indent=2))

    except FileNotFoundError:
        print(json.dumps({"error": f"PDF file not found: {pdf_path}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
