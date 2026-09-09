/**
 * The business types offered at signup, in the order they are shown.
 *
 * Ids mirror backend/functions/src/services/businessTypes.ts — that file is
 * where the defaults live and where the reasoning is written down. This one
 * exists only so the list can be shown and translated; nothing here decides
 * anything.
 *
 * A type the server does not recognise is ignored rather than refused, so the
 * two lists drifting apart costs a customer nothing worse than the product
 * defaults.
 */
export const BUSINESS_TYPES = [
  "OFFICE",
  "CONSTRUCTION",
  "RETAIL",
  "TAILORING",
  "WAREHOUSE",
  "SECURITY",
  "RESTAURANT",
  "CLINIC",
  "SCHOOL",
  "NGO",
  "EXCHANGE",
  "TRANSPORT",
  "PRODUCTION",
  "AGRICULTURE",
  "HOSPITALITY",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];
