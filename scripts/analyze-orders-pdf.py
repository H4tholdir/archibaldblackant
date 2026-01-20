#!/usr/bin/env python3
"""
Analyze Ordini.pdf structure to identify page cycles and field patterns.
"""

import pdfplumber
import sys
from pathlib import Path

def analyze_orders_pdf(pdf_path: str):
    """Analyze orders PDF structure"""
    print(f"=== Analyzing: {pdf_path} ===\n")

    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        print(f"📄 Total pages: {total_pages}\n")

        # Analyze first 15 pages to identify pattern
        print("=" * 80)
        print("ANALYZING FIRST 15 PAGES FOR PATTERN DETECTION")
        print("=" * 80)

        for i in range(min(15, total_pages)):
            page = pdf.pages[i]
            text = page.extract_text() or ""
            tables = page.extract_tables()

            print(f"\n{'─' * 80}")
            print(f"PAGE {i + 1}")
            print(f"{'─' * 80}")
            print(f"Tables found: {len(tables)}")

            # Look for key indicators
            indicators = {
                'ORDINE': 'ORDINE' in text or 'ORD/' in text,
                'ID_VENDITA': 'ID DI VENDITA' in text or 'ORDINE DI VENDITA' in text,
                'CLIENTE': 'PROFILO CLIENTE' in text or 'NOME VENDITE' in text,
                'DATA': 'DATA DI CREAZIONE' in text or 'DATA DI CONSEGNA' in text,
                'IMPORTO': 'IMPORTO TOTALE' in text or 'IMPORTO LORDO' in text,
                'STATO': 'STATO DELLE VENDITE' in text or 'STATO DEL DOCUMENTO' in text,
                'ARTICOLI': 'LINEE DI VENDITA' in text or 'NOME ARTICOLO' in text
            }

            print("\n📋 Key Indicators Found:")
            for key, found in indicators.items():
                status = "✓" if found else "✗"
                print(f"  {status} {key}")

            # Show text preview (first 500 chars)
            print(f"\n📝 Text Preview:")
            print(text[:500])

            # Show tables structure
            if tables:
                print(f"\n📊 Table Structures:")
                for idx, table in enumerate(tables):
                    if table:
                        rows = len(table)
                        cols = len(table[0]) if table else 0
                        print(f"  Table {idx + 1}: {rows} rows × {cols} cols")

                        # Show first row (headers)
                        if table and table[0]:
                            print(f"    Headers: {table[0]}")

        # Try to identify cycle pattern
        print(f"\n{'=' * 80}")
        print("PATTERN ANALYSIS")
        print(f"{'=' * 80}")

        patterns = []
        for i in range(min(30, total_pages)):
            page = pdf.pages[i]
            text = page.extract_text() or ""

            # Check if this page starts a new order
            is_order_start = 'ORDINE DI VENDITA' in text or 'ORD/' in text[:200]
            patterns.append('START' if is_order_start else 'CONT')

        print(f"\nFirst 30 pages pattern: {' '.join(patterns[:30])}")
        print("\nPattern Legend: START = New order starts, CONT = Continuation")

        # Count START occurrences in first 30 pages
        start_count = patterns[:30].count('START')
        if start_count > 0:
            avg_pages_per_order = 30 / start_count
            print(f"\n📊 Estimated pages per order: {avg_pages_per_order:.1f}")
            print(f"   (Based on {start_count} order starts in first 30 pages)")

        # Detect cycle length
        if start_count >= 3:
            # Find positions of first 3 STARTs
            start_positions = [i for i, p in enumerate(patterns[:30]) if p == 'START'][:3]
            if len(start_positions) >= 2:
                cycle_1 = start_positions[1] - start_positions[0]
                if len(start_positions) >= 3:
                    cycle_2 = start_positions[2] - start_positions[1]
                    if cycle_1 == cycle_2:
                        print(f"\n🎯 DETECTED CYCLE: {cycle_1}-page cycle")
                    else:
                        print(f"\n⚠️ IRREGULAR CYCLE: {cycle_1} pages, then {cycle_2} pages")
                else:
                    print(f"\n🎯 LIKELY CYCLE: {cycle_1}-page cycle (need more samples)")

        print(f"\n{'=' * 80}")
        print("FIELD EXTRACTION TEST (Page 1)")
        print(f"{'=' * 80}")

        # Try to extract key fields from first page
        first_page = pdf.pages[0]
        text = first_page.extract_text() or ""
        tables = first_page.extract_tables()

        # Look for key fields
        fields = {}
        lines = text.split('\n')

        for i, line in enumerate(lines):
            if 'ORD/' in line:
                fields['orderNumber'] = line.strip()
            elif 'PROFILO CLIENTE' in line and i + 1 < len(lines):
                fields['customerProfileId'] = lines[i + 1].strip()
            elif 'NOME VENDITE' in line and i + 1 < len(lines):
                fields['customerName'] = lines[i + 1].strip()
            elif 'DATA DI CREAZIONE' in line and i + 1 < len(lines):
                fields['creationDate'] = lines[i + 1].strip()

        print("\n🔍 Extracted Fields from Page 1:")
        for key, value in fields.items():
            print(f"  {key}: {value}")

        if not fields:
            print("  (No fields extracted - may need table parsing instead)")

        # Show main table structure if exists
        if tables and tables[0]:
            print(f"\n📊 Main Table Structure (Page 1):")
            main_table = tables[0]
            print(f"  Rows: {len(main_table)}")
            print(f"  Columns: {len(main_table[0]) if main_table else 0}")
            print(f"\n  Sample rows (first 5):")
            for idx, row in enumerate(main_table[:5]):
                print(f"    Row {idx}: {row}")

if __name__ == "__main__":
    pdf_path = Path(__file__).parent.parent / "Ordini.pdf"

    if not pdf_path.exists():
        print(f"❌ Error: PDF not found at {pdf_path}")
        sys.exit(1)

    try:
        analyze_orders_pdf(str(pdf_path))
        print(f"\n✅ Analysis complete!")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
