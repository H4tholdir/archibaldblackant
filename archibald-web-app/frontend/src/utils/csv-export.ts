export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const csvContent = [
    headers.map(escapeCsvField).join(";"),
    ...rows.map((row) => row.map(escapeCsvField).join(";")),
  ].join("\r\n");

  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
