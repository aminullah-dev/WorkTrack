/**
 * How a person is paid, as opposed to how much.
 *
 * Monthly salary was the only model this system had, and it does not fit the
 * two kinds of business the product is most often sold to. A construction firm
 * hires by the day: twenty days worked is twenty days' wage. A tailoring
 * workshop pays by the piece: it does not matter how long a garment took.
 *
 * Everything here is pure, because it decides what a person is paid.
 */

export type PayModel = "MONTHLY" | "DAILY" | "PIECE";

export const PAY_MODELS: readonly PayModel[] = ["MONTHLY", "DAILY", "PIECE"];

export function isPayModel(value: unknown): value is PayModel {
  return typeof value === "string" && (PAY_MODELS as readonly string[]).includes(value);
}

export interface EarnedBasic {
  /** The basic pay this period actually earned. */
  amount: number;
  /**
   * Whether unpaid absence should ALSO be charged against this.
   *
   * This flag is the whole reason the module exists. A monthly salary is paid
   * whole and then reduced for days not worked. A daily wage already contains
   * that: a worker absent ten days is paid for the twenty they came, and
   * nothing is owed for the ten. Charging loss-of-pay on top would take those
   * ten days off TWICE — once by not paying them, once by deducting them — and
   * a worker absent half a month would go home with nothing.
   */
  chargeUnpaidAbsence: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * What the basic pay comes to, and whether absence is still to be deducted.
 *
 * `rate` means whatever the model says it means — a monthly salary, a day's
 * wage, or the price of one piece — which is why it is stored in one field and
 * read through here rather than being three fields somebody has to keep
 * consistent.
 *
 * An unknown model is treated as MONTHLY: a company whose record predates this
 * is on a monthly salary, and the alternative is a payroll run that refuses to
 * pay anybody.
 */
export function earnedBasic(params: {
  model: PayModel | string | null | undefined;
  rate: number;
  /** Days actually worked, halves included. */
  workedDays: number;
  /** Pieces completed in the period. Ignored unless the model is PIECE. */
  pieces?: number;
}): EarnedBasic {
  const rate = Number.isFinite(params.rate) ? Math.max(0, params.rate) : 0;

  switch (params.model) {
    case "DAILY":
      return {
        amount: round2(rate * Math.max(0, params.workedDays)),
        chargeUnpaidAbsence: false,
      };

    case "PIECE":
      // Days are irrelevant here on purpose. Somebody who finished the work in
      // three days is owed for the work, and somebody who sat all month and
      // finished nothing is owed nothing — which is what the company agreed to
      // and what makes this model worth having.
      return {
        amount: round2(rate * Math.max(0, params.pieces ?? 0)),
        chargeUnpaidAbsence: false,
      };

    default:
      return { amount: round2(rate), chargeUnpaidAbsence: true };
  }
}

/**
 * What to call the rate on screen, so a number is never shown without saying
 * what it is a rate FOR.
 *
 * "30,000" against a daily worker is a fortune; against a monthly one it is a
 * salary. The label is not decoration.
 */
export function rateLabelKey(model: PayModel | string | null | undefined): string {
  switch (model) {
    case "DAILY":
      return "pay_rate_daily";
    case "PIECE":
      return "pay_rate_piece";
    default:
      return "pay_rate_monthly";
  }
}
