#!/usr/bin/env python3
"""
Parse Documenti di trasporto.pdf - 6-page cycle structure
Outputs JSON to stdout (one DDT per line)
"""

import pdfplumber
import json
import sys
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Optional


@dataclass
class ParsedDDT:
    """DDT data from Documenti di trasporto.pdf"""
    # Page 1/6: DDT Identification
    id: str  # Internal ID
    ddt_number: str  # e.g., "DDT/26000613"
    delivery_date: Optional[str]  # ISO 8601
    order_number: str  # Match key! e.g., "ORD/26000695"

    # Page 2/6: Customer
    customer_account: Optional[str]
    sales_name: Optional[str]

    # Page 3/6: Delivery Name
    delivery_name: Optional[str]

    # Page 5/6: TRACKING (Key page!)
    tracking_number: Optional[str]  # e.g., "445291888246"
    tracking_url: Optional[str]  # e.g., "https://www.fedex.com/fedextrack/?trknbr=445291888246"
    tracking_courier: Optional[str]  # e.g., "FEDEX", "UPS", "DHL"
    delivery_terms: Optional[str]  # e.g., "CFR"

    # Page 6/6: Delivery Method & Location
    delivery_method: Optional[str]  # Courier: "FedEx", "UPS", "DHL"
    delivery_city: Optional[str]


def parse_italian_date(date_str: str) -> Optional[str]:
    """Parse Italian date to ISO 8601: DD/MM/YYYY → YYYY-MM-DD"""
    if not date_str or date_str.strip() == "":
        return None
    try:
        dt = datetime.strptime(date_str.strip(), "%d/%m/%Y")
        return dt.date().isoformat()
    except ValueError:
        return None


def extract_tracking_info(text: str) -> tuple:
    """
    Extract tracking number, courier name, and tracking URL from text.
    Handles multiple formats:
    - HTML: '<a href="...">fedex 445291890750</a>'
    - Plain: "fedex 445291890750"
    - Just number: "445291890750"
    Returns: (tracking_number, courier_name, tracking_url)
    """
    if not text or not text.strip():
        return (None, None, None)

    import re

    # Extract href URL if present (before cleaning HTML)
    extracted_url = None
    href_match = re.search(r'href\s*=\s*["\']([^"\']+)["\']', text, re.IGNORECASE)
    if href_match:
        # Clean up URL: remove newlines and extra spaces
        extracted_url = href_match.group(1).strip()
        extracted_url = re.sub(r'\s+', '', extracted_url)  # Remove all whitespace including newlines

    # Extract text inside <a>...</a> tags if present
    text_in_tag = re.search(r'>([^<]+)</a>', text, re.IGNORECASE)
    if text_in_tag:
        text = text_in_tag.group(1)

    # Clean up remaining HTML tags and entities
    text = text.strip()
    text = re.sub(r'<[^>]+>', '', text)  # Remove any remaining HTML tags
    text = re.sub(r'&[a-z]+;', '', text)  # Remove HTML entities like &nbsp;
    text = text.strip().lower()

    # Detect courier and extract tracking number
    courier_patterns = {
        'fedex': r'^fedex\s+([0-9]+)',
        'ups': r'^ups\s+([A-Z0-9]+)',
        'dhl': r'^dhl\s+([A-Z0-9]+)',
        'tnt': r'^tnt\s+([A-Z0-9]+)',
        'gls': r'^gls\s+([A-Z0-9]+)',
        'bartolini': r'^bartolini\s+([A-Z0-9]+)',
        'sda': r'^sda\s+([A-Z0-9]+)',
    }

    courier_name = None
    tracking_number = None

    for courier, pattern in courier_patterns.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            tracking_number = match.group(1)
            courier_name = courier.upper()
            break

    # If no courier prefix found, try to extract just the number
    if not tracking_number:
        parts = text.split()
        if len(parts) > 0:
            tracking = parts[-1]
            if any(c.isdigit() for c in tracking):
                tracking_number = tracking

    # Use extracted URL from href if available, otherwise generate based on courier
    tracking_url = extracted_url

    if not tracking_url and tracking_number and courier_name:
        # Generate tracking URL based on courier
        if courier_name == 'FEDEX':
            tracking_url = f"https://www.fedex.com/fedextrack/?trknbr={tracking_number}&locale=it_IT"
        elif courier_name == 'UPS':
            tracking_url = f"https://www.ups.com/track?loc=it_IT&tracknum={tracking_number}"
        elif courier_name == 'DHL':
            tracking_url = f"https://www.dhl.com/it-it/home/tracking/tracking-express.html?submit=1&tracking-id={tracking_number}"
        elif courier_name == 'GLS':
            tracking_url = f"https://gls-group.eu/IT/it/ricerca-pacchi?match={tracking_number}"
        elif courier_name == 'BARTOLINI' or courier_name == 'BRT':
            tracking_url = f"https://vas.brt.it/vas/sped_det_show.hsm?brt_brtCode={tracking_number}"
        elif courier_name == 'SDA':
            tracking_url = f"https://www.sda.it/wps/portal/Servizi_online/dettaglio-spedizione?locale=it&tracing.letteraVettura={tracking_number}"

    return (tracking_number, courier_name, tracking_url)


