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

        # PDF has 4-page cycles: [IDs, Fiscal, Address, Contact]
        customers = self._parse_cyclic_pages(all_pages_lines)

        return customers

    def _parse_cyclic_pages(self, all_pages_lines: List[List[str]]) -> List[ParsedCustomer]:
        """Parse pages in 4-page cycles and combine data"""
        customers = []

        # Determine cycle positions
        num_pages = len(all_pages_lines)
        cycles = num_pages // 4

        for cycle in range(cycles):
            page_0 = cycle * 4  # IDs, Names, VAT
            page_1 = cycle * 4 + 1  # PEC, SDI, Fiscal Code, Delivery
            page_2 = cycle * 4 + 2  # Street, Address, Postal, City
            page_3 = cycle * 4 + 3  # Phone, Mobile, URL, Attention, Date

            # Parse each page type
            ids_data = self._parse_ids_page(all_pages_lines[page_0])
            fiscal_data = self._parse_fiscal_page(all_pages_lines[page_1])
            address_data = self._parse_address_page(all_pages_lines[page_2])
            contact_data = self._parse_contact_page(all_pages_lines[page_3])

            # Combine data by row index
            max_rows = max(len(ids_data), len(fiscal_data), len(address_data), len(contact_data))

            for row_idx in range(max_rows):
                ids = ids_data[row_idx] if row_idx < len(ids_data) else {}
                fiscal = fiscal_data[row_idx] if row_idx < len(fiscal_data) else {}
                address = address_data[row_idx] if row_idx < len(address_data) else {}
                contact = contact_data[row_idx] if row_idx < len(contact_data) else {}

                # Merge all data
                customer = ParsedCustomer(
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
                    last_order_date=contact.get('last_order_date')
                )

                # Only add if has valid customer_profile
                if customer.customer_profile:
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
            print('customer_profile,name,vat_number,pec,sdi,fiscal_code,delivery_terms,street,logistics_address,postal_code,city,phone,mobile,url,attention_to,last_order_date')

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
                    c.last_order_date or ''
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
