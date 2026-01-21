#!/usr/bin/env python3
"""
PDF Data Analysis Script
Extracts all fields from Ordini.pdf, DDT.pdf, and Fatture.pdf
and compares with database schema to identify data leaks
"""

import pdfplumber
import json
from collections import defaultdict
import re

def extract_order_data():
    """Extract complete order data from Ordini.pdf"""
    print("=" * 80)
    print("EXTRACTING ALL FIELDS FROM ORDINI.PDF")
    print("=" * 80)

    all_fields = set()
    sample_data = []

    with pdfplumber.open("Ordini.pdf") as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()

            for table in tables:
                if not table or len(table) < 2:
                    continue

                headers = table[0]
                print(f"\nPage {page_num} - Headers found: {headers}")

                for header in headers:
                    if header and header.strip():
                        all_fields.add(header.strip())

                # Extract sample rows
                for row_idx, row in enumerate(table[1:6]):  # First 5 data rows
                    if row and len(row) > 0:
                        row_data = {}
                        for col_idx, value in enumerate(row):
                            if col_idx < len(headers) and headers[col_idx]:
                                row_data[headers[col_idx]] = value
                        if row_data:
                            sample_data.append(row_data)
                            if row_idx == 0:
                                print(f"Sample data: {row_data}")

    return {
        "all_fields": sorted(list(all_fields)),
        "sample_count": len(sample_data),
        "samples": sample_data[:3]
    }

def extract_ddt_data():
    """Extract complete DDT data from Documenti di trasporto.pdf"""
    print("\n" + "=" * 80)
    print("EXTRACTING ALL FIELDS FROM DOCUMENTI DI TRASPORTO.PDF")
    print("=" * 80)

    all_fields = set()
    sample_data = []

    with pdfplumber.open("Documenti di trasporto.pdf") as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()

            for table in tables:
                if not table or len(table) < 2:
                    continue

                headers = table[0]
                print(f"\nPage {page_num} - Headers found: {headers}")

                for header in headers:
                    if header and header.strip():
                        all_fields.add(header.strip())

                # Extract sample rows
                for row_idx, row in enumerate(table[1:6]):
                    if row and len(row) > 0:
                        row_data = {}
                        for col_idx, value in enumerate(row):
                            if col_idx < len(headers) and headers[col_idx]:
                                row_data[headers[col_idx]] = value
                        if row_data:
                            sample_data.append(row_data)
                            if row_idx == 0:
                                print(f"Sample data: {row_data}")

    return {
        "all_fields": sorted(list(all_fields)),
        "sample_count": len(sample_data),
        "samples": sample_data[:3]
    }

def extract_invoice_data():
    """Extract complete invoice data from Fatture.pdf"""
    print("\n" + "=" * 80)
    print("EXTRACTING ALL FIELDS FROM FATTURE.PDF")
    print("=" * 80)

    all_fields = set()
    sample_data = []

    with pdfplumber.open("Fatture.pdf") as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()

            for table in tables:
                if not table or len(table) < 2:
                    continue

                headers = table[0]
                print(f"\nPage {page_num} - Headers found: {headers}")

                for header in headers:
                    if header and header.strip():
                        all_fields.add(header.strip())

                # Extract sample rows
                for row_idx, row in enumerate(table[1:6]):
                    if row and len(row) > 0:
                        row_data = {}
                        for col_idx, value in enumerate(row):
                            if col_idx < len(headers) and headers[col_idx]:
                                row_data[headers[col_idx]] = value
                        if row_data:
                            sample_data.append(row_data)
                            if row_idx == 0:
                                print(f"Sample data: {row_data}")

    return {
        "all_fields": sorted(list(all_fields)),
        "sample_count": len(sample_data),
        "samples": sample_data[:3]
    }

def main():
    """Main analysis function"""

    # Extract data from all PDFs
    orders = extract_order_data()
    ddt = extract_ddt_data()
    invoices = extract_invoice_data()

    # Print summary
    print("\n" + "=" * 80)
    print("SUMMARY OF ALL FIELDS FOUND IN PDFs")
    print("=" * 80)

    print(f"\n### ORDINI.PDF - {len(orders['all_fields'])} unique fields ###")
    for field in orders['all_fields']:
        print(f"  - {field}")

    print(f"\n### DOCUMENTI DI TRASPORTO.PDF - {len(ddt['all_fields'])} unique fields ###")
    for field in ddt['all_fields']:
        print(f"  - {field}")

    print(f"\n### FATTURE.PDF - {len(invoices['all_fields'])} unique fields ###")
    for field in invoices['all_fields']:
        print(f"  - {field}")

    # Database schema comparison
    print("\n" + "=" * 80)
    print("DATABASE SCHEMA COMPARISON")
    print("=" * 80)

    # Orders table fields (from order-db-new.ts)
    db_order_fields = [
        "id", "user_id", "order_number", "customer_profile_id", "customer_name",
        "delivery_name", "delivery_address", "creation_date", "delivery_date",
        "remaining_sales_financial", "customer_reference", "sales_status",
        "order_type", "document_status", "sales_origin", "transfer_status",
        "transfer_date", "completion_date", "discount_percent", "gross_amount",
        "total_amount", "hash", "last_sync", "created_at",
        "ddt_number", "ddt_delivery_date", "tracking_number", "tracking_url",
        "tracking_courier", "invoice_number", "invoice_date", "invoice_amount",
        "current_state", "sent_to_milano_at", "archibald_order_id"
    ]

    print("\n### Orders DB Fields (orders table) ###")
    print(f"Total: {len(db_order_fields)} fields")
    for field in db_order_fields:
        print(f"  - {field}")

    # Check for potential data leaks
    print("\n" + "=" * 80)
    print("POTENTIAL DATA LEAKS ANALYSIS")
    print("=" * 80)

    print("\n### PDF Fields NOT captured in database ###")

    pdf_order_fields = set([f.upper() for f in orders['all_fields']])
    db_fields_upper = set([f.upper().replace('_', ' ') for f in db_order_fields])

    print("\nFrom ORDINI.PDF:")
    for pdf_field in orders['all_fields']:
        captured = False
        pdf_field_normalized = pdf_field.upper().replace(':', '').strip()

        # Check various normalizations
        if any(db_f in pdf_field_normalized or pdf_field_normalized in db_f
               for db_f in db_fields_upper):
            captured = True

        if not captured:
            print(f"  ⚠️  {pdf_field} - NOT CAPTURED")

    print("\nFrom DOCUMENTI DI TRASPORTO.PDF:")
    for pdf_field in ddt['all_fields']:
        captured = False
        pdf_field_normalized = pdf_field.upper().replace(':', '').strip()

        if any(db_f in pdf_field_normalized or pdf_field_normalized in db_f
               for db_f in db_fields_upper):
            captured = True

        if not captured:
            print(f"  ⚠️  {pdf_field} - NOT CAPTURED")

    print("\nFrom FATTURE.PDF:")
    for pdf_field in invoices['all_fields']:
        captured = False
        pdf_field_normalized = pdf_field.upper().replace(':', '').strip()

        if any(db_f in pdf_field_normalized or pdf_field_normalized in db_f
               for db_f in db_fields_upper):
            captured = True

        if not captured:
            print(f"  ⚠️  {pdf_field} - NOT CAPTURED")

    # Save full report
    report = {
        "orders": orders,
        "ddt": ddt,
        "invoices": invoices,
        "database_fields": db_order_fields
    }

    with open("pdf-analysis-report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print("\n✅ Full report saved to: pdf-analysis-report.json")

if __name__ == "__main__":
    main()
