type FieldParser = (rawValue: string) => unknown;

type ColumnMapping = {
  fieldName: string;
  targetField: string;
  parser?: FieldParser;
};

type FilterConfig = {
  safeValue: string;
  safeValueAlt?: string;
};

type ScraperConfig = {
  url: string;
  columns: ColumnMapping[];
  filter?: FilterConfig;
  pageSize?: number;
};

type ScrapedRow = Record<string, unknown>;

type RowExtractor = (cellTexts: string[]) => ScrapedRow;

export type {
  FieldParser,
  ColumnMapping,
  FilterConfig,
  ScraperConfig,
  ScrapedRow,
  RowExtractor,
};
