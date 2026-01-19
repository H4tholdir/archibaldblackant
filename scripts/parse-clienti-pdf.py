#!/usr/bin/env python3
"""
PDF Customer Parser - Proof of Concept

Parses Archibald "Clienti.pdf" export and extracts structured customer data.

Usage:
    python3 parse-clienti-pdf.py <path-to-pdf> [--output json|csv]

Example:
    python3 parse-clienti-pdf.py Clienti.pdf --output json > customers.json
"""

import sys
import json
import re
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
from pathlib import Path

try:
    import PyPDF2
except ImportError:
    print("Error: PyPDF2 not installed. Run: pip3 install PyPDF2", file=sys.stderr)
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
    """Parser for Archibald Customer PDF exports"""

    def __init__(self, pdf_path: str):
        self.pdf_path = Path(pdf_path)
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

    def parse(self) -> List[ParsedCustomer]:
        """Parse PDF and return list of structured customers"""
        with open(self.pdf_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            total_pages = len(reader.pages)

            # Extract lines from all pages
            all_pages_lines = []
            for page_num in range(total_pages):
                page_text = reader.pages[page_num].extract_text()
                lines = [line.strip() for line in page_text.split('\n') if line.strip()]
                all_pages_lines.append(lines)

        # PDF has 8-page cycles: [IDs, Fiscal, Address, Contact, OrderAnalytics, SalesAnalytics, BusinessInfo, InternalAccount]
        customers = self._parse_cyclic_pages(all_pages_lines)

        return customers

    def _parse_cyclic_pages(self, all_pages_lines: List[List[str]]) -> List[ParsedCustomer]:
        """Parse pages in 8-page cycles and combine data"""
        customers = []

        # Determine cycle positions
        num_pages = len(all_pages_lines)
        cycles = num_pages // 8

        for cycle in range(cycles):
            base_idx = cycle * 8

            # Pages 0-3: Basic info (existing)
            ids_data = self._parse_ids_page(all_pages_lines[base_idx])
            fiscal_data = self._parse_fiscal_page(all_pages_lines[base_idx + 1])
            address_data = self._parse_address_page(all_pages_lines[base_idx + 2])
            contact_data = self._parse_contact_page(all_pages_lines[base_idx + 3])

            # Pages 4-7: Analytics & accounts (NEW)
            order_analytics = self._parse_order_analytics_page(all_pages_lines[base_idx + 4])
            sales_analytics = self._parse_sales_analytics_page(all_pages_lines[base_idx + 5])
            business_info = self._parse_business_info_page(all_pages_lines[base_idx + 6])
            internal_account = self._parse_internal_account_page(all_pages_lines[base_idx + 7])

            # Combine data by row index
            max_rows = max(
                len(ids_data), len(fiscal_data), len(address_data), len(contact_data),
                len(order_analytics), len(sales_analytics), len(business_info), len(internal_account)
            )

            for row_idx in range(max_rows):
                ids = ids_data[row_idx] if row_idx < len(ids_data) else {}
                fiscal = fiscal_data[row_idx] if row_idx < len(fiscal_data) else {}
                address = address_data[row_idx] if row_idx < len(address_data) else {}
                contact = contact_data[row_idx] if row_idx < len(contact_data) else {}
                order_ana = order_analytics[row_idx] if row_idx < len(order_analytics) else {}
                sales_ana = sales_analytics[row_idx] if row_idx < len(sales_analytics) else {}
                biz_info = business_info[row_idx] if row_idx < len(business_info) else {}
                int_acct = internal_account[row_idx] if row_idx < len(internal_account) else {}

                # Merge all 8 pages of data
                customer = ParsedCustomer(
                    # Pages 0-3 (existing)
                    customer_profile=ids.get('customer_profile', ''),
                    name=ids.get('name', ''),
                    vat_number=ids.get('vat_number'),
                    pec=fiscal.get('pec'),
                    sdi=fiscal.get('sdi'),
                    fiscal_code=fiscal.get('fiscal_code'),
                    delivery_terms=fiscal.get('delivery_terms'),
                    street=address.get('street'),
                    logistics_address=address.get('logistics_address'),
                    postal_code=address.get('postal_code'),
                    city=address.get('city'),
                    phone=contact.get('phone'),
                    mobile=contact.get('mobile'),
                    url=contact.get('url'),
                    attention_to=contact.get('attention_to'),
                    last_order_date=contact.get('last_order_date'),
                    # Pages 4-7 (NEW)
                    actual_order_count=order_ana.get('actual_order_count'),
                    customer_type=order_ana.get('customer_type'),
                    previous_order_count_1=order_ana.get('previous_order_count_1'),
                    previous_sales_1=sales_ana.get('previous_sales_1'),
                    previous_order_count_2=sales_ana.get('previous_order_count_2'),
                    previous_sales_2=sales_ana.get('previous_sales_2'),
                    description=biz_info.get('description'),
                    type=biz_info.get('type'),
                    external_account_number=biz_info.get('external_account_number'),
                    our_account_number=int_acct.get('our_account_number')
                )

                # Filter garbage: ID="0" and valid customer_profile required
                if customer.customer_profile and customer.customer_profile != "0":
                    customers.append(customer)

        return customers

    def _parse_ids_page(self, lines: List[str]) -> List[Dict[str, str]]:
        """Parse page 0: ID PROFILO CLIENTE, NOME, PARTITA IVA"""
        rows = []

        # Skip header line
        data_lines = lines[1:] if lines else []

        for line in data_lines:
            # Pattern: ID NAME VAT
            # Example: "50049421 Fresis Soc Cooperativa 08246131216"
            parts = line.split()

            if not parts:
                continue

            # First part is always ID
            customer_profile = parts[0]

            # Last part might be VAT (11 digits) or part of name
            vat_number = None
            name_parts = parts[1:]

            # Check if last part is a VAT number (11 digits)
            if name_parts and re.match(r'^\d{11}$', name_parts[-1]):
                vat_number = name_parts[-1]
                name_parts = name_parts[:-1]

            name = ' '.join(name_parts) if name_parts else ''

            rows.append({
                'customer_profile': customer_profile,
                'name': name,
                'vat_number': vat_number
            })

        return rows

    def _parse_fiscal_page(self, lines: List[str]) -> List[Dict[str, Optional[str]]]:
        """Parse page 1: PEC, SDI, CODICE FISCALE, TERMINI DI CONSEGNA"""
        rows = []

        # Skip header line
        data_lines = lines[1:] if lines else []

        for line in data_lines:
            parts = line.split()

            pec = None
            sdi = None
            fiscal_code = None
            delivery_terms = None

            # Identify components
            for part in parts:
                if '@' in part and not pec:
                    pec = part
                elif re.match(r'^[A-Z0-9]{7}$', part) and not sdi:
                    sdi = part
                elif re.match(r'^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$', part) and not fiscal_code:
                    fiscal_code = part
                elif not delivery_terms:
                    delivery_terms = part

            rows.append({
                'pec': pec,
                'sdi': sdi,
                'fiscal_code': fiscal_code,
                'delivery_terms': delivery_terms
            })

        return rows

    def _parse_address_page(self, lines: List[str]) -> List[Dict[str, Optional[str]]]:
        """Parse page 2: VIA, INDIRIZZO LOGISTICO, CAP, CITTÀ"""
        rows = []

        # Skip header line
        data_lines = lines[1:] if lines else []

        for line in data_lines:
            # Pattern: "Via San Vito, 43 80056 Ercolano"
            # Address CAP City

            # Find postal code (5 digits)
            postal_match = re.search(r'\b(\d{5})\b', line)

            if postal_match:
                postal_code = postal_match.group(1)
                pos = postal_match.start()

                # Everything before postal code is address
                address_part = line[:pos].strip()

                # Everything after postal code is city
                city = line[pos + 5:].strip()

                # Split address into street and logistics address if possible
                # For now, use the full address as logistics_address
                street = address_part
                logistics_address = address_part

                rows.append({
                    'street': street,
                    'logistics_address': logistics_address,
                    'postal_code': postal_code,
                    'city': city
                })
            else:
                # No postal code found, treat entire line as address
                rows.append({
                    'street': line,
                    'logistics_address': line,
                    'postal_code': None,
                    'city': None
                })

        return rows

    def _parse_contact_page(self, lines: List[str]) -> List[Dict[str, Optional[str]]]:
        """Parse page 3: TELEFONO, CELLULARE, URL, ALL'ATTENZIONE DI, DATA DELL'ULTIMO ORDINE"""
        rows = []

        # Skip header line
        data_lines = lines[1:] if lines else []

        for line in data_lines:
            parts = line.split()

            phone = None
            mobile = None
            url = None
            attention_to = None
            last_order_date = None

            # Identify components
            for part in parts:
                # Phone numbers start with +39 or similar
                if part.startswith('+') and phone is None:
                    phone = part
                elif part.startswith('+') and phone and mobile is None:
                    mobile = part
                # URLs contain http or www
                elif ('http' in part or 'www' in part) and not url:
                    url = part
                # Dates in DD/MM/YYYY format
                elif re.match(r'^\d{2}/\d{2}/\d{4}$', part) and not last_order_date:
                    last_order_date = part
                # Anything else could be attention_to (rare)
                elif not part.startswith('+') and not attention_to:
                    attention_to = part

            rows.append({
                'phone': phone,
                'mobile': mobile,
                'url': url,
                'attention_to': attention_to,
                'last_order_date': last_order_date
            })

        return rows

    def _parse_order_analytics_page(self, lines: List[str]) -> List[Dict]:
        """Parse page 4: CONTEGGI DEGLI ORDINI EFFETTIVI, TIPO DI CLIENTE, CONTEGGIO DEGLI ORDINI PRECEDENTE"""
        rows = []
        data_lines = lines[1:] if lines else []

        for line in data_lines:
            parts = line.split()

            actual_order_count = None
            customer_type = None
            previous_order_count_1 = None

            # Pattern: "4 1.792,97 € 97"
            # First column: integer (actualOrderCount)
            # Second+Third: currency amount (skip for MVP - not in schema)
            # Last column: integer (previousOrderCount1)

            if len(parts) >= 1 and parts[0].isdigit():
                actual_order_count = int(parts[0])

            # Last numeric value is previousOrderCount1
            for part in reversed(parts):
                if part.isdigit():
                    previous_order_count_1 = int(part)
                    break

            # Customer type might be in middle (text field)
            # For MVP, skip if not easily identifiable

            rows.append({
                'actual_order_count': actual_order_count,
                'customer_type': customer_type,
                'previous_order_count_1': previous_order_count_1
            })

        return rows

    def _parse_sales_analytics_page(self, lines: List[str]) -> List[Dict]:
        """Parse page 5: VENDITE PRECEDENTE, CONTEGGIO DEGLI ORDINI PRECEDENTE 2, VENDITE PRECEDENTE"""
        rows = []
        data_lines = lines[1:] if lines else []

        for line in data_lines:
            # Pattern: "124.497,43 € 112 185.408,57 €"
            # Extract currency amounts and integer

            # Remove € symbols and split
            clean_line = line.replace('€', '').strip()
            parts = clean_line.split()

            previous_sales_1 = None
            previous_order_count_2 = None
            previous_sales_2 = None

            # Find integers and currency amounts
            integers = []
            currencies = []

            for part in parts:
                # Check if currency (contains comma and digits)
                if ',' in part and any(c.isdigit() for c in part):
                    # Convert Italian format to float: 124.497,43 → 124497.43
                    value = part.replace('.', '').replace(',', '.')
                    try:
                        currencies.append(float(value))
                    except ValueError:
                        pass
                elif part.isdigit():
                    integers.append(int(part))

            # Assign based on position
            if len(currencies) >= 1:
                previous_sales_1 = currencies[0]
            if len(integers) >= 1:
                previous_order_count_2 = integers[0]
            if len(currencies) >= 2:
                previous_sales_2 = currencies[1]

            rows.append({
                'previous_sales_1': previous_sales_1,
                'previous_order_count_2': previous_order_count_2,
                'previous_sales_2': previous_sales_2
            })

        return rows

    def _parse_business_info_page(self, lines: List[str]) -> List[Dict]:
        """Parse page 6: DESCRIZIONE, TYPE, NUMERO DI CONTO ESTERNO"""
        rows = []
        data_lines = lines[1:] if lines else []

        for line in data_lines:
            # Pattern: "Debitor Debitor 50"
            # Pattern: "Customer from Concessionario CustFromConcess 223"

            parts = line.split()

            description = None
            type_field = None
            external_account_number = None

            # External account number is last numeric value
            if parts and parts[-1].isdigit():
                external_account_number = parts[-1]
                parts = parts[:-1]

            # Type is known codes (Debitor, CustFromConcess, PotFromCon, etc.)
            known_types = ['Debitor', 'CustFromConcess', 'PotFromCon']
            for part in parts:
                if part in known_types:
                    type_field = part

            # Description is remaining text
            description_parts = [p for p in parts if p != type_field]
            if description_parts:
                description = ' '.join(description_parts)

            rows.append({
                'description': description,
                'type': type_field,
                'external_account_number': external_account_number
            })

        return rows

    def _parse_internal_account_page(self, lines: List[str]) -> List[Dict]:
        """Parse page 7: IL NOSTRO NUMERO DI CONTO"""
        rows = []
        data_lines = lines[1:] if lines else []

        for line in data_lines:
            # Single column: our account number
            our_account_number = line.strip() if line.strip() else None

            rows.append({
                'our_account_number': our_account_number
            })

        return rows


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
                    # NEW FIELDS
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
                row = [f'"{field}"' if ',' in field or '"' in field else field for field in row]
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
