import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "../firebase";
import { api, ApiError } from "../api/client";
import type { Me } from "../api/types";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: Status;
  me: Me | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Manager roles allowed into the portal. Employees/kiosks are rejected. */
const MANAGER_ROLES = new Set([
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
  "BRANCH_MANAGER",
  "TEAM_LEAD",
  "AUDITOR",
]);

export class NoManagerAccessError extends Error {}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    // Resolve the session on load and whenever Firebase auth state changes
    // (e.g. token restored from persistence). GET /me gives roles + tenant.
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setMe(null);
        setStatus("signedOut");
        return;
      }
      try {
        const { data } = await api.get<Me>("/me");
        if (!data.roles.some((r) => MANAGER_ROLES.has(r))) {
          await firebaseSignOut(auth);
          setMe(null);
          setStatus("signedOut");
          return;
        }
        setMe(data);
        setStatus("signedIn");
      } catch (err) {
        // A valid Firebase user with no /me (not provisioned) is signed out.
        if (err instanceof ApiError) await firebaseSignOut(auth);
        setMe(null);
        setStatus("signedOut");
      }
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      me,
      signIn: async (email, password) => {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        const { data } = await api.get<Me>("/me");
        if (!data.roles.some((r) => MANAGER_ROLES.has(r))) {
          await firebaseSignOut(auth);
          throw new NoManagerAccessError();
        }
        setMe(data);
        setStatus("signedIn");
        void cred;
      },
      signOut: async () => {
        await firebaseSignOut(auth);
        setMe(null);
        setStatus("signedOut");
      },
    }),
    [status, me],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Client-side permission check mirroring the server RBAC catalog (UX only). */
export function useHasPermission(): (permission: string) => boolean {
  const { me } = useAuth();
  return (permission: string) => {
    if (!me) return false;
    if (me.roles.includes("COMPANY_ADMIN") || me.roles.includes("SUPER_ADMIN")) return true;
    return (ROLE_PERMISSIONS[permission] ?? []).some((role) => me.roles.includes(role));
  };
}

// Which roles grant each permission the portal gates on (subset of the server
// catalog in backend/functions/src/middleware/rbac.ts).
const ROLE_PERMISSIONS: Record<string, string[]> = {
  "employees:read": ["HR_ADMIN", "PAYROLL_ADMIN", "BRANCH_MANAGER", "TEAM_LEAD", "AUDITOR"],
  "employees:write": ["HR_ADMIN"],
  "attendance:read": ["HR_ADMIN", "PAYROLL_ADMIN", "BRANCH_MANAGER", "TEAM_LEAD", "AUDITOR"],
  "leave:approve": ["HR_ADMIN", "BRANCH_MANAGER", "TEAM_LEAD"],
};
