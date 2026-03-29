type FieldParser = (rawValue: string) => unknown;

type ColumnMapping = {
  fieldName: string;
  targetField: string;
  parser?: FieldParser;
};

type FilterConfig = {
  xafValuePattern: string;
  xafAllValue: string;
};

type FilterToggleWorkaround = {
  filterInputSelector: string;
  tempItemTexts: string[];   // e.g. ["Oggi", "Today"]
  finalItemTexts: string[];  // e.g. ["Tutti", "All"]
};

type ScraperConfig = {
  url: string;
  columns: ColumnMapping[];
  filter?: FilterConfig;
  pageSize?: number;
  filterToggleWorkaround?: FilterToggleWorkaround;
  /** Force DOM extraction instead of GetRowValues API, for pages where
   *  GetRowValues triggers slow server requests per row. */
  domExtraction?: true;
};

type ScrapedRow = Record<string, unknown>;

type RowExtractor = (cellTexts: string[]) => ScrapedRow;

export type {
  FieldParser,
  ColumnMapping,
  FilterConfig,
  FilterToggleWorkaround,
  ScraperConfig,
  ScrapedRow,
  RowExtractor,
};
