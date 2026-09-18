/**
 * The HesabPay wire protocol, as their live API actually behaves.
 *
 * Two calls are made outward — open a checkout session, and ask HesabPay
 * whether a callback's signature is genuine — and one comes back in, the
 * webhook. Everything that can be decided without the network is a pure
 * function here so it can be tested without one.
 *
 * Field names are deliberately forgiving. The checkout link comes back as
 * `url`, not the `payment_url` the published docs suggest, and the callback has
 * been seen carrying both `transaction_id` and `transactionId`; reading both
 * costs nothing and a rename on their side would otherwise mean a payment that
 * the customer made and the product never recorded.
 */

export interface HesabItem {
  id: string;
  name: string;
  price: number;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

function headers(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `API-KEY ${apiKey}`,
  };
}

export class HesabError extends Error {}

/**
 * Whether a merchant key is real.
 *
 * Firebase refuses to deploy a function that declares a secret which does not
 * exist, so a project that is not selling yet still has to hold something. The
 * placeholder is spelled out rather than guessed at, and a company that tries
 * to pay against it is told payment is not set up instead of being sent to a
 * checkout that cannot work.
 */
export function isConfigured(apiKey: string | undefined): boolean {
  const value = (apiKey ?? "").trim();
  return value !== "" && value.toLowerCase() !== "not-configured";
}

/**
 * Opens a checkout session. The item id is the order id, which is how the
 * callback is matched back to what was being paid for.
 */
export async function createCheckoutSession(opts: {
  apiKey: string;
  baseUrl: string;
  email: string;
  item: HesabItem;
  successUrl: string;
  failureUrl: string;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}): Promise<CheckoutSession> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl}/payment/create-session`, {
    method: "POST",
    headers: headers(opts.apiKey),
    body: JSON.stringify({
      email: opts.email,
      items: [opts.item],
      redirect_success_url: opts.successUrl,
      redirect_failure_url: opts.failureUrl,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.success !== true) {
    throw new HesabError(
      `HesabPay refused the checkout session (${res.status}): ${
        typeof body.message === "string" ? body.message : JSON.stringify(body)
      }`,
    );
  }

  const url = (body.url as string) || (body.payment_url as string) || "";
  if (!url) throw new HesabError("HesabPay returned a session with no checkout url");

  return { sessionId: (body.session_id as string) || "", url };
}

/**
 * Asks HesabPay whether a callback really came from them.
 *
 * The signature is computed over the timestamp rather than the body, so this
 * says only "HesabPay sent something at that moment". What the callback then
 * claims still has to be bound to an order by id and by amount — see
 * services/billing.ts.
 */
export async function verifyWebhookSignature(opts: {
  apiKey: string;
  baseUrl: string;
  signature: string;
  timestamp: string | number;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl}/hesab/webhooks/verify-signature`, {
    method: "POST",
    headers: headers(opts.apiKey),
    body: JSON.stringify({ signature: opts.signature, timestamp: opts.timestamp }),
  });
  if (!res.ok) return false;
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return body.valid === true || body.verified === true || body.success === true;
}

/**
 * Hands a callback that matched no order of ours to the product that shares
 * this HesabPay account.
 *
 * Nothing is asserted on its behalf: it verifies the signature with the same
 * key and matches the payment against its own records, so forwarding grants no
 * trust. Never throws and never waits long — a callback we could not pass on is
 * a line in the log, not a 500 for HesabPay to retry against.
 */
export async function forwardCallback(
  url: string,
  payload: unknown,
  fetchImpl?: typeof fetch,
  timeoutMs = 10_000,
): Promise<boolean> {
  if (!url) return false;
  const doFetch = fetchImpl ?? fetch;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: abort.signal,
    });
    return res.ok;
  } catch (e) {
    console.error("HESAB_FORWARD_FAILED", { url, error: e });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------- pure callbacks

export interface WebhookPayload {
  status_code?: number | string;
  success?: boolean;
  status?: string;
  message?: string;
  transaction_id?: string;
  transactionId?: string;
  sender_account?: string;
  amount?: number | string;
  signature?: string;
  timestamp?: string | number;
  session_id?: string;
  sessionId?: string;
  items?: Array<{ id?: string; name?: string; price?: number }>;
  email?: string;
}

/** HesabPay's success marker: `success: true`, or status code 10. */
export function isPaidSignal(p: WebhookPayload): boolean {
  if (p.success === true) return true;
  if (String(p.status_code ?? "") === "10") return true;
  const status = String(p.status ?? "").toUpperCase();
  return status === "PAID" || status === "SUCCESS" || status === "COMPLETED";
}

/**
 * Only an explicit failure counts. An unknown or intermediate callback is left
 * alone: treating "not obviously paid" as failed would cancel orders that are
 * still in flight.
 */
export function isFailSignal(p: WebhookPayload): boolean {
  if (p.success === false) return true;
  const status = String(p.status ?? "").toUpperCase();
  return status === "FAILED" || status === "CANCELLED" || status === "CANCELED";
}

/** The callback's timestamp in milliseconds, whichever unit it arrived in. */
export function timestampMs(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Whether a callback is recent enough to act on.
 *
 * The signature only proves HesabPay signed that timestamp, so a captured
 * (signature, timestamp) pair could be replayed forever. Generous, because
 * clock skew is real and a webhook retried after an outage is worth accepting.
 */
export function isFresh(
  value: string | number | undefined,
  nowMs: number,
  maxAgeMs = 24 * 60 * 60 * 1000,
): boolean {
  const sentAt = timestampMs(value);
  if (sentAt === null) return false;
  return Math.abs(nowMs - sentAt) <= maxAgeMs;
}

/** The order this callback is about: the item id we set at session creation. */
export function orderIdOf(p: WebhookPayload): string | null {
  const id = Array.isArray(p.items) && p.items.length > 0 ? String(p.items[0].id ?? "") : "";
  return id || null;
}

export function transactionIdOf(p: WebhookPayload): string | null {
  const id = String(p.transaction_id ?? p.transactionId ?? "");
  return id || null;
}

export function amountOf(p: WebhookPayload): number | null {
  const n = Number(p.amount);
  return Number.isFinite(n) ? n : null;
}
