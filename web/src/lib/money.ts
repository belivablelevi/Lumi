export type Currency = "CAD";

/** An amount in the currency's minor unit (cents). */
export interface Money {
  readonly amount: number;
  readonly currency: Currency;
}

export function formatMoney(m: Money, locale = "en-CA"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    currencyDisplay: "narrowSymbol",
  }).format(m.amount / 100) + (m.currency === "CAD" ? " CAD" : "");
}

export function multiply(m: Money, qty: number): Money {
  return { amount: m.amount * qty, currency: m.currency };
}

export function sum(items: Money[], currency: Currency): Money {
  return { amount: items.reduce((t, m) => t + m.amount, 0), currency };
}
