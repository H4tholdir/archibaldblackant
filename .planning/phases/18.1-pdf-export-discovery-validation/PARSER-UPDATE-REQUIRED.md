# Parser Update Required - 8-Page Cycle Support

## Current Status

**Existing Parser**: `scripts/parse-clienti-pdf.py`
- ✅ Working for pages 0-3 (basic info)
- ❌ Missing pages 4-7 (analytics & accounts)
- ❌ Assumes 4-page cycles (should be 8)

## Required Changes

### 1. Update Cycle Logic

**Current (WRONG)**:
```python
def _parse_cyclic_pages(self, all_pages_lines) -> List[ParsedCustomer]:
    pages_per_cycle = 4  # ❌ WRONG
    num_cycles = len(all_pages_lines) // pages_per_cycle
```

**Required (CORRECT)**:
```python
def _parse_cyclic_pages(self, all_pages_lines) -> List[ParsedCustomer]:
    pages_per_cycle = 8  # ✅ CORRECT
    num_cycles = len(all_pages_lines) // pages_per_cycle
```

### 2. Add New Parser Methods

Need to add 4 new methods for pages 4-7:

#### Page 4: Order Analytics 1
```python
def _parse_order_analytics_page(self, lines) -> List[Dict]:
    """
    Parse page 4: Order analytics and customer type

    Headers:
    - CONTEGGI DEGLI ORDINI EFFETTIVI (actualOrderCount)
    - TIPO DI CLIENTE (customerType)
    - CONTEGGIO DEGLI ORDINI PRECEDENTE (previousOrderCount1)

    Example:
    4 1.792,97 € 97
    0 0,00 € 0
    """
    # Extract actualOrderCount, customerType, previousOrderCount1
    pass
```

#### Page 5: Sales Analytics
```python
def _parse_sales_analytics_page(self, lines) -> List[Dict]:
    """
    Parse page 5: Sales analytics for previous periods

    Headers:
    - VENDITE PRECEDENTE (previousSales1)
    - CONTEGGIO DEGLI ORDINI PRECEDENTE 2 (previousOrderCount2)
    - VENDITE PRECEDENTE (previousSales2)

    Example:
    124.497,43 € 112 185.408,57 €
    0,00 € 0 0,00 €
    """
    # Extract previousSales1, previousOrderCount2, previousSales2
    pass
```

#### Page 6: Business Info & External Account
```python
def _parse_business_info_page(self, lines) -> List[Dict]:
    """
    Parse page 6: Business information and external account

    Headers:
    - DESCRIZIONE (description)
    - TYPE (type)
    - NUMERO DI CONTO ESTERNO (externalAccountNumber)

    Example:
    Debitor Debitor 50
    Customer from Concessionario CustFromConcess 223
    """
    # Extract description, type, externalAccountNumber
    pass
```

#### Page 7: Internal Account
```python
def _parse_internal_account_page(self, lines) -> List[Dict]:
    """
    Parse page 7: Internal account number

    Headers:
    - IL NOSTRO NUMERO DI CONTO (ourAccountNumber)

    Example:
    (single column with account numbers)
    """
    # Extract ourAccountNumber
    pass
```

### 3. Update Main Parsing Loop

**Current (pages 0-3 only)**:
```python
for cycle in range(num_cycles):
    base_idx = cycle * pages_per_cycle

    ids_data = self._parse_ids_page(all_pages_lines[base_idx])
    fiscal_data = self._parse_fiscal_page(all_pages_lines[base_idx + 1])
    address_data = self._parse_address_page(all_pages_lines[base_idx + 2])
    contact_data = self._parse_contact_page(all_pages_lines[base_idx + 3])

    # Merge data...
```

**Required (pages 0-7)**:
```python
for cycle in range(num_cycles):
    base_idx = cycle * pages_per_cycle

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

    # Merge ALL 8 pages of data...
```

### 4. Update ParsedCustomer TypedDict

**Current (16 fields)**:
```python
class ParsedCustomer(TypedDict, total=False):
    customer_profile: str
    name: str
    vat_number: str
    fiscal_code: str
    sdi: str
    pec: str
    delivery_terms: str
    street: str
    logistics_address: str
    postal_code: str
    city: str
    phone: str
    mobile: str
    url: str
    attention_to: str
    last_order_date: str
```

**Required (27 fields - add 11 new)**:
```python
class ParsedCustomer(TypedDict, total=False):
    # ... existing 16 fields ...

    # NEW: Page 4 fields
    actual_order_count: int
    customer_type: str
    previous_order_count_1: int

    # NEW: Page 5 fields
    previous_sales_1: float
    previous_order_count_2: int
    previous_sales_2: float

    # NEW: Page 6 fields
    description: str
    type: str
    external_account_number: str

    # NEW: Page 7 fields
    our_account_number: str
```

## Data Format Examples

### Page 4 Example
```
CONTEGGI DEGLI ORDINI EFFETTIVI TIPO DI CLIENTE CONTEGGIO DEGLI ORDINI PRECEDENTE
4 1.792,97 € 97
0 0,00 € 0
0 0,00 € 2
```

**Parsing Challenge**:
- First column is actualOrderCount (integer)
- Second column is a currency amount (may be related to current sales?)
- Third column is previousOrderCount1 (integer)

### Page 5 Example
```
VENDITE PRECEDENTE CONTEGGIO DEGLI ORDINI PRECEDENTE 2 VENDITE PRECEDENTE
124.497,43 € 112 185.408,57 €
0,00 € 0 0,00 €
```

**Parsing Challenge**:
- First column: previousSales1 (currency)
- Second column: previousOrderCount2 (integer)
- Third column: previousSales2 (currency)

### Page 6 Example
```
DESCRIZIONE: TYPE: NUMERO DI CONTO ESTERNO
Debitor Debitor 50
Customer from Concessionario CustFromConcess 223
```

**Parsing Challenge**:
- Three columns separated by spaces
- Description might contain spaces ("Customer from Concessionario")
- Type is a code (Debitor, CustFromConcess, PotFromCon)

### Page 7 Example
```
IL NOSTRO NUMERO DI CONTO
(single value per customer)
```

## Testing Strategy

1. **Unit test each new parser method** with sample data from real PDF
2. **Integration test full 8-page cycle** parsing
3. **Validate field counts**: Should extract 27 fields per customer (not 16)
4. **Compare with database**: Verify newly parsed fields match DB values
5. **Performance test**: Ensure parsing time remains ~6s for 2,939 records

## Priority

🔴 **HIGH PRIORITY** - Phase 18 implementation depends on this parser update

Without 8-page support, Phase 18 cannot proceed with full field coverage.

## Recommendation

Update parser **before** starting Phase 18 planning, so that Phase 18-01 can immediately implement the complete sync flow with all 27 fields.

---

**Next Action**: Update `scripts/parse-clienti-pdf.py` to support 8-page cycles
