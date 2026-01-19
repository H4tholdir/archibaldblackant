#!/usr/bin/env python3
"""
Unit tests for parse-clienti-pdf.py
Tests 8-page cycle parsing, field extraction, garbage filtering
"""

import unittest
import sys
from pathlib import Path

# Import parser
sys.path.insert(0, str(Path(__file__).parent))
from parse_clienti_pdf import CustomerPDFParser, ParsedCustomer


class TestCustomerPDFParser(unittest.TestCase):
    """Test suite for CustomerPDFParser"""

    @classmethod
    def setUpClass(cls):
        """Setup test PDF path"""
        cls.test_pdf = Path(__file__).parent.parent / 'Clienti.pdf'

        if not cls.test_pdf.exists():
            raise FileNotFoundError(f"Test PDF not found: {cls.test_pdf}")

    def test_parser_initialization(self):
        """Test parser instantiation"""
        parser = CustomerPDFParser(str(self.test_pdf))
        self.assertIsNotNone(parser)

    def test_parse_returns_customers(self):
        """Test parse() returns list of customers"""
        parser = CustomerPDFParser(str(self.test_pdf))
        customers = parser.parse()

        self.assertIsInstance(customers, list)
        self.assertGreater(len(customers), 0, "No customers parsed")

    def test_garbage_filtering(self):
        """Test ID='0' garbage records are filtered"""
        parser = CustomerPDFParser(str(self.test_pdf))
        customers = parser.parse()

        # No customer should have ID="0"
        garbage_count = sum(1 for c in customers if c.customer_profile == "0")
        self.assertEqual(garbage_count, 0, f"Found {garbage_count} garbage records (ID='0')")

    def test_valid_customer_count(self):
        """Test ~1,515 valid customers (not 2,939 with garbage)"""
        parser = CustomerPDFParser(str(self.test_pdf))
        customers = parser.parse()

        # Allow ±10% variance (1,363 to 1,666)
        self.assertGreater(len(customers), 1363, "Too few customers")
        self.assertLess(len(customers), 1666, "Too many customers (garbage not filtered?)")

    def test_required_fields_present(self):
        """Test all customers have required fields (ID, name)"""
        parser = CustomerPDFParser(str(self.test_pdf))
        customers = parser.parse()

        for customer in customers:
            self.assertIsNotNone(customer.customer_profile, "Missing customer_profile")
            self.assertIsNotNone(customer.name, "Missing name")
            self.assertNotEqual(customer.name, "", "Empty name")

    def test_page_4_7_fields_present(self):
        """Test pages 4-7 fields are extracted (analytics & accounts)"""
        parser = CustomerPDFParser(str(self.test_pdf))
        customers = parser.parse()

        # Check at least some customers have page 4-7 fields
        customers_with_analytics = [
            c for c in customers
            if c.actual_order_count is not None or
               c.customer_type is not None or
               c.external_account_number is not None or
               c.our_account_number is not None
        ]

        # At least 50% should have some analytics fields
        percentage = len(customers_with_analytics) / len(customers) * 100
        self.assertGreater(percentage, 50, f"Only {percentage:.1f}% have analytics fields")

    def test_27_fields_available(self):
        """Test all 27 business fields are available in ParsedCustomer"""
        expected_fields = [
            'customer_profile', 'name', 'vat_number', 'pec', 'sdi', 'fiscal_code',
            'phone', 'mobile', 'url', 'attention_to', 'street', 'logistics_address',
            'postal_code', 'city', 'customer_type', 'type', 'delivery_terms',
            'description', 'last_order_date', 'actual_order_count',
            'previous_order_count_1', 'previous_sales_1', 'previous_order_count_2',
            'previous_sales_2', 'external_account_number', 'our_account_number'
        ]

        # Missing: internalId (removed from DB), hash/timestamps (system fields)
        # Total: 26 PDF fields + 1 computed field (27)

        parser = CustomerPDFParser(str(self.test_pdf))
        customers = parser.parse()
        first_customer = customers[0]

        for field in expected_fields:
            self.assertTrue(hasattr(first_customer, field), f"Missing field: {field}")

    def test_performance_target(self):
        """Test parsing completes in < 10s (target: ~6s)"""
        import time

        parser = CustomerPDFParser(str(self.test_pdf))

        start = time.time()
        customers = parser.parse()
        duration = time.time() - start

        self.assertLess(duration, 10, f"Parsing too slow: {duration:.2f}s (target: < 10s)")
        print(f"✅ Parsed {len(customers)} customers in {duration:.2f}s")


if __name__ == '__main__':
    unittest.main()