def parse_ddt_pdf(pdf_path: str):
    """
    Parse Documenti di trasporto.pdf with 6-page cycle structure.
    Yields one ParsedDDT per DDT entry.
    """
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)

        # Process in 6-page cycles
        for cycle_start in range(0, total_pages, 6):
            # Extract all 6 pages as tables
            tables = []
            for i in range(6):
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

            # Need all 6 pages
            if len(tables) < 6:
                break

            # Skip if first table empty
            if not tables[0] or len(tables[0]) <= 1:
                continue

            num_rows = len(tables[0])

            for row_idx in range(1, num_rows):  # Skip header
                try:
                    # Page 1/6: DDT ID (5 columns)
                    # Columns: [PDF_DDT, ID, DDT_NUMBER, DELIVERY_DATE, ORDER_NUMBER]
                    row1 = tables[0][row_idx] if row_idx < len(tables[0]) else [None] * 5
                    ddt_id = row1[1] if len(row1) > 1 else None
                    ddt_number = row1[2] if len(row1) > 2 else None
                    delivery_date = parse_italian_date(row1[3]) if len(row1) > 3 else None
                    order_number = row1[4] if len(row1) > 4 else None

                    # Skip if no DDT number or order number
                    if not ddt_number or not order_number:
                        continue

                    # Skip garbage rows
                    if ddt_id == "0" or ddt_number == "0":
                        continue

                    # Page 2/6: Customer (2 columns)
                    row2 = tables[1][row_idx] if row_idx < len(tables[1]) else [None] * 2
                    customer_account = row2[0] if len(row2) > 0 else None
                    sales_name = row2[1] if len(row2) > 1 else None

                    # Page 3/6: Delivery Name (2 columns - use first)
                    row3 = tables[2][row_idx] if row_idx < len(tables[2]) else [None] * 2
                    delivery_name = row3[0] if len(row3) > 0 else None

                    # Page 4/6: Totals (3 columns)
                    # Columns: [TOTALE, RIFERIMENTO CLIENTE, DESCRIZIONE]
                    # (We don't currently extract these values)

                    # Page 5/6: TRACKING (2 columns) ⭐ KEY PAGE
                    # Columns: [NUMERO DI TRACCIABILITÀ, TERMINI DI CONSEGNA]
                    row5 = tables[4][row_idx] if row_idx < len(tables[4]) else [None] * 2
                    tracking_raw = row5[0] if len(row5) > 0 and row5[0] else None
                    tracking_number, tracking_courier, tracking_url = extract_tracking_info(tracking_raw) if tracking_raw else (None, None, None)
                    delivery_terms = row5[1] if len(row5) > 1 else None

                    # Page 6/6: Delivery Method & Location (3 columns)
                    # Columns: [MODALITÀ DI CONSEGNA, ALL'ATTENZIONE DI, CITTÀ DI CONSEGNA]
                    row6 = tables[5][row_idx] if row_idx < len(tables[5]) else [None] * 3
                    delivery_method = row6[0] if len(row6) > 0 else None
                    delivery_city = row6[2] if len(row6) > 2 else None

                    # Create ParsedDDT
                    ddt = ParsedDDT(
                        id=ddt_id,
                        ddt_number=ddt_number,
                        delivery_date=delivery_date,
                        order_number=order_number,
                        customer_account=customer_account,
                        sales_name=sales_name,
                        delivery_name=delivery_name,
                        tracking_number=tracking_number,
                        tracking_url=tracking_url,
                        tracking_courier=tracking_courier,
                        delivery_terms=delivery_terms,
                        delivery_method=delivery_method,
                        delivery_city=delivery_city
                    )

                    yield ddt

                except Exception as e:
                    print(f"Warning: Error parsing row {row_idx} in cycle {cycle_start}: {e}", file=sys.stderr)
                    continue

            tables = None


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: parse-ddt-pdf.py <pdf_path>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        for ddt in parse_ddt_pdf(pdf_path):
            print(json.dumps(asdict(ddt), ensure_ascii=False))

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
