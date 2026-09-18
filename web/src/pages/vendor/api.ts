import { api } from "../../api/client";
import type {
  Account,
  Activity,
  BillingOrder,
  CompanySummary,
  Contact,
  Dashboard,
  Deal,
  Invoice,
  PlanDef,
  PlanId,
  Ticket,
} from "./types";

/**
 * The console's data access.
 *
 * Every path sits under /vendor, which the server gates on a claim no customer
 * can hold. There is deliberately no react-query here: the console is one
 * person's tool, refetching on demand is enough, and a cache would mostly
 * create staleness to reason about.
 */

const crm = <T>(entity: string) => ({
  list: (accountId?: string) =>
    api
      .get<T[]>(`/vendor/crm/${entity}`, accountId ? { accountId } : undefined)
      .then((e) => e.data),
  create: (body: unknown) =>
    api.post<T>(`/vendor/crm/${entity}`, body, false).then((e) => e.data),
  update: (id: string, body: unknown) =>
    api.put<T>(`/vendor/crm/${entity}/${id}`, body).then((e) => e.data),
  remove: (id: string) => api.del<void>(`/vendor/crm/${entity}/${id}`),
});

export const vendorApi = {
  companies: () => api.get<CompanySummary[]>("/vendor/companies").then((e) => e.data),
  setLicense: (companyId: string, body: unknown) =>
    api.put(`/vendor/companies/${companyId}/license`, body).then((e) => e.data),
  /** What a company has paid, newest first. */
  orders: (companyId: string) =>
    api.get<BillingOrder[]>(`/vendor/companies/${companyId}/orders`).then((e) => e.data),
  /** The price list every customer sees. Prices and caps only. */
  plans: () => api.get<Record<PlanId, PlanDef>>("/vendor/plans").then((e) => e.data),
  setPlans: (plans: Record<string, { priceAfn?: number; employeeLimit?: number; deviceLimit?: number }>) =>
    api.put<Record<PlanId, PlanDef>>("/vendor/plans", { plans }).then((e) => e.data),
  dashboard: () => api.get<Dashboard>("/vendor/crm/dashboard").then((e) => e.data),
  audit: () =>
    api
      .get<Array<Record<string, unknown>>>("/vendor/audit")
      .then((e) => e.data),

  accounts: crm<Account>("accounts"),
  contacts: crm<Contact>("contacts"),
  activities: crm<Activity>("activities"),
  deals: crm<Deal>("deals"),
  invoices: crm<Invoice>("invoices"),
  tickets: crm<Ticket>("tickets"),
};
