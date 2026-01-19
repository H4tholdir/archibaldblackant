#!/usr/bin/env python3
"""
Unit tests for parse-products-pdf.py
Tests 8-page cycle parsing, field extraction, garbage filtering
"""

import unittest
import sys
import os
from pathlib import Path

# Import parser
sys.path.insert(0, str(Path(__file__).parent))
from parse_products_pdf import ProductsPDFParser


class TestProductsPDFParser(unittest.TestCase):
    """Unit tests for products PDF parser"""

    def setUp(self):
        """Set up test fixtures"""
        self.pdf_path = os.getenv('PRODUCTS_PDF_PATH', '/tmp/articoli-test.pdf')

        if not os.path.exists(self.pdf_path):
            self.skipTest(f"Test PDF not found: {self.pdf_path}")

        self.parser = ProductsPDFParser(self.pdf_path)

    def test_parser_initialization(self):
        """Parser initializes successfully"""
        self.assertIsNotNone(self.parser)
        # Note: ProductsPDFParser doesn't expose total_pages as a property
        # but we can verify the parser was created
        self.assertEqual(self.parser.pdf_path.exists(), True)

    def test_parse_returns_products(self):
        """Parser returns list of products"""
        products = self.parser.parse()
        self.assertIsInstance(products, list)
        self.assertGreater(len(products), 0)

    def test_garbage_filtering(self):
        """Garbage records (ID='0') are filtered out"""
        products = self.parser.parse()
        for product in products:
            self.assertNotEqual(product.id_articolo, '0')
            self.assertNotEqual(product.id_articolo.strip(), '')

    def test_valid_product_count(self):
        """Product count is within expected range (~4,540)"""
        products = self.parser.parse()
        self.assertGreaterEqual(len(products), 4000)
        self.assertLessEqual(len(products), 5000)

    def test_required_fields_present(self):
        """All products have required fields (ID, name)"""
        products = self.parser.parse()
        for product in products[:10]:  # Check first 10
            self.assertIsNotNone(product.id_articolo)
            self.assertIsNotNone(product.nome_articolo)

    def test_page_4_8_fields_present(self):
        """Products have fields from pages 4-8 (extended fields)"""
        products = self.parser.parse()
        products_with_extended = [
            p for p in products
            if p.figura or p.grandezza or p.purch_price
        ]
        # At least 50% should have extended fields
        self.assertGreater(len(products_with_extended), len(products) * 0.5)

    def test_all_26_fields_available(self):
        """All 26+ PDF fields are available in dataclass"""
        products = self.parser.parse()
        if len(products) > 0:
            product = products[0]
            # Check all field names exist
            expected_fields = [
                'id_articolo', 'nome_articolo', 'descrizione',
                'gruppo_articolo', 'contenuto_imballaggio', 'nome_ricerca',
                'unita_prezzo', 'id_gruppo_prodotti', 'descrizione_gruppo_articolo', 'qta_minima',
                'qta_multipli', 'qta_massima', 'figura', 'id_blocco_articolo', 'pacco_gamba',
                'grandezza', 'id_configurazione', 'creato_da', 'data_creata', 'dataareaid',
                'qta_predefinita', 'visualizza_numero_prodotto', 'sconto_assoluto_totale', 'id_prodotto',
                'sconto_linea', 'modificato_da', 'datetime_modificato', 'articolo_ordinabile',
                'purch_price', 'pcs_id_configurazione_standard', 'qta_standard', 'fermato', 'id_unita'
            ]
            for field in expected_fields:
                self.assertTrue(hasattr(product, field))

    def test_performance_target(self):
        """Parser meets performance target (<18s for ~4,540 products)"""
        import time
        start = time.time()
        products = self.parser.parse()
        duration = time.time() - start

        print(f"\n✅ Parsed {len(products)} products in {duration:.2f}s")
        self.assertLess(duration, 18, f"Parse time {duration:.2f}s exceeds 18s target")


if __name__ == '__main__':
    # Run with verbose output
    unittest.main(verbosity=2)
