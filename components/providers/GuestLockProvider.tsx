"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/components/providers/AuthProvider";

const PUBLIC_ROUTES = new Set(["/login", "/register"]);

/** The app gets a moment on screen before it asks anything — the same beat the
 *  download offer uses, so a visitor hears about music first, never twice. */
const ARRIVE_DELAY = 900;

/** Session flag: this tab already turned down the welcome ask. */
const LOGIN_MARK = "zyrava:login-dismissed";

export type GuestLockReason =
  | "playback"
  | "paging"
  | "tab"
  | "like"
  | "playlist"
  | "mixer"
  | "browse";

const COPY: Record<GuestLockReason, { title: string; description: string }> = {
  playback: {
    title: "That was the free ten",
    description: "Every visitor gets one page of songs to try the sound out. An account opens the rest.",
  },
  paging: {
    title: "The next page is members' only",
    description: "Signed in, the list runs as deep as the catalogue goes.",
  },
  tab: {
    title: "This shelf needs an account",
    description: "Playlists, saved songs and the files on this device all belong to a member.",
  },
  like: {
    title: "Likes are kept on your account",
    description: "Sign in and the songs you love are waiting for you on every device.",
  },
  playlist: {
    title: "Playlists are kept on your account",
    description: "Sign in to build a queue that survives the tab being closed.",
  },
  mixer: {
    title: "The console is members' only",
    description: "Equalizer, spatial audio and the mixer unlock with an account.",
  },
  browse: {
    title: "Sign in to keep exploring",
    description: "The first ten songs are on the house — everything past them is for members.",
  },
};

const PERKS = [
  "Every page of the catalogue, and a queue that keeps walking into more.",
  "Liked songs and playlists, waiting on any device you sign in from.",
  "The mixer: equalizer, spatial audio, crossfade and the DJ pads.",
];

interface GuestLockValue {
  /** A visitor this device has never held an account for. */
  isGuest: boolean;
  loginOpen: boolean;
  /** Opens the ask regardless of whether this tab already turned it down. */
  requestLogin: (reason?: GuestLockReason) => void;
  closeLogin: () => void;
  /** True means "carry on"; false means the ask is now on screen. */
  requireAuth: (reason?: GuestLockReason) => boolean;
}

const GuestLockContext = createContext<GuestLockValue | null>(null);

/**
 * The single place that knows a visitor is listening on trial. Locked surfaces
 * ask it before doing anything account-backed, so one modal stands over the
 * whole app instead of one per button.
 */
export function GuestLockProvider({ children }: { children: ReactNode }) {
  const { status, expired } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isGuest = status === "anonymous" && !expired;

  const [loginOpen, setLoginOpen] = useState(false);
  const [reason, setReason] = useState<GuestLockReason>("browse");

  /* The locked call sites are wrapped in their own useCallbacks, so the guards
     here must never change identity — the live guest flag is read from a ref
     instead of closing over one. */
  const isGuestRef = useRef(isGuest);
  useEffect(() => {
    isGuestRef.current = isGuest;
  }, [isGuest]);

  const requestLogin = useCallback((next: GuestLockReason = "browse") => {
    if (!isGuestRef.current) return;
    setReason(next);
    setLoginOpen(true);
  }, []);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
    /* Turning the welcome down keeps it down for the tab. Hitting a wall later
       still asks again — that path never reads this mark. */
    try {
      window.sessionStorage.setItem(LOGIN_MARK, "1");
    } catch {
      /* the session simply forgets the forgetting */
    }
  }, []);

  const requireAuth = useCallback(
    (next: GuestLockReason = "browse") => {
      if (!isGuestRef.current) return true;
      setReason(next);
      setLoginOpen(true);
      return false;
    },
    []
  );

  useEffect(() => {
    if (!isGuest || PUBLIC_ROUTES.has(pathname)) return;
    try {
      if (window.sessionStorage.getItem(LOGIN_MARK) === "1") return;
    } catch {
      /* storage off keeps the asking standing */
    }
    const timer = window.setTimeout(() => {
      setReason("browse");
      setLoginOpen(true);
    }, ARRIVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [isGuest, pathname]);

  const goLogin = () => {
    setLoginOpen(false);
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.push(`/login${next}`);
  };

  const value = useMemo(
    () => ({ isGuest, loginOpen, requestLogin, closeLogin, requireAuth }),
    [isGuest, loginOpen, requestLogin, closeLogin, requireAuth]
  );

  const copy = COPY[reason];

  return (
    <GuestLockContext.Provider value={value}>
      {children}
      <Modal
        /* Derived rather than cleared by an effect: signing in mid-ask takes
           the door down itself, with no cascading render. */
        open={loginOpen && isGuest}
        onClose={closeLogin}
        title={copy.title}
        description={copy.description}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={closeLogin}>
              Keep listening
            </Button>
            <Button variant="primary" onClick={goLogin}>
              <Icon name="user" className="size-4" />
              Sign in
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {PERKS.map((line) => (
              <li key={line} className="flex items-start gap-2 text-xs text-muted">
                <Icon name="check" className="mt-0.5 size-3.5 flex-none text-brand" strokeWidth={2.4} />
                {line}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-faint-foreground">
            No card, no store, no extra app —{" "}
            <Link
              href="/register"
              className="font-semibold text-brand underline-offset-4 hover:underline"
            >
              create one
            </Link>{" "}
            instead if this is your first time here.
          </p>
        </div>
      </Modal>
    </GuestLockContext.Provider>
  );
}

export function useGuestLock(): GuestLockValue {
  const context = useContext(GuestLockContext);
  if (!context) throw new Error("useGuestLock must be used inside GuestLockProvider");
  return context;
}
