"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import {
  customizationVariables,
  isCustomizationExpired,
  type AppliedCustomization,
  type CustomizationState,
} from "@/lib/customization";
import {
  parseCustomizationWelcome,
  readCustomizationWelcome,
  rememberCustomizationWelcome,
  subscribeCustomizationWelcome,
} from "@/lib/customization-welcome";
import { useAuth } from "./AuthProvider";

interface ContextValue {
  active: AppliedCustomization | null;
  loadingAppearance: AppliedCustomization | null;
  state: CustomizationState;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  respond: (id: string, accept: boolean, updatedAt: string) => Promise<void>;
  reset: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}
const EMPTY: CustomizationState = {
  active: null,
  incoming: [],
  received: [],
  outgoing: [],
};
const Context = createContext<ContextValue | null>(null);
export function CustomizationProvider({ children }: { children: ReactNode }) {
  const { user, status, personalExperience, returningPersonalEmail } =
    useAuth();
  const eligible = status === "authenticated" && !!user && !personalExperience;
  const owner = eligible ? user.id : null;
  const ownerRef = useRef(owner);
  useLayoutEffect(() => {
    ownerRef.current = owner;
  }, [owner]);
  const [record, setRecord] = useState<{
    owner: string;
    state: CustomizationState;
  } | null>(null);
  const [activity, setActivity] = useState<{
    owner: string;
    busy: boolean;
    error: string | null;
  } | null>(null);
  const generation = useRef(0);
  const writingOwner = useRef<string | null>(null);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  const rawHint = useSyncExternalStore(
    subscribeCustomizationWelcome,
    readCustomizationWelcome,
    () => null,
  );
  const hint = useMemo(() => parseCustomizationWelcome(rawHint), [rawHint]);
  const state = owner && record?.owner === owner ? record.state : EMPTY;
  const candidate = eligible
    ? record?.owner === owner
      ? record.state.active
      : (user.customization ?? null)
    : null;
  const loadingCandidate =
    status === "loading" && !returningPersonalEmail
      ? (hint?.active ?? null)
      : null;
  // Recheck locally even when offline; background tabs recheck on return.
  const [, tick] = useState(0);
  const active = isCustomizationExpired(candidate) ? null : candidate;
  const loadingAppearance = isCustomizationExpired(loadingCandidate)
    ? null
    : loadingCandidate;
  const expiry = (candidate ?? loadingCandidate)?.expiresAt;
  useEffect(() => {
    if (!expiry) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      tick((value) => value + 1);
      const remaining = Date.parse(expiry) - Date.now();
      if (remaining > 0)
        timer = setTimeout(check, Math.min(remaining, 2_147_000_000));
    };
    timer = setTimeout(
      check,
      Math.max(0, Math.min(Date.parse(expiry) - Date.now(), 2_147_000_000)),
    );
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [expiry]);
  const appearance = active ?? loadingAppearance;
  const busy = activity?.owner === owner && activity.busy;
  const error = activity?.owner === owner ? activity.error : null;

  const request = useCallback(
    async (path: string, body?: unknown) => {
      if (!owner || (path === "/" && writingOwner.current === owner)) return;
      const writing = body !== undefined;
      if (writing) writingOwner.current = owner;
      const revision = ++generation.current;
      setActivity({ owner, busy: true, error: null });
      try {
        const next = await apiFetch<CustomizationState>(
          `/api/customization${path}`,
          body === undefined ? {} : { method: "POST", body },
        );
        if (ownerRef.current !== owner)
          throw new Error("Your account changed. Please try again.");
        if (revision === generation.current) {
          setRecord({ owner, state: next });
          setActivity({ owner, busy: false, error: null });
        }
      } catch (err) {
        if (ownerRef.current === owner && revision === generation.current)
          setActivity({
            owner,
            busy: false,
            error:
              err instanceof Error
                ? err.message
                : "Could not load customization.",
          });
        throw err;
      } finally {
        if (writing && writingOwner.current === owner)
          writingOwner.current = null;
      }
    },
    [owner],
  );
  const refresh = useCallback(() => request("/"), [request]);
  useEffect(() => {
    if (!owner) return;
    let alive = true;
    queueMicrotask(() => {
      if (alive) void refresh().catch(() => undefined);
    });
    const onFocus = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      invalidate();
    };
  }, [owner, refresh, invalidate]);
  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    rememberCustomizationWelcome(
      active && !personalExperience
        ? { userId: user.id, email: user.email, active }
        : null,
    );
  }, [status, user, active, personalExperience]);
  useLayoutEffect(() => {
    if (
      !appearance ||
      personalExperience ||
      (returningPersonalEmail && status === "loading")
    )
      return;
    const root = document.documentElement,
      vars = customizationVariables(appearance.config);
    const previous = Object.fromEntries(
      Object.keys(vars).map((key) => [key, root.style.getPropertyValue(key)]),
    );
    root.dataset.customized = "true";
    for (const [key, value] of Object.entries(vars))
      root.style.setProperty(key, value);
    return () => {
      delete root.dataset.customized;
      for (const [key, value] of Object.entries(previous)) {
        if (value) root.style.setProperty(key, value);
        else root.style.removeProperty(key);
      }
    };
  }, [appearance, personalExperience, returningPersonalEmail, status]);
  const respond = useCallback(
    (id: string, accept: boolean, updatedAt: string) =>
      request("/respond", { id, accept, updatedAt }),
    [request],
  );
  const remove = useCallback(
    (id: string) => request("/remove", { id }),
    [request],
  );
  const reset = useCallback(() => request("/reset", {}), [request]);
  const value = useMemo(
    () => ({
      active,
      loadingAppearance,
      state,
      busy: !!busy,
      error,
      refresh,
      respond,
      reset,
      remove,
    }),
    [
      active,
      loadingAppearance,
      state,
      busy,
      error,
      refresh,
      respond,
      reset,
      remove,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCustomization() {
  const value = useContext(Context);
  if (!value) throw new Error("CustomizationProvider is missing");
  return value;
}
