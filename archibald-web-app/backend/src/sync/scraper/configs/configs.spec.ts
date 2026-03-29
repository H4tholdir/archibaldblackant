import { describe, expect, test } from 'vitest';
import type { ScraperConfig } from '../types';
import { customersConfig } from './customers';
import { ordersConfig } from './orders';
import { ddtConfig } from './ddt';
import { invoicesConfig } from './invoices';
import { productsConfig } from './products';
import { pricesConfig } from './prices';

const ERP_BASE_URL = 'https://4.231.124.90/Archibald/';
const MIN_COLUMN_COUNT = 5;

type ConfigEntry = { name: string; config: ScraperConfig };

const allConfigs: ConfigEntry[] = [
  { name: 'customersConfig', config: customersConfig },
  { name: 'ordersConfig', config: ordersConfig },
  { name: 'ddtConfig', config: ddtConfig },
  { name: 'invoicesConfig', config: invoicesConfig },
  { name: 'productsConfig', config: productsConfig },
  { name: 'pricesConfig', config: pricesConfig },
];

describe('ScraperConfig', () => {
  describe('url', () => {
    test.each(allConfigs)('$name has a valid ERP URL', ({ config }) => {
      expect(config.url.startsWith(ERP_BASE_URL)).toBe(true);
    });
  });

  describe('columns', () => {
    test.each(allConfigs)(`$name has at least ${MIN_COLUMN_COUNT} column mappings`, ({ config }) => {
      expect(config.columns.length).toBeGreaterThanOrEqual(MIN_COLUMN_COUNT);
    });

    test.each(allConfigs)('$name has unique targetField names', ({ config }) => {
      const targetFields = config.columns.map((c) => c.targetField);
      const unique = new Set(targetFields);
      expect(unique.size).toEqual(targetFields.length);
    });

    test.each(allConfigs)('$name has unique fieldName values', ({ config }) => {
      const fieldNames = config.columns.map((c) => c.fieldName);
      const unique = new Set(fieldNames);
      expect(unique.size).toEqual(fieldNames.length);
    });
  });

  describe('filter', () => {
    const configsWithFilter: ConfigEntry[] = allConfigs.filter(({ config }) => config.filter !== undefined);

    test.each(configsWithFilter)('$name filter has xafValuePattern and xafAllValue defined', ({ config }) => {
      expect(config.filter?.xafValuePattern).toBeDefined();
      expect(config.filter!.xafValuePattern.length).toBeGreaterThan(0);
      expect(config.filter?.xafAllValue).toBeDefined();
      expect(config.filter!.xafAllValue.length).toBeGreaterThan(0);
    });

    test.each(configsWithFilter)('$name xafAllValue contains xafValuePattern', ({ config }) => {
      expect(config.filter!.xafAllValue).toContain(config.filter!.xafValuePattern);
    });

    test('productsConfig has no filter', () => {
      expect(productsConfig.filter).toBeUndefined();
    });
  });
});

// ParsedXxx property sets extracted from the sync services.
// Each set contains exactly the keys declared in the corresponding type.

const parsedCustomerFields = new Set<string>([
  'erpId', 'name', 'vatNumber', 'fiscalCode', 'sdi', 'pec',
  'phone', 'mobile', 'email', 'url', 'attentionTo', 'street',
  'logisticsAddress', 'postalCode', 'city', 'customerType', 'type',
  'deliveryTerms', 'description', 'lastOrderDate', 'actualOrderCount',
  'previousOrderCount1', 'previousSales1', 'previousOrderCount2',
  'previousSales2', 'externalAccountNumber', 'ourAccountNumber', 'accountNum',
]);

const parsedOrderFields = new Set<string>([
  'id', 'orderNumber', 'customerProfileId', 'customerName', 'date',
  'deliveryDate', 'status', 'orderType', 'documentState', 'salesOrigin',
  'transferStatus', 'transferDate', 'completionDate', 'isQuote',
  'discountPercent', 'grossAmount', 'total', 'isGiftOrder',
  'deliveryName', 'deliveryAddress', 'orderDescription',
  'customerReference', 'email',
]);

const parsedDdtFields = new Set<string>([
  'orderNumber', 'ddtNumber', 'ddtDeliveryDate', 'ddtId',
  'ddtCustomerAccount', 'ddtSalesName', 'ddtDeliveryName',
  'deliveryTerms', 'deliveryMethod', 'deliveryCity', 'attentionTo',
  'ddtDeliveryAddress', 'ddtQuantity', 'ddtCustomerReference',
  'ddtDescription', 'trackingNumber', 'trackingUrl', 'trackingCourier',
]);

const parsedInvoiceFields = new Set<string>([
  'orderNumber', 'invoiceNumber', 'invoiceDate', 'invoiceAmount',
  'invoiceCustomerAccount', 'invoiceBillingName', 'invoiceQuantity',
  'invoiceRemainingAmount', 'invoiceTaxAmount', 'invoiceLineDiscount',
  'invoiceTotalDiscount', 'invoiceDueDate', 'invoicePaymentTermsId',
  'invoicePurchaseOrder', 'invoiceClosed', 'invoiceDaysPastDue',
  'invoiceSettledAmount', 'invoiceLastPaymentId', 'invoiceLastSettlementDate',
  'invoiceClosedDate',
]);

const parsedProductFields = new Set<string>([
  'id', 'name', 'searchName', 'groupCode', 'packageContent',
  'description', 'priceUnit', 'productGroupId', 'minQty', 'multipleQty',
  'maxQty', 'figure', 'bulkArticleId', 'legPackage', 'size', 'vat',
  'productGroupDescription', 'configurationId', 'createdBy', 'createdDateField',
  'dataAreaId', 'defaultQty', 'displayProductNumber', 'totalAbsoluteDiscount',
  'productIdExt', 'lineDiscount', 'modifiedBy', 'modifiedDatetime',
  'orderableArticle', 'stopped', 'purchPrice', 'pcsStandardConfigurationId',
  'standardQty', 'unitId',
]);

const parsedPriceFields = new Set<string>([
  'productId', 'productName', 'unitPrice', 'itemSelection',
  'packagingDescription', 'currency', 'priceValidFrom', 'priceValidTo',
  'priceUnit', 'accountDescription', 'accountCode', 'priceQtyFrom',
  'priceQtyTo', 'lastModified', 'dataAreaId',
]);

type TargetFieldEntry = { name: string; config: ScraperConfig; parsedFields: Set<string> };

const configsWithParsedTypes: TargetFieldEntry[] = [
  { name: 'customersConfig', config: customersConfig, parsedFields: parsedCustomerFields },
  { name: 'ordersConfig', config: ordersConfig, parsedFields: parsedOrderFields },
  { name: 'ddtConfig', config: ddtConfig, parsedFields: parsedDdtFields },
  { name: 'invoicesConfig', config: invoicesConfig, parsedFields: parsedInvoiceFields },
  { name: 'productsConfig', config: productsConfig, parsedFields: parsedProductFields },
  { name: 'pricesConfig', config: pricesConfig, parsedFields: parsedPriceFields },
];

describe('targetField matches ParsedXxx type', () => {
  test.each(configsWithParsedTypes)(
    'every targetField in $name is a valid property of its ParsedXxx type',
    ({ config, parsedFields }) => {
      const invalidFields = config.columns
        .map((c) => c.targetField)
        .filter((f) => !parsedFields.has(f));
      expect(invalidFields).toEqual([]);
    },
  );
});
