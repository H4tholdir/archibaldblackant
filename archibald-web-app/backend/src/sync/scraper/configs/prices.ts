import type { ScraperConfig } from '../types';
import { parseDate, parseNumber, parseCurrency } from './parsers';

const pricesConfig: ScraperConfig = {
  url: 'https://4.231.124.90/Archibald/PRICEDISCTABLE_ListView/',
  filter: {
    safeValue: 'Prezzi attivi',
    safeValueAlt: 'Active prices',
  },
  columns: [
    { fieldName: 'ITEMRELATIONID', targetField: 'productId' },
    { fieldName: 'ITEMRELATIONTXT', targetField: 'productName' },
    { fieldName: 'AMOUNT', targetField: 'unitPrice', parser: parseCurrency },
    { fieldName: 'CURRENCY', targetField: 'currency' },
    { fieldName: 'FROMDATE', targetField: 'priceValidFrom', parser: parseDate },
    { fieldName: 'TODATE', targetField: 'priceValidTo', parser: parseDate },
    { fieldName: 'PRICEUNIT', targetField: 'priceUnit' },
    { fieldName: 'ACCOUNTRELATIONTXT', targetField: 'accountDescription' },
    { fieldName: 'ACCOUNTRELATIONID', targetField: 'accountCode' },
    { fieldName: 'QUANTITYAMOUNTFROM', targetField: 'priceQtyFrom', parser: parseNumber },
    { fieldName: 'QUANTITYAMOUNTTO', targetField: 'priceQtyTo', parser: parseNumber },
    { fieldName: 'MODIFIEDDATETIME', targetField: 'lastModified', parser: parseDate },
    { fieldName: 'DATAAREAID', targetField: 'dataAreaId' },
  ],
};

export { pricesConfig };
