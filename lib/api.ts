"use client";

/*
 * Account calls are relative on purpose: next.config proxies them to the API
 * host, which keeps their cookies first-party. Calling the API host directly
 * makes Safari and Firefox drop the CSRF and session cookies, and every
 * sign-in comes back "Invalid or missing CSRF token".
 */

export class ApiError extends Error {
  readonly status: number;
  readonly details?: Array<{ path: string; message: string }>;

  constructor(message: string, status = 0, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  createdAt?: string;
}

interface SessionPayload {
  user: AuthUser;
  accessToken: string;
}

/*
 * The access token lives in memory only — never localStorage — so an XSS bug
 * cannot lift a long-lived credential. The durable part is the httpOnly
 * refresh cookie, and CSRF is the double-submit token below.
 */
let accessToken: string | null = null;
let csrfToken: string | null = null;
let csrfInFlight: Promise<string> | null = null;
let refreshInFlight: Promise<SessionPayload | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function requestCsrf(force = false): Promise<string> {
  if (!force && csrfToken) return csrfToken;
  if (!csrfInFlight) {
    csrfInFlight = fetch("/api/auth/csrf", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { csrfToken?: string; error?: string }
          | null;
        if (!response.ok || !payload?.csrfToken) {
          throw new ApiError(payload?.error ?? "Could not start a secure session.", response.status);
        }
        csrfToken = payload.csrfToken;
        return csrfToken;
      })
      .finally(() => {
        csrfInFlight = null;
      });
  }
  return csrfInFlight;
}

interface ApiOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Send the bearer token; false for auth bootstrap calls. */
  auth?: boolean;
  /** Internal: prevents an infinite retry loop. */
  retried?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };

  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method === "POST") headers["X-CSRF-Token"] = await requestCsrf();
  if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("Cannot reach the account server. Check that the API is running.");
  }

  // A stale CSRF cookie or an expired access token gets exactly one retry.
  if (!options.retried && (response.status === 403 || response.status === 401)) {
    if (response.status === 403 && method === "POST") {
      await requestCsrf(true);
      return apiFetch<T>(path, { ...options, retried: true });
    }
    if (response.status === 401 && options.auth !== false) {
      const refreshed = await refreshSession();
      if (refreshed) return apiFetch<T>(path, { ...options, retried: true });
    }
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string; details?: Array<{ path: string; message: string }> })
    | null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? "The request failed. Please try again.",
      response.status,
      payload?.details
    );
  }

  return payload as T;
}

/** One shared refresh so React StrictMode's double effect cannot rotate twice. */
export function refreshSession(): Promise<SessionPayload | null> {
  if (!refreshInFlight) {
    refreshInFlight = apiFetch<SessionPayload>("/api/auth/refresh", {
      method: "POST",
      auth: false,
    })
      .then((session) => {
        setAccessToken(session.accessToken);
        return session;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export interface LoginInput {
  identifier: string;
  password: string;
  remember: boolean;
}

export interface RegisterInput {
  name?: string;
  email?: string;
  phone?: string;
  password: string;
  remember: boolean;
}

export async function loginRequest(input: LoginInput): Promise<AuthUser> {
  const session = await apiFetch<SessionPayload>("/api/auth/login", {
    method: "POST",
    body: input,
    auth: false,
  });
  setAccessToken(session.accessToken);
  return session.user;
}

export async function registerRequest(input: RegisterInput): Promise<AuthUser> {
  const session = await apiFetch<SessionPayload>("/api/auth/register", {
    method: "POST",
    body: input,
    auth: false,
  });
  setAccessToken(session.accessToken);
  return session.user;
}

export async function logoutRequest(): Promise<void> {
  try {
    await apiFetch<void>("/api/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}
