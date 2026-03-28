import type { ScraperConfig } from '../types';
import { parseDate, parseNumber, parseCurrency } from './parsers';

const productsConfig: ScraperConfig = {
  url: 'https://4.231.124.90/Archibald/INVENTTABLE_ListView/',
  columns: [
    { fieldName: 'ITEMID', targetField: 'id' },
    { fieldName: 'NAME', targetField: 'name' },
    { fieldName: 'SEARCHNAME', targetField: 'searchName' },
    { fieldName: 'PRODUCTGROUPID.ID', targetField: 'groupCode' },
    { fieldName: 'BRASPACKINGCONTENTS', targetField: 'packageContent', parser: parseNumber },
    { fieldName: 'DESCRIPTION', targetField: 'description' },
    { fieldName: 'PRICEUNIT', targetField: 'priceUnit' },
    { fieldName: 'PRODUCTGROUPID.PRODUCTGROUPID', targetField: 'productGroupId' },
    { fieldName: 'LOWESTQTY', targetField: 'minQty', parser: parseNumber },
    { fieldName: 'MULTIPLEQTY', targetField: 'multipleQty', parser: parseNumber },
    { fieldName: 'HIGHESTQTY', targetField: 'maxQty', parser: parseNumber },
    { fieldName: 'BRASFIGURE', targetField: 'figure' },
    { fieldName: 'BRASITEMIDBULK', targetField: 'bulkArticleId' },
    { fieldName: 'BRASPACKAGEEXPERTS', targetField: 'legPackage' },
    { fieldName: 'BRASSIZE', targetField: 'size' },
    { fieldName: 'TAXITEMGROUPID', targetField: 'vat', parser: parseNumber },
    { fieldName: 'PRODUCTGROUPID.PRODUCTGROUP1', targetField: 'productGroupDescription' },
    { fieldName: 'CONFIGID', targetField: 'configurationId' },
    { fieldName: 'CREATEDBY', targetField: 'createdBy' },
    { fieldName: 'CREATEDDATETIME', targetField: 'createdDateField', parser: parseDate },
    { fieldName: 'DATAAREAID', targetField: 'dataAreaId' },
    { fieldName: 'DEFAULTSALESQTY', targetField: 'defaultQty' },
    { fieldName: 'DISPLAYPRODUCTNUMBER', targetField: 'displayProductNumber' },
    { fieldName: 'ENDDISC', targetField: 'totalAbsoluteDiscount' },
    { fieldName: 'ID', targetField: 'productIdExt' },
    { fieldName: 'LINEDISC.ID', targetField: 'lineDiscount' },
    { fieldName: 'MODIFIEDBY', targetField: 'modifiedBy' },
    { fieldName: 'MODIFIEDDATETIME', targetField: 'modifiedDatetime', parser: parseDate },
    { fieldName: 'ORDERITEM', targetField: 'orderableArticle' },
    { fieldName: 'STOPPED', targetField: 'stopped' },
    { fieldName: 'PURCHPRICEPCS', targetField: 'purchPrice', parser: parseCurrency },
    { fieldName: 'STANDARDCONFIGID', targetField: 'pcsStandardConfigurationId' },
    { fieldName: 'STANDARDQTY', targetField: 'standardQty' },
    { fieldName: 'UNITID', targetField: 'unitId' },
  ],
};

export { productsConfig };
