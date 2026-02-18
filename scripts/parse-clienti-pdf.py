#!/usr/bin/env python3
"""
PDF Customer Parser - Using pdfplumber for accurate table extraction

Parses Archibald "Clienti.pdf" export and extracts structured customer data.
Uses pdfplumber to preserve column positions and table structure.

Usage:
    python3 parse-clienti-pdf.py <path-to-pdf> [--output json|csv]

Example:
    python3 parse-clienti-pdf.py Clienti.pdf --output json > customers.json
"""

import sys
import json
import re
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("Error: pdfplumber not installed. Run: pip3 install pdfplumber", file=sys.stderr)
    sys.exit(1)


@dataclass
class ParsedCustomer:
    """Structured customer data from PDF"""
    customer_profile: str  # ID PROFILO CLIENTE
    name: str  # NOME
    vat_number: Optional[str] = None  # PARTITA IVA
    pec: Optional[str] = None  # PEC
    sdi: Optional[str] = None  # SDI
    fiscal_code: Optional[str] = None  # CODICE FISCALE
    delivery_terms: Optional[str] = None  # TERMINI DI CONSEGNA
    street: Optional[str] = None  # VIA
    logistics_address: Optional[str] = None  # INDIRIZZO LOGISTICO
    postal_code: Optional[str] = None  # CAP
    city: Optional[str] = None  # CITTÀ
    phone: Optional[str] = None  # TELEFONO
    mobile: Optional[str] = None  # CELLULARE
    url: Optional[str] = None  # URL
    attention_to: Optional[str] = None  # ALL'ATTENZIONE DI
    last_order_date: Optional[str] = None  # DATA DELL'ULTIMO ORDINE
    # Page 4: Order Analytics
    actual_order_count: Optional[int] = None  # CONTEGGI DEGLI ORDINI EFFETTIVI
    actual_sales: Optional[float] = None  # VENDITE ATTUALI (€)
    previous_order_count_1: Optional[int] = None  # CONTEGGIO DEGLI ORDINI PRECEDENTE
    # Page 5: Sales Analytics
    previous_sales_1: Optional[float] = None  # VENDITE PRECEDENTE
    previous_order_count_2: Optional[int] = None  # CONTEGGIO DEGLI ORDINI PRECEDENTE 2
    previous_sales_2: Optional[float] = None  # VENDITE PRECEDENTE
    # Page 7: Business Info & Accounts
    description: Optional[str] = None  # DESCRIZIONE
    type: Optional[str] = None  # TYPE
    external_account_number: Optional[str] = None  # NUMERO DI CONTO ESTERNO
    # Page 8: Internal Account
    our_account_number: Optional[str] = None  # IL NOSTRO NUMERO DI CONTO

    def to_dict(self) -> dict:
        """Convert to dictionary, excluding None values"""
        return {k: v for k, v in asdict(self).items() if v is not None}


