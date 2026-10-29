/**
 * Facts the business hasn't confirmed yet (price, dispatch window, terms…).
 * They're typed so a missing fact can't be rendered as if it were real:
 * pages show "To be confirmed" and the catalogue checks refuse to sell.
 */
export type Placeholder = { readonly placeholder: true; readonly note: string };
export type Maybe<T> = T | Placeholder;

export const tbc = (note: string): Placeholder => ({ placeholder: true, note });

export function isPlaceholder(value: unknown): value is Placeholder {
  return typeof value === "object" && value !== null && (value as { placeholder?: unknown }).placeholder === true;
}

export function confirmed<T>(value: Maybe<T> | undefined): T | undefined {
  return value === undefined || isPlaceholder(value) ? undefined : value;
}

export const TBC_LABEL = "To be confirmed";

export function display<T>(value: Maybe<T> | undefined, format: (v: T) => string = String): string {
  const v = confirmed(value);
  return v === undefined ? TBC_LABEL : format(v);
}
