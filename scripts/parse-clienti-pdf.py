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
    customer_type: Optional[str] = None  # TIPO DI CLIENTE
    previous_order_count_1: Optional[int] = None  # CONTEGGIO DEGLI ORDINI PRECEDENTE
    # Page 5: Sales Analytics
    previous_sales_1: Optional[float] = None  # VENDITE PRECEDENTE
    previous_order_count_2: Optional[int] = None  # CONTEGGIO DEGLI ORDINI PRECEDENTE 2
    previous_sales_2: Optional[float] = None  # VENDITE PRECEDENTE
    # Page 6: Business Info & Accounts
    description: Optional[str] = None  # DESCRIZIONE
    type: Optional[str] = None  # TYPE
    external_account_number: Optional[str] = None  # NUMERO DI CONTO ESTERNO
    # Page 7: Internal Account
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

    def parse(self) -> List[ParsedCustomer]:
        """Parse PDF and return list of structured customers"""
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
        customers = self._parse_cyclic_tables(all_tables)

        return customers

    def _parse_cyclic_tables(self, all_tables: List[List[List[str]]]) -> List[ParsedCustomer]:
        """Parse tables in 8-page cycles and combine data"""
        customers = []

        num_pages = len(all_tables)
        cycles = num_pages // 8

        for cycle in range(cycles):
            base_idx = cycle * 8

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
                ids_data = self._parse_page0(page0)
                fiscal_data = self._parse_page1(page1)
                address_data = self._parse_page2(page2)
                contact_data = self._parse_page3(page3)
                order_data = self._parse_page4(page4)
                sales_data = self._parse_page5(page5)
                business_data = self._parse_page6(page6)
                account_data = self._parse_page7(page7)

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
                    last_order_date=contact_data.get('last_order_date'),
                    actual_order_count=order_data.get('actual_order_count'),
                    customer_type=order_data.get('customer_type'),
                    previous_order_count_1=order_data.get('previous_order_count_1'),
                    previous_sales_1=sales_data.get('previous_sales_1'),
                    previous_order_count_2=sales_data.get('previous_order_count_2'),
                    previous_sales_2=sales_data.get('previous_sales_2'),
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

        name = (row[2] or '').strip()
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
        """Parse page 3: TELEFONO, CELLULARE, URL, ALL'ATTENZIONE DI, DATA DELL'ULTIMO ORDINE
        Columns: [TELEFONO, CELLULARE, URL, ALL_ATTENZIONE_DI, DATA_ULTIMO_ORDINE]
        """
        phone = (row[0] or '').strip() if len(row) > 0 else None
        mobile = (row[1] or '').strip() if len(row) > 1 else None
        url = (row[2] or '').strip() if len(row) > 2 else None
        attention_to = (row[3] or '').strip() if len(row) > 3 else None
        last_order_date = (row[4] or '').strip() if len(row) > 4 else None

        # Clean empty strings to None
        phone = phone if phone else None
        mobile = mobile if mobile else None
        url = url if url else None
        attention_to = attention_to if attention_to else None
        last_order_date = last_order_date if last_order_date else None

        return {
            'phone': phone,
            'mobile': mobile,
            'url': url,
            'attention_to': attention_to,
            'last_order_date': last_order_date
        }

    def _parse_page4(self, row: List[str]) -> Dict[str, Optional[int]]:
        """Parse page 4: CONTEGGI DEGLI ORDINI EFFETTIVI, TIPO DI CLIENTE, CONTEGGIO DEGLI ORDINI PRECEDENTE
        Columns: [ACTUAL_ORDER_COUNT, CUSTOMER_TYPE, PREVIOUS_ORDER_COUNT_1]
        """
        actual_order_count = None
        customer_type = None
        previous_order_count_1 = None

        if len(row) > 0:
            try:
                actual_order_count = int((row[0] or '').strip())
            except (ValueError, AttributeError):
                pass

        if len(row) > 1:
            # Customer type is the middle column (but might be currency format)
            customer_type_str = (row[1] or '').strip()
            # If it's a currency, skip it (we don't have a field for it)
            if '€' not in customer_type_str and customer_type_str:
                customer_type = customer_type_str

        if len(row) > 2:
            try:
                previous_order_count_1 = int((row[2] or '').strip())
            except (ValueError, AttributeError):
                pass

        return {
            'actual_order_count': actual_order_count,
            'customer_type': customer_type,
            'previous_order_count_1': previous_order_count_1
        }

    def _parse_page5(self, row: List[str]) -> Dict[str, Optional[float]]:
        """Parse page 5: VENDITE PRECEDENTE, CONTEGGIO DEGLI ORDINI PRECEDENTE 2, VENDITE PRECEDENTE
        Columns: [PREVIOUS_SALES_1, PREVIOUS_ORDER_COUNT_2, PREVIOUS_SALES_2]
        """
        previous_sales_1 = None
        previous_order_count_2 = None
        previous_sales_2 = None

        if len(row) > 0:
            # Parse Italian currency format: "124.497,43 €" → 124497.43
            sales_str = (row[0] or '').replace('€', '').replace('.', '').replace(',', '.').strip()
            try:
                previous_sales_1 = float(sales_str)
            except (ValueError, AttributeError):
                pass

        if len(row) > 1:
            try:
                previous_order_count_2 = int((row[1] or '').strip())
            except (ValueError, AttributeError):
                pass

        if len(row) > 2:
            sales_str = (row[2] or '').replace('€', '').replace('.', '').replace(',', '.').strip()
            try:
                previous_sales_2 = float(sales_str)
            except (ValueError, AttributeError):
                pass

        return {
            'previous_sales_1': previous_sales_1,
            'previous_order_count_2': previous_order_count_2,
            'previous_sales_2': previous_sales_2
        }

    def _parse_page6(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 6: DESCRIZIONE, TYPE, NUMERO DI CONTO ESTERNO
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

    def _parse_page7(self, row: List[str]) -> Dict[str, Optional[str]]:
        """Parse page 7: IL NOSTRO NUMERO DI CONTO
        Columns: [OUR_ACCOUNT_NUMBER]
        """
        our_account_number = (row[0] or '').strip() if len(row) > 0 else None

        # Clean empty strings to None
        our_account_number = our_account_number if our_account_number else None

        return {
            'our_account_number': our_account_number
        }


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
            print('customer_profile,name,vat_number,pec,sdi,fiscal_code,delivery_terms,street,logistics_address,postal_code,city,phone,mobile,url,attention_to,last_order_date,actual_order_count,customer_type,previous_order_count_1,previous_sales_1,previous_order_count_2,previous_sales_2,description,type,external_account_number,our_account_number')

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
                    c.customer_type or '',
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
