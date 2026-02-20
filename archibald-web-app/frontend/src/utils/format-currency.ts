const fullFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

const compactFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

export function formatCurrency(amount: number): string {
  return fullFormatter.format(amount);
}

export function formatCurrencyCompact(amount: number): string {
  return compactFormatter.format(amount);
}

export function formatCurrencyWithCurrency(
  amount: number,
  currency: string,
): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(amount);
}

export function formatPrice(price: number | null): string {
  if (price === null) return "N/A";
  return fullFormatter.format(price);
}

export function formatPriceFromString(
  amount: number | string | null | undefined,
): string {
  if (amount === null || amount === undefined) return "€ 0,00";

  if (typeof amount === "string") {
    if (amount.includes("€") || amount.includes(",")) {
      return amount;
    }
    const parsed = parseFloat(amount.replace(",", "."));
    if (isNaN(parsed)) return "€ 0,00";
    amount = parsed;
  }

  if (amount === 0) return "€ 0,00";

  return fullFormatter.format(amount);
}
