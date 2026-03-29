import type { ScraperConfig } from '../types';
import { parseDate, parseNumber, parseCurrency } from './parsers';

const ddtConfig: ScraperConfig = {
  url: 'https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/',
  filter: {
    xafValuePattern: 'PackingSlipsAll',
    xafAllValue: 'xaf_xaf_a2ListViewPackingSlipsAll',
  },
  columns: [
    { fieldName: 'SALESID', targetField: 'orderNumber' },
    { fieldName: 'PACKINGSLIPID', targetField: 'ddtNumber' },
    { fieldName: 'DELIVERYDATE', targetField: 'ddtDeliveryDate', parser: parseDate },
    { fieldName: 'ID', targetField: 'ddtId', parser: (raw) => String(parseNumber(raw) ?? raw) },
    { fieldName: 'ORDERACCOUNT', targetField: 'ddtCustomerAccount' },
    { fieldName: 'SALESTABLE.SALESNAME', targetField: 'ddtSalesName' },
    { fieldName: 'DELIVERYNAME', targetField: 'ddtDeliveryName' },
    { fieldName: 'DLVTERM.TXT', targetField: 'deliveryTerms' },
    { fieldName: 'DLVMODE.TXT', targetField: 'deliveryMethod' },
    { fieldName: 'DLVCITY', targetField: 'deliveryCity' },
    { fieldName: 'BRASCRMATTENTIONTO', targetField: 'attentionTo' },
    { fieldName: 'DLVADDRESS', targetField: 'ddtDeliveryAddress' },
    { fieldName: 'QTY', targetField: 'ddtTotal', parser: parseCurrency },
    { fieldName: 'CUSTOMERREF', targetField: 'ddtCustomerReference' },
    { fieldName: 'PURCHASEORDER', targetField: 'ddtDescription' },
    { fieldName: 'BRASTRACKINGNUMBER', targetField: 'trackingNumber' },
  ],
};

export { ddtConfig };
