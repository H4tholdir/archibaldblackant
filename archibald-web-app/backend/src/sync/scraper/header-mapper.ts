import type { ColumnMapping, RowExtractor, ScrapedRow } from './types';

function buildRowExtractor(
  columns: ColumnMapping[],
  fieldMap: Record<string, number>,
): RowExtractor {
  const plan = columns.map((col) => ({
    targetField: col.targetField,
    index: fieldMap[col.fieldName] ?? -1,
    parser: col.parser,
  }));

  return (cellTexts: string[]): ScrapedRow => {
    const row: ScrapedRow = {};
    for (const { targetField, index, parser } of plan) {
      const raw = index >= 0 && index < cellTexts.length ? cellTexts[index] : undefined;
      if (raw === undefined) {
        row[targetField] = undefined;
      } else if (parser) {
        row[targetField] = parser(raw);
      } else {
        row[targetField] = raw;
      }
    }
    return row;
  };
}

export { buildRowExtractor };
