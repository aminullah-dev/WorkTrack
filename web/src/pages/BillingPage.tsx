import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useBilling, useBillingOrder, useBillingOrders, useStartCheckout } from "../api/hooks";
import { useHasPermission } from "../auth/AuthProvider";
import type { BillingPlan } from "../api/types";
import { useI18n } from "../i18n/LocaleProvider";
import { Chip, EmptyState, ErrorState, LoadingState } from "../ui/components";

/**
 * The plan the company is on, and buying the next one.
 *
 * Payment is a redirect to HesabPay and back. Nothing here decides that a
 * payment succeeded: the server learns that from HesabPay's own callback, and
 * this page waits for the order to flip. A customer who closes the tab halfway
 * through still gets what they paid for, which is the whole reason it works
 * this way rather than on the return URL.
 */
export function BillingPage() {
  const { t, num, shamsi } = useI18n();
  const can = useHasPermission();
  // Anyone signed in may see the plan; only an administrator may change it.
  const canManage = can("billing:manage");

  const billing = useBilling();
  const orders = useBillingOrders(canManage);
  const checkout = useStartCheckout();
  const queryClient = useQueryClient();

  const [params, setParams] = useSearchParams();
  const returnedOrderId = params.get("order");
  const returned = useBillingOrder(canManage ? returnedOrderId : null);

  // Prices are grouped before the digits are localised, the way the payroll
  // sheet does it: 35,000 is readable at a glance and 35000 is not.
  const money = (n: number): string => num(n.toLocaleString("en-US"));

  const [term, setTerm] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);

  // The callback has landed: the licence on screen is a version old.
  useEffect(() => {
    if (returned.data?.status === "PAID") {
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
      void queryClient.invalidateQueries({ queryKey: ["license"] });
    }
  }, [returned.data?.status, queryClient]);

  if (billing.isLoading) return <LoadingState />;
  if (billing.isError || !billing.data) {
    return <ErrorState message={t("common_error")} onRetry={() => void billing.refetch()} />;
  }

  const { plans, current } = billing.data;

  async function buy(plan: BillingPlan) {
    setError(null);
    setLeaving(plan.id);
    try {
      const started = await checkout.mutateAsync({ plan: plan.id, term });
      // Off to HesabPay. The order is already recorded, so the payment can be
      // finished from the list below even if this navigation is interrupted.
      window.location.assign(started.checkoutUrl);
    } catch (e) {
      setLeaving(null);
      setError(e instanceof Error && e.message ? e.message : t("common_error"));
    }
  }

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("bill_title")}</h1>
        <Chip tone={current.state === "ACTIVE" ? "positive" : "warning"}>
          {t(`plan_${current.plan.toLowerCase()}`)}
        </Chip>
      </div>

      {current.state === "GRACE" && (
        <div className="notice notice-warning" style={{ marginBottom: 16 }}>
          {t("bill_grace_notice", num(current.daysLeft ?? 0))}
        </div>
      )}
      {current.state === "LAPSED" && (
        <div className="notice notice-warning" style={{ marginBottom: 16 }}>
          {t("bill_lapsed_notice")}
        </div>
      )}
      {returnedOrderId && returned.data && (
        <div className="notice notice-warning" style={{ marginBottom: 16 }}>
          {returned.data.status === "PAID"
            ? t("bill_result_paid")
            : returned.data.status === "FAILED"
              ? t("bill_result_failed")
              : t("bill_result_pending")}{" "}
          <button
            type="button"
            className="btn btn-sm btn-outline"
            style={{ marginInlineStart: 8 }}
            onClick={() => {
              params.delete("order");
              params.delete("result");
              setParams(params, { replace: true });
            }}
          >
            {t("common_close")}
          </button>
        </div>
      )}

      {/* What the company has now */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="card-title">{t("bill_current")}</h2>
        <dl className="license-facts">
          <div>
            <dt>{t("bill_plan")}</dt>
            <dd>{t(`plan_${current.plan.toLowerCase()}`)}</dd>
          </div>
          <div>
            <dt>{t("bill_expires")}</dt>
            <dd dir={current.expiresAt ? "ltr" : undefined}>
              {current.expiresAt ? shamsi(current.expiresAt, { withYear: true }) : t("bill_never")}
            </dd>
          </div>
          <div>
            <dt>{t("bill_employees")}</dt>
            <dd>{t("bill_used_of", num(current.employeesInUse), num(current.employeeLimit))}</dd>
          </div>
          <div>
            <dt>{t("bill_devices")}</dt>
            <dd>{t("bill_used_of", num(current.devicesInUse), num(current.deviceLimit))}</dd>
          </div>
        </dl>
        {current.state === "ACTIVE" && current.daysLeft !== null && current.daysLeft <= 30 && (
          <p className="hint" style={{ marginTop: 12 }}>
            {t("bill_days_left", num(current.daysLeft))}
          </p>
        )}
        {!current.enforced && (
          <p className="hint" style={{ marginTop: 12 }}>
            {t("bill_not_enforced")}
          </p>
        )}
      </div>

      {/* What it can move to */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <h2 className="card-title" style={{ margin: 0 }}>
            {t("bill_plans")}
          </h2>
          <div className="chip-set">
            <button
              type="button"
              className={`chip-toggle ${term === "MONTHLY" ? "on" : ""}`}
              onClick={() => setTerm("MONTHLY")}
            >
              {t("bill_term_monthly")}
            </button>
            <button
              type="button"
              className={`chip-toggle ${term === "YEARLY" ? "on" : ""}`}
              onClick={() => setTerm("YEARLY")}
            >
              {t("bill_term_yearly")}
            </button>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          {term === "YEARLY" ? t("bill_yearly_hint") : t("bill_monthly_hint")}
        </p>

        <div className="plan-grid">
          {plans.map((plan) => {
            const isCurrent = plan.id === current.plan;
            const price = term === "YEARLY" ? plan.yearlyAfn : plan.priceAfn;
            return (
              <div key={plan.id} className={`plan-card${isCurrent ? " current" : ""}`}>
                <div className="plan-head">
                  <h3>{t(`plan_${plan.id.toLowerCase()}`)}</h3>
                  {isCurrent && <Chip tone="neutral">{t("bill_current_badge")}</Chip>}
                </div>
                <p className="plan-price">
                  <strong>{money(price)}</strong>{" "}
                  <span>{term === "YEARLY" ? t("bill_per_year") : t("bill_per_month")}</span>
                </p>
                <ul className="plan-caps">
                  <li>{t("bill_cap_employees", num(plan.employeeLimit))}</li>
                  <li>{t("bill_cap_devices", num(plan.deviceLimit))}</li>
                </ul>
                <ul className="plan-features">
                  {plan.features.map((f) => (
                    <li key={f}>{t(`cap_${f.toLowerCase()}`)}</li>
                  ))}
                </ul>
                {plan.blockedReason && (
                  <p className="hint">
                    {plan.blockedReason === "EMPLOYEES"
                      ? t("bill_blocked_employees")
                      : t("bill_blocked_devices")}
                  </p>
                )}
                <button
                  type="button"
                  className={`btn ${isCurrent ? "btn-outline" : "btn-primary"}`}
                  disabled={!canManage || plan.blockedReason !== null || leaving !== null}
                  onClick={() => void buy(plan)}
                >
                  {leaving === plan.id
                    ? t("bill_redirecting")
                    : isCurrent
                      ? t("bill_renew")
                      : t("bill_choose")}
                </button>
              </div>
            );
          })}
        </div>

        {!canManage && (
          <p className="hint" style={{ marginTop: 12 }}>
            {t("bill_admin_only")}
          </p>
        )}
        {error && (
          <p className="form-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}
        <p className="hint" style={{ marginTop: 12 }}>
          {t("bill_pay_hint")}
        </p>
      </div>

      {/* What it has paid */}
      {canManage && (
        <div className="card" style={{ padding: 0 }}>
          <h2 style={{ margin: 0, padding: "16px 20px", fontSize: 16 }}>{t("bill_orders")}</h2>
          {orders.isLoading ? (
            <LoadingState />
          ) : (orders.data ?? []).length === 0 ? (
            <EmptyState message={t("bill_no_orders")} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("bill_order_date")}</th>
                    <th>{t("bill_order_plan")}</th>
                    <th>{t("bill_order_amount")}</th>
                    <th>{t("bill_order_status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(orders.data ?? []).map((o) => (
                    <tr key={o.id}>
                      <td dir="ltr">{o.createdAt ? shamsi(o.createdAt.slice(0, 10), { withYear: true }) : "—"}</td>
                      <td>
                        {t(`plan_${o.plan.toLowerCase()}`)} ·{" "}
                        {o.term === "YEARLY" ? t("bill_term_yearly") : t("bill_term_monthly")}
                      </td>
                      <td>{t("bill_afn", money(o.amountAfn))}</td>
                      <td>
                        <Chip
                          tone={
                            o.status === "PAID"
                              ? "positive"
                              : o.status === "FAILED"
                                ? "negative"
                                : "neutral"
                          }
                        >
                          {t(`bill_status_${o.status.toLowerCase()}`)}
                        </Chip>
                      </td>
                      <td className="row-actions">
                        {o.status === "PENDING" && o.checkoutUrl && (
                          <a className="btn btn-sm btn-outline" href={o.checkoutUrl}>
                            {t("bill_order_continue")}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