class CustomerPDFParser:
    """Parser for Archibald Customer PDF exports using pdfplumber"""

    def __init__(self, pdf_path: str):
        self.pdf_path = Path(pdf_path)
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

    def _detect_cycle_size(self) -> int:
        """Auto-detect cycle size by scanning for repeated 'ID' header in first column."""
        with pdfplumber.open(self.pdf_path) as pdf:
            id_header_pages = []
            for page_idx, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                if tables and len(tables[0]) > 0:
                    header_row = tables[0][0]
                    if header_row and len(header_row) > 0:
                        first_col = (header_row[0] or '').strip().upper()
                        if first_col == 'ID':
                            id_header_pages.append(page_idx)
                if len(id_header_pages) >= 2:
                    break

        if len(id_header_pages) >= 2:
            return id_header_pages[1] - id_header_pages[0]

        return 9

    def parse(self) -> List[ParsedCustomer]:
        """
        Parse PDF and return list of structured customers

        Memory optimization: Re-opens PDF for each cycle to force garbage collection.
        Reduces memory from ~GB to <100MB following pdfplumber best practices.
        """
        customers = []

        cycle_size = self._detect_cycle_size()
        print(f"Detected cycle size: {cycle_size} pages", file=sys.stderr)

        # First pass: get total pages
        with pdfplumber.open(self.pdf_path) as pdf:
            total_pages = len(pdf.pages)
            cycles = total_pages // cycle_size

        # Process each cycle with fresh PDF instance (critical for memory!)
        for cycle in range(cycles):
            base_idx = cycle * cycle_size

            # Re-open PDF for this cycle only - forces garbage collection
            with pdfplumber.open(self.pdf_path) as pdf:
                # Extract tables for this cycle only (not all pages!)
                cycle_tables = []
                for offset in range(cycle_size):
                    page_idx = base_idx + offset
                    if page_idx < total_pages:
                        page = pdf.pages[page_idx]
                        tables = page.extract_tables()
                        if tables:
                            # Get first table, skip header row
                            table_data = tables[0][1:] if len(tables[0]) > 1 else []
                            cycle_tables.append(table_data)
                        else:
                            cycle_tables.append([])
                    else:
                        cycle_tables.append([])

            # Parse this cycle and add customers
            # (PDF context closed here, memory freed before next cycle)
            cycle_customers = self._parse_single_cycle(cycle_tables, cycle_size)
            customers.extend(cycle_customers)

        return customers

    def _parse_single_cycle(self, cycle_tables: List[List[List[str]]], cycle_size: int) -> List[ParsedCustomer]:
        """Parse a single N-page cycle and return customers"""
        customers = []

        if len(cycle_tables) != cycle_size:
            return customers

        # Get data for all pages (headers already skipped)
        page0_data = cycle_tables[0]
        page1_data = cycle_tables[1]
        page2_data = cycle_tables[2]
        page3_data = cycle_tables[3]
        page4_data = cycle_tables[4]
        page5_data = cycle_tables[5]
        page6_data = cycle_tables[6]
        page7_data = cycle_tables[7]
        page8_data = cycle_tables[8] if cycle_size >= 9 else []

        # All pages should have same number of rows
        all_pages = [page0_data, page1_data, page2_data, page3_data,
                     page4_data, page5_data, page6_data, page7_data]
        if page8_data:
            all_pages.append(page8_data)
        max_rows = max(len(p) for p in all_pages)

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
            page8 = page8_data[row_idx] if row_idx < len(page8_data) else []

            # Parse each page's columns
            ids_data = self._parse_page0(page0)
            fiscal_data = self._parse_page1(page1)
            address_data = self._parse_page2(page2)
            contact_data = self._parse_page3(page3)
            order_data = self._parse_page4(page4)
            sales1_data = self._parse_page5(page5)
            sales2_data = self._parse_page6(page6)
            business_data = self._parse_page7(page7)
            account_data = self._parse_page8(page8)

            # Combine into customer object
            customer = ParsedCustomer(
                customer_profile=ids_data.get('customer_profile', ''),
                name=ids_data.get('name', ''),
                vat_number=ids_data.get('vat_number'),
                pec=fiscal_data.get('pec'),
                sdi=fiscal_data.get('sdi'),
                fiscal_code=fiscal_data.get('fiscal_code'),
                delivery_terms=fiscal_data.get('delivery_terms'),
                street=address_data.get('street'),
                logistics_address=address_data.get('logistics_address'),
                postal_code=address_data.get('postal_code'),
                city=address_data.get('city'),
                phone=contact_data.get('phone'),
                mobile=contact_data.get('mobile'),
                url=contact_data.get('url'),
                attention_to=contact_data.get('attention_to'),
                last_order_date=order_data.get('last_order_date'),
                actual_order_count=order_data.get('actual_order_count'),
                actual_sales=order_data.get('actual_sales'),
                previous_order_count_1=sales1_data.get('previous_order_count_1'),
                previous_sales_1=sales1_data.get('previous_sales_1'),
                previous_order_count_2=sales2_data.get('previous_order_count_2'),
                previous_sales_2=sales2_data.get('previous_sales_2'),
                description=business_data.get('description'),
                type=business_data.get('type'),
                external_account_number=business_data.get('external_account_number'),
                our_account_number=account_data.get('our_account_number')
            )

            # Skip empty rows or footer rows
            if not customer.customer_profile or customer.customer_profile.startswith('Count='):
                continue

            customers.append(customer)

        return customers

    def _parse_page0(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 0: ID, PROFILO CLIENTE, NOME, PARTITA IVA
        Columns: [ID, PROFILO_CLIENTE, NOME, PARTITA_IVA]

        Note: ID is the primary identifier (always present)
              PROFILO CLIENTE is rarely populated (optional field)
        """
        if len(row) < 3:
            return {'customer_profile': '', 'name': '', 'vat_number': None}

        # ID is the primary identifier (column 0)
        customer_profile = (row[0] or '').strip()

        # PROFILO CLIENTE is optional (column 1) - rarely used
        # We don't store it separately for now as it's rarely populated

        name = ' '.join((row[2] or '').split())
        vat_number = (row[3] or '').strip() if len(row) > 3 else None

        # Clean empty strings to None
        vat_number = vat_number if vat_number else None

        return {
            'customer_profile': customer_profile,
            'name': name,
            'vat_number': vat_number
        }

    def _parse_page1(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 1: PEC, SDI, CODICE FISCALE, TERMINI DI CONSEGNA
        Columns: [PEC, SDI, CODICE_FISCALE, TERMINI_DI_CONSEGNA]
        """
        pec = (row[0] or '').strip() if len(row) > 0 else None
        sdi = (row[1] or '').strip() if len(row) > 1 else None
        fiscal_code = (row[2] or '').strip() if len(row) > 2 else None
        delivery_terms = (row[3] or '').strip() if len(row) > 3 else None

        # Clean empty strings to None
        pec = pec if pec else None
        sdi = sdi if sdi else None
        fiscal_code = fiscal_code if fiscal_code else None
        delivery_terms = delivery_terms if delivery_terms else None

        return {
            'pec': pec,
            'sdi': sdi,
            'fiscal_code': fiscal_code,
            'delivery_terms': delivery_terms
        }

    def _parse_page2(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 2: VIA, INDIRIZZO LOGISTICO CAP, CITTÀ
        Columns: [VIA, CAP, CITTÀ]
        """
        street = (row[0] or '').strip() if len(row) > 0 else None
        postal_code = (row[1] or '').strip() if len(row) > 1 else None
        city = (row[2] or '').strip() if len(row) > 2 else None

        # Clean empty strings to None
        street = street if street else None
        postal_code = postal_code if postal_code else None
        city = city if city else None

        # logistics_address is same as street in this structure
        logistics_address = street

        return {
            'street': street,
            'logistics_address': logistics_address,
            'postal_code': postal_code,
            'city': city
        }

    def _parse_page3(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 3: TELEFONO, CELLULARE, URL, ALL'ATTENZIONE DI
        Columns: [TELEFONO, CELLULARE, URL, ALL_ATTENZIONE_DI]
        """
        phone = (row[0] or '').strip() if len(row) > 0 else None
        mobile = (row[1] or '').strip() if len(row) > 1 else None
        url = (row[2] or '').strip() if len(row) > 2 else None
        attention_to = (row[3] or '').strip() if len(row) > 3 else None

        # Clean empty strings to None
        phone = phone if phone else None
        mobile = mobile if mobile else None
        url = url if url else None
        attention_to = attention_to if attention_to else None

        return {
            'phone': phone,
            'mobile': mobile,
            'url': url,
            'attention_to': attention_to
        }

    def _parse_page4(self, row: List[str]) -> Dict:
        """Parse page 4: DATA ULTIMO ORDINE, CONTEGGI ORDINI EFFETTIVI, VENDITE ATTUALI (€)
        Columns: [LAST_ORDER_DATE, ACTUAL_ORDER_COUNT, ACTUAL_SALES]
        """
        last_order_date = None
        actual_order_count = None
        actual_sales = None

        if len(row) > 0:
            last_order_date = (row[0] or '').strip()
            last_order_date = last_order_date if last_order_date else None

        if len(row) > 1:
            try:
                actual_order_count = int((row[1] or '').strip())
            except (ValueError, AttributeError):
                pass

        if len(row) > 2:
            actual_sales = self._parse_currency(row[2])

        return {
            'last_order_date': last_order_date,
            'actual_order_count': actual_order_count,
            'actual_sales': actual_sales
        }

    def _parse_page5(self, row: List[str]) -> Dict:
        """Parse page 5: CONTEGGIO ORDINI PRECEDENTE, VENDITE PRECEDENTE
        Columns: [PREVIOUS_ORDER_COUNT_1, PREVIOUS_SALES_1]
        """
        previous_order_count_1 = None
        previous_sales_1 = None

        if len(row) > 0:
            try:
                previous_order_count_1 = int((row[0] or '').strip())
            except (ValueError, AttributeError):
                pass

        if len(row) > 1:
            previous_sales_1 = self._parse_currency(row[1])

        return {
            'previous_order_count_1': previous_order_count_1,
            'previous_sales_1': previous_sales_1
        }

    def _parse_page6(self, row: List[str]) -> Dict:
        """Parse page 6: CONTEGGIO ORDINI PRECEDENTE 2, VENDITE PRECEDENTE 2
        Columns: [PREVIOUS_ORDER_COUNT_2, PREVIOUS_SALES_2]
        """
        previous_order_count_2 = None
        previous_sales_2 = None

        if len(row) > 0:
            try:
                previous_order_count_2 = int((row[0] or '').strip())
            except (ValueError, AttributeError):
                pass

        if len(row) > 1:
            previous_sales_2 = self._parse_currency(row[1])

        return {
            'previous_order_count_2': previous_order_count_2,
            'previous_sales_2': previous_sales_2
        }

    def _parse_page7(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 7: DESCRIZIONE, TYPE, NUMERO DI CONTO ESTERNO
        Columns: [DESCRIZIONE, TYPE, EXTERNAL_ACCOUNT_NUMBER]
        """
        description = (row[0] or '').strip() if len(row) > 0 else None
        type_field = (row[1] or '').strip() if len(row) > 1 else None
        external_account_number = (row[2] or '').strip() if len(row) > 2 else None

        # Clean empty strings to None
        description = description if description else None
        type_field = type_field if type_field else None
        external_account_number = external_account_number if external_account_number else None

        return {
            'description': description,
            'type': type_field,
            'external_account_number': external_account_number
        }

    def _parse_page8(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 8: IL NOSTRO NUMERO DI CONTO
        Columns: [OUR_ACCOUNT_NUMBER]
        """
        our_account_number = (row[0] or '').strip() if len(row) > 0 else None

        # Clean empty strings to None
        our_account_number = our_account_number if our_account_number else None

        return {
            'our_account_number': our_account_number
        }

    def _parse_currency(self, value: Optional[str]) -> Optional[float]:
        """Parse Italian currency format: '124.497,43 €' → 124497.43"""
        if not value:
            return None
        sales_str = (value or '').replace('€', '').replace('.', '').replace(',', '.').strip()
        try:
            return float(sales_str)
        except (ValueError, AttributeError):
            return None


def main():
    """Main CLI entry point"""
    if len(sys.argv) < 2:
        print("Usage: python3 parse-clienti-pdf.py <path-to-pdf> [--output json|csv]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_format = 'json'

    if '--output' in sys.argv:
        idx = sys.argv.index('--output')
        if idx + 1 < len(sys.argv):
            output_format = sys.argv[idx + 1]

    try:
        parser = CustomerPDFParser(pdf_path)
        customers = parser.parse()

        if output_format == 'json':
            output = {
                'total_customers': len(customers),
                'customers': [c.to_dict() for c in customers]
            }
            print(json.dumps(output, indent=2, ensure_ascii=False))

        elif output_format == 'csv':
            # Print CSV header
            print('customer_profile,name,vat_number,pec,sdi,fiscal_code,delivery_terms,street,logistics_address,postal_code,city,phone,mobile,url,attention_to,last_order_date,actual_order_count,actual_sales,previous_order_count_1,previous_sales_1,previous_order_count_2,previous_sales_2,description,type,external_account_number,our_account_number')

            # Print data rows
            for c in customers:
                row = [
                    c.customer_profile,
                    c.name,
                    c.vat_number or '',
                    c.pec or '',
                    c.sdi or '',
                    c.fiscal_code or '',
                    c.delivery_terms or '',
                    c.street or '',
                    c.logistics_address or '',
                    c.postal_code or '',
                    c.city or '',
                    c.phone or '',
                    c.mobile or '',
                    c.url or '',
                    c.attention_to or '',
                    c.last_order_date or '',
                    str(c.actual_order_count) if c.actual_order_count is not None else '',
                    str(c.actual_sales) if c.actual_sales is not None else '',
                    str(c.previous_order_count_1) if c.previous_order_count_1 is not None else '',
                    str(c.previous_sales_1) if c.previous_sales_1 is not None else '',
                    str(c.previous_order_count_2) if c.previous_order_count_2 is not None else '',
                    str(c.previous_sales_2) if c.previous_sales_2 is not None else '',
                    c.description or '',
                    c.type or '',
                    c.external_account_number or '',
                    c.our_account_number or ''
                ]
                # Escape quotes in CSV
                row = [f'"{field.replace(chr(34), chr(34)+chr(34))}"' if ',' in field or '"' in field else field for field in row]
                print(','.join(row))

        else:
            print(f"Unknown output format: {output_format}", file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"Error parsing PDF: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
