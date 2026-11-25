"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import { AnimatePresence, motion } from "framer-motion";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useCustomization } from "@/components/providers/CustomizationProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useGuestLock } from "@/components/providers/GuestLockProvider";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { useCommunity } from "@/components/providers/CommunityProvider";
import { usePwa } from "@/components/providers/PwaProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  DEFAULT_VOLUME,
  EQ_PRESETS,
  SPATIAL_MODES,
  useMusicPlayer,
  type EqPreset,
  type SpatialMode,
} from "@/components/providers/MusicPlayerProvider";

/** mm:ss — same shape the seek bar ticks in. */
function formatSeconds(value: number): string {
  const total = Math.max(0, Math.round(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type DockTab = "browse" | "library" | "dashboard" | "mixer";

/**
 * `chat` is not a shelf of the dock — it is the door to the community room,
 * which draws over the page like the console does, so it never lands in `tab`.
 */
type DockEntry = DockTab | "chat" | "customize" | "payments" | "support" | "settings";

const TABS: Array<{
  value: DockEntry;
  label: string;
  icon: "music" | "heart" | "gauge" | "sliders" | "message" | "sparkles" | "list";
  group: "Music" | "Studio" | "For you";
}> = [
  { value: "browse", label: "Discover", icon: "music", group: "Music" },
  { value: "library", label: "Your library", icon: "heart", group: "Music" },
  { value: "chat", label: "Community", icon: "message", group: "Music" },
  { value: "dashboard", label: "Audio desk", icon: "gauge", group: "Studio" },
  { value: "mixer", label: "Mixer", icon: "sliders", group: "Studio" },
  { value: "customize", label: "Customize", icon: "sparkles", group: "For you" },
  { value: "support", label: "Buy A Mug", icon: "heart", group: "For you" },
  { value: "settings", label: "Settings", icon: "sliders", group: "For you" },
  { value: "payments", label: "Payments", icon: "list", group: "For you" },
];

const BROWSE_LINKS: Array<{ label: string; id: string; icon: "search" | "globe" | "list" }> = [
  { label: "Search & discover", id: "top", icon: "search" },
  { label: "Explore languages", id: "region-library", icon: "globe" },
  { label: "All songs", id: "library-list", icon: "list" },
];

/** Rows share one rhythm so every list in the dock reads as a single column. */
const ROW =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Quiet uppercase heading above a group of controls. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-muted">
      {children}
    </h2>
  );
}

/** Small square control used in the dock's header and footer. */
function DockIcon({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="relative grid size-10 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-dock-hover hover:text-foreground active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  );
}

/**
 * The dock column itself. `wide` draws the full panel, `false` the icon rail.
 * The mobile drawer renders the same column at full width, which keeps both
 * presentations from drifting apart.
 */
function DockBody({ wide, mobile, onSignOut }: { wide: boolean; mobile: boolean; onSignOut: () => void }) {
  const [tab, setTab] = useState<DockTab>("browse");
  const {state:customizations}=useCustomization();
  const pathname = usePathname();
  const router = useRouter();
  const customizeOpen = pathname === "/customize";
  const paymentsOpen = pathname === "/payments";
  const supportOpen = pathname === "/support";
  const settingsOpen = pathname === "/settings";
  const accountPageOpen = customizeOpen || paymentsOpen || supportOpen || settingsOpen;
  const [heavyPending, setHeavyPending] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const {
    liked,
    playlists,
    createPlaylist,
    playLiked,
    playPlaylist,
    addToPlaylist,
    deletePlaylist,
  } = useLibrary();
  const { chatOpen, badge: chatBadge, openChat } = useCommunity();
  const {
    playing,
    queue,
    index,
    current,
    volume,
    muted,
    setVolume,
    preampDb,
    setPreampDb,
    balance,
    setBalance,
    rate,
    setRate,
    eqPreset,
    applyPreset,
    applyCustomPreset,
    spatialMode,
    setSpatialMode,
    nowPlayingOpen,
    setNowPlayingOpen,
    setSidebarWide,
    setMixerOpen,
    setMobileNavOpen,
    listenedSeconds,
    sessionPlays,
    getGraphInfo,
  } = useMusicPlayer();
  const { resolved, toggle } = useTheme();
  const { user, status: authStatus, personalExperience, personalThemeEnabled } = useAuth();
  const { requireAuth } = useGuestLock();
  const { canInstall, install } = usePwa();
  const accountName = user?.name ?? user?.email ?? user?.phone ?? "Account";
  const accountInitial = accountName.slice(0, 1).toUpperCase();

  // Live graph facts re-read on every dashboard render.
  const graph = getGraphInfo();

  const choosePreset = (preset: EqPreset) => {
    if (preset.heavy && eqPreset !== preset.label) {
      setHeavyPending(preset.label);
      return;
    }
    applyPreset(preset);
  };

  /** Jump to a section; a phone drawer steps aside before the page scrolls. */
  const go = (id: string) => {
    if (pathname !== "/") {
      router.push(id === "top" ? "/" : `/#${id}`);
      if (mobile) setMobileNavOpen(false);
      return;
    }
    const scroll = () =>
      id === "top"
        ? window.scrollTo({ top: 0, behavior: "smooth" })
        : document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

    if (mobile) {
      setMobileNavOpen(false);
      window.setTimeout(scroll, 140);
    } else {
      scroll();
    }
  };

  const submitPlaylist = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = createPlaylist(playlistName);
    if (!id) {
      setPlaylistError("That name is empty or already used.");
      return;
    }
    setPlaylistName("");
    setPlaylistError(null);
    setCreating(false);
  };

  const resetMixer = () => {
    setVolume(DEFAULT_VOLUME);
    setPreampDb(0);
    setBalance(0);
    setRate(1);
    applyPreset(EQ_PRESETS[0]);
    setSpatialMode("off");
  };

  const themeLabel = resolved === "dark" ? "Switch to light theme" : "Switch to dark theme";
  const closeDock = mobile ? () => setMobileNavOpen(false) : () => setSidebarWide(false);

  return (
    <>
      {/* Brand head — the dock's own switch lives up here. */}
      <div
        className={cn(
          "sidebar-brand flex min-h-20 flex-none items-center",
          wide ? "gap-3 px-5" : "justify-center px-0"
        )}
      >
        {wide ? (
          <>
            <span className="grid size-10 flex-none place-items-center rounded-2xl bg-accent text-accent-foreground shadow-sm">
              <Icon name="music" className="size-4" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-extrabold leading-none tracking-[0.14em] text-foreground">
                ZYRAVA
              </p>
              <p className="mt-1.5 truncate text-[11px] font-medium leading-none text-muted">
                {personalThemeEnabled ? "Your listening room" : "Find your next favourite"}
              </p>
            </div>
            <DockIcon label={mobile ? "Close the dock" : "Collapse dock (M)"} onClick={closeDock}>
              <Icon name={mobile ? "x" : "sidebar"} className="size-4" strokeWidth={1.9} />
            </DockIcon>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setSidebarWide(true)}
            title="Expand dock (M)"
            aria-label="Expand dock (M)"
            className="grid size-9 place-items-center rounded-[0.6rem] bg-accent text-accent-foreground transition-transform active:scale-95"
          >
            <Icon name="music" className="size-4" strokeWidth={2.2} />
          </button>
        )}
      </div>

      <div className="dock-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
      {/* Sections */}
      <nav
        aria-label="Dock sections"
        className={cn(
          "flex flex-none flex-col",
          wide ? "gap-1 px-3 pb-4 pt-1" : "items-center gap-1 px-2 py-3"
        )}
      >
        {TABS.filter((entry) => !personalExperience || entry.value === "browse" || entry.value === "library" || entry.value === "settings").map((entry, entryIndex, entries) => {
          const active = entry.value === "settings" ? settingsOpen : entry.value === "support" ? supportOpen : entry.value === "payments" ? paymentsOpen : entry.value === "customize" ? customizeOpen : entry.value === "chat" ? chatOpen : !chatOpen && !accountPageOpen && tab === entry.value;
          const badge=entry.value==="customize"?customizations.incoming.length:entry.value==="chat"?chatBadge:0;
          return (
            <Fragment key={entry.value}>
            {entryIndex === 0 || entries[entryIndex - 1].group !== entry.group ? (
              wide ? <p className={cn("px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted", entryIndex ? "pt-5" : "pt-2")}>{entry.group}</p>
                : entryIndex ? <span aria-hidden className="my-2 h-px w-6 bg-dock-line" /> : null
            ) : null}
            <button
              type="button"
              title={wide ? undefined : entry.label}
              aria-label={wide ? undefined : entry.label}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                /* The community room is an overlay, not another shelf — it never
                   takes the dock's own tab state with it. */
                if (entry.value === "customize" || entry.value === "payments" || entry.value === "support" || entry.value === "settings") {
                  if (!requireAuth("tab")) return;
                  router.push(`/${entry.value}`);
                  if (mobile) setMobileNavOpen(false);
                  return;
                }
                if (entry.value === "chat") {
                  if (!requireAuth("community")) return;
                  openChat();
                  if (mobile) setMobileNavOpen(false);
                  return;
                }
                /* Browsing the page is free; the shelves, the readings and the
                   console behind them are what an account is for. */
                const reason = entry.value === "mixer" ? "mixer" : "tab";
                if (entry.value !== "browse" && !requireAuth(reason)) return;
                setTab(entry.value);
                if (entry.value === "browse" && pathname !== "/") router.push("/");
                if (!wide) setSidebarWide(true);
              }}
              className={cn(
                "sidebar-nav-item relative flex items-center text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                wide
                  ? cn(
                      "min-h-11 w-full gap-3 rounded-xl px-3",
                      active
                        ? "sidebar-nav-active bg-accent-soft font-semibold text-brand"
                        : "font-medium text-muted hover:bg-dock-hover hover:text-foreground"
                    )
                  : cn(
                      "size-11 justify-center rounded-xl",
                      active
                        ? "sidebar-nav-active bg-accent-soft text-brand"
                        : "text-muted hover:bg-dock-hover hover:text-foreground"
                    )
              )}
            >
              <Icon
                name={entry.icon}
                className={cn("flex-none", wide ? "size-4.5" : "size-5", active && "text-brand")}
                strokeWidth={active ? 2.2 : 1.9}
              />
              {wide ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-start">{entry.label}</span>
                  {badge ? (
                    <span className="grid h-5 min-w-5 flex-none place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground tabular-nums">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : active ? (
                    <span aria-hidden className="size-1.5 flex-none rounded-full bg-accent" />
                  ) : null}
                </>
              ) : badge ? (
                <span
                  aria-hidden
                  className="absolute end-1.5 top-1.5 size-2 rounded-full bg-accent"
                />
              ) : null}
            </button>
            </Fragment>
          );
        })}
      </nav>

      {/* Panel body — the rail shows navigation only. */}
      {wide ? (
        <div className="mx-3 border-t border-dock-line pt-4">
          {accountPageOpen && tab === "browse" ? (
            <div className="px-2.5 py-2">
              <SectionLabel>Your listening room</SectionLabel>
              <p className="text-xs leading-relaxed text-muted">{settingsOpen ? "Update your profile photo and make your conversations feel more personal." : supportOpen ? "A little support helps keep Zyrava growing. Every contribution is optional." : paymentsOpen ? "Review your payments, their status, and what each checkout was for." : "Create a look, review designs made for you, or manage your saved customizations."}</p>
              <button type="button" className="mt-4 text-xs font-semibold text-brand" onClick={() => { router.push("/"); if (mobile) setMobileNavOpen(false); }}>Back to music</button>
            </div>
          ) : null}
          {tab === "browse" && !accountPageOpen ? (
            <div className="flex flex-col gap-0.5">
              <SectionLabel>On this page</SectionLabel>
              {BROWSE_LINKS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => go(link.id)}
                  className={cn(ROW, "text-muted hover:bg-dock-hover hover:text-foreground")}
                >
                  <Icon name={link.icon} className="size-4 flex-none" strokeWidth={1.9} />
                  <span className="truncate">{link.label}</span>
                </button>
              ))}

              <div aria-hidden className="my-2 h-px bg-dock-line" />

              <button
                type="button"
                onClick={() => setNowPlayingOpen(!nowPlayingOpen)}
                aria-pressed={nowPlayingOpen}
                className={cn(
                  ROW,
                  nowPlayingOpen
                    ? "bg-dock-active text-foreground"
                    : "text-muted hover:bg-dock-hover hover:text-foreground"
                )}
              >
                <Icon
                  name="waves"
                  className={cn("size-4 flex-none", nowPlayingOpen && "text-brand")}
                  strokeWidth={nowPlayingOpen ? 2.1 : 1.9}
                />
                <span className="truncate">Now playing panel</span>
              </button>
            </div>
          ) : null}

          {!personalExperience && tab === "dashboard" ? (
            <div className="flex flex-col gap-5">
              <section>
                <SectionLabel>This session</SectionLabel>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-dock-line">
                  <Stat label="Listening" value={formatSeconds(listenedSeconds)} />
                  <Stat
                    label="Queued"
                    value={`${queue.length || 0}`}
                    hint={`track ${Math.max(1, index + 1)}`}
                  />
                  <Stat label="Plays" value={`${sessionPlays}`} hint="this session" />
                  <Stat
                    label="Engine"
                    value={graph.webAudio ? "Web Audio" : "Native"}
                    hint={
                      graph.webAudio
                        ? `${graph.sampleRate ?? 48} kHz · ${graph.channels ?? 2} ch`
                        : "graph idle"
                    }
                  />
                </dl>
              </section>

              <section>
                <SectionLabel>Signal chain</SectionLabel>
                <ol className="flex flex-col divide-y divide-dock-line">
                  {[
                    { head: "Source", tail: current ? "320 kbps AAC" : "idle" },
                    {
                      head: "Pre-amp",
                      tail: `${preampDb > 0 ? "+" : ""}${preampDb.toFixed(0)} dB`,
                    },
                    { head: "EQ", tail: eqPreset },
                    {
                      head: "Space",
                      tail: SPATIAL_MODES.find((mode) => mode.value === spatialMode)?.label ?? "Off",
                    },
                    {
                      head: "Output",
                      tail: graph.webAudio ? `${graph.sampleRate ?? 48} kHz` : "element",
                    },
                  ].map((row) => (
                    <li
                      key={row.head}
                      className="flex items-baseline justify-between gap-3 px-2.5 py-2"
                    >
                      <span className="text-[12px] font-medium text-muted">{row.head}</span>
                      <span className="min-w-0 truncate text-[12px] font-semibold text-foreground">
                        {row.tail}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              {playing ? (
                <p className="flex items-center gap-2 rounded-lg bg-dock-active px-2.5 py-2 text-[11px] font-medium text-brand">
                  <Icon name="activity" className="size-3.5 flex-none" strokeWidth={2} />
                  Waveform live
                  <span className="eq ms-auto">
                    <span />
                    <span />
                    <span />
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          {tab === "library" ? (
            <div className="flex flex-col gap-5">
              <section>
                <SectionLabel>Liked songs</SectionLabel>
                <button
                  type="button"
                  onClick={() => {
                    playLiked();
                    if (mobile) setMobileNavOpen(false);
                  }}
                  className={cn(ROW, "text-muted hover:bg-dock-hover hover:text-foreground")}
                >
                  <span className="grid size-7 flex-none place-items-center rounded-full bg-danger-soft text-danger-soft-foreground">
                    <Icon name="heart" className="size-3.5 fill-current" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">Liked songs</span>
                  <span className="flex-none text-[10px] font-medium tabular-nums text-faint-foreground">
                    {liked.length}
                  </span>
                </button>
              </section>

              <section>
                <div className="flex items-center justify-between px-2.5 pb-2">
                  <h2 className="text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-muted">
                    Your playlists
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating((value) => !value);
                      setPlaylistError(null);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-foreground"
                  >
                    <Icon name="plus" className="size-3.5" strokeWidth={2} />
                    New
                  </button>
                </div>

                {creating ? (
                  <form onSubmit={submitPlaylist} className="mb-2 px-2.5">
                    <div className="flex gap-1.5">
                      <input
                        value={playlistName}
                        onChange={(event) => {
                          setPlaylistName(event.target.value);
                          setPlaylistError(null);
                        }}
                        maxLength={40}
                        placeholder="Playlist name"
                        aria-label="New playlist name"
                        className="compact-select h-9 min-w-0 flex-1 rounded-lg border border-dock-line bg-surface-secondary/50 px-2.5 text-foreground placeholder:text-faint-foreground"
                      />
                      <button
                        type="submit"
                        className="h-9 flex-none rounded-lg bg-accent px-2.5 text-[11px] font-semibold text-accent-foreground"
                      >
                        Add
                      </button>
                    </div>
                    {playlistError ? (
                      <p className="pt-1 text-[10px] text-danger-soft-foreground">{playlistError}</p>
                    ) : null}
                  </form>
                ) : null}

                <div className="flex flex-col gap-0.5">
                  {playlists.map((playlist) => (
                    <div key={playlist.id} className="group flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          playPlaylist(playlist.id);
                          if (mobile) setMobileNavOpen(false);
                        }}
                        className={cn(
                          ROW,
                          "min-w-0 flex-1 text-muted hover:bg-dock-hover hover:text-foreground"
                        )}
                        aria-label={`Play playlist ${playlist.name}`}
                      >
                        <Icon name="list" className="size-4 flex-none" strokeWidth={1.9} />
                        <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
                        <span className="flex-none text-[10px] tabular-nums text-faint-foreground">
                          {playlist.songs.length}
                        </span>
                      </button>
                      {current ? (
                        <button
                          type="button"
                          onClick={() => addToPlaylist(playlist.id, current)}
                          title="Add the playing song"
                          aria-label={`Add the playing song to ${playlist.name}`}
                          className="grid size-7 flex-none place-items-center rounded-md text-faint-foreground transition-colors hover:bg-dock-hover hover:text-foreground"
                        >
                          <Icon name="plus" className="size-3.5" strokeWidth={2} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => deletePlaylist(playlist.id)}
                        title="Delete playlist"
                        aria-label={`Delete playlist ${playlist.name}`}
                        className="grid size-7 flex-none place-items-center rounded-md text-faint-foreground transition-colors hover:bg-dock-hover hover:text-danger"
                      >
                        <Icon name="trash" className="size-3.5" strokeWidth={1.9} />
                      </button>
                    </div>
                  ))}

                  {!playlists.length && !creating ? (
                    <p className="px-2.5 pb-1 text-[11px] leading-relaxed text-faint-foreground">
                      Create a playlist, then add songs with the + button on any track.
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="px-2.5">
                <p className="rounded-lg bg-dock-active px-2.5 py-2 text-[10px] leading-relaxed text-muted">
                  Likes and playlists are saved on this device for your account.
                </p>
              </section>
            </div>
          ) : null}

          {!personalExperience && tab === "mixer" ? (
            <div className="flex flex-col gap-5">
              <section className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-2 px-2.5">
                  <h2 className="text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-muted">
                    Studio mixer
                  </h2>
                  <button
                    type="button"
                    onClick={resetMixer}
                    className="rounded-md text-[11px] font-medium text-muted transition-colors hover:text-foreground"
                  >
                    Reset
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMixerOpen(true);
                    if (mobile) setMobileNavOpen(false);
                  }}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-brand-foreground transition-colors hover:bg-brand-hover active:scale-[0.99]"
                >
                  <Icon name="sliders" className="size-4" strokeWidth={2.1} />
                  Open the sound console
                </button>
              </section>

              <section className="flex flex-col gap-4 px-2.5">
                <Fader
                  label="Master volume"
                  value={volume}
                  display={`${Math.round(volume * 100)}%${muted ? " (muted)" : ""}`}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => setVolume(value)}
                />
                <Fader
                  label="Pre-amp gain"
                  value={preampDb}
                  display={`${preampDb > 0 ? "+" : ""}${preampDb.toFixed(0)} dB`}
                  min={-6}
                  max={12}
                  step={1}
                  onChange={setPreampDb}
                  hint="Tips the whole chain hot — small steps go far"
                />
                <Fader
                  label="Balance L ↔ R"
                  value={balance}
                  display={
                    balance === 0
                      ? "centred"
                      : `${balance < 0 ? "L" : "R"} ${Math.abs(Math.round(balance * 100))}%`
                  }
                  min={-1}
                  max={1}
                  step={0.05}
                  onChange={setBalance}
                />
                <Fader
                  label="Tempo"
                  value={rate}
                  display={`${rate.toFixed(2)}×`}
                  min={0.7}
                  max={1.3}
                  step={0.05}
                  onChange={setRate}
                  hint="Pitch-true speed, no chipmunk"
                />
              </section>

              <section>
                <SectionLabel>Equalizer</SectionLabel>
                <div className="relative">
                  <select
                    aria-label="Equalizer preset"
                    value={eqPreset}
                    onChange={(event) => {
                      if (event.target.value === "Custom") {
                        applyCustomPreset();
                        return;
                      }
                      const preset = EQ_PRESETS.find((entry) => entry.label === event.target.value);
                      if (preset) choosePreset(preset);
                    }}
                    className="compact-select h-9 w-full cursor-pointer appearance-none rounded-lg bg-surface-secondary/60 ps-2.5 pe-8 font-medium text-foreground transition-colors hover:bg-surface-secondary"
                  >
                    <option value="Custom">Custom</option>
                    {EQ_PRESETS.map((preset) => (
                      <option key={preset.label} value={preset.label}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                  <Icon
                    name="chevron-right"
                    aria-hidden
                    className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 rotate-90 text-muted"
                    strokeWidth={2}
                  />
                </div>
              </section>

              <section>
                <SectionLabel>Space</SectionLabel>
                <div className="flex flex-wrap gap-1">
                  {SPATIAL_MODES.map((mode) => (
                    <Chip
                      key={mode.value}
                      active={spatialMode === mode.value}
                      title={mode.hint}
                      onClick={() => setSpatialMode(mode.value as SpatialMode)}
                    >
                      {mode.label}
                    </Chip>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      ) : (
        <div />
      )}
      </div>

      {/* Heavy preset hearing-safety dialog */}
      {heavyPending ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Heavy bass hearing warning"
          className="absolute inset-0 z-50 grid place-items-center bg-background/70 p-3 backdrop-blur-sm"
          onClick={() => setHeavyPending(null)}
        >
          <div
            className="w-full rounded-xl border border-dock-line bg-surface p-4 shadow-pop"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-semibold text-foreground">{heavyPending} — ear check</p>
            <p className="pb-3 pt-2 text-xs leading-relaxed text-muted">
              Heavy-duty profiles push big speaker stacks hard. Keep the volume as loud as it needs
              to be — no louder.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setHeavyPending(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  applyPreset(
                    EQ_PRESETS.find((preset) => preset.label === heavyPending) ?? EQ_PRESETS[0]
                  );
                  setHeavyPending(null);
                }}
              >
                Enable
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Footer — what is playing, plus the theme switch. */}
      <div
        className={cn(
          "flex-none border-t border-dock-line",
          wide ? "px-3 py-3" : "flex flex-col items-center gap-1 px-2 py-2"
        )}
      >
        {wide ? (
          <>
            {mobile && current ? <button
              type="button"
              onClick={() => { setNowPlayingOpen(!nowPlayingOpen); setMobileNavOpen(false); }}
              aria-pressed={nowPlayingOpen}
              title={`Now playing: ${current.title}`}
              className="group flex w-full items-center gap-2.5 rounded-lg p-1.5 text-start transition-colors hover:bg-dock-hover"
            >
              <span className="relative grid size-8 flex-none place-items-center overflow-clip rounded-md bg-surface">
                <Icon name="music" className="size-3.5 text-faint-foreground" aria-hidden />
                {current?.image ? (
                  <Image
                    src={current.image}
                    alt=""
                    width={64}
                    height={64}
                    sizes="32px"
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : null}
                {playing ? (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold leading-tight text-foreground">
                  {current ? current.title : "Nothing queued"}
                </span>
                <span className="mt-1 block truncate text-[10px] font-medium leading-none text-faint-foreground">
                  {current
                    ? `${playing ? "Playing" : "Paused"} · ${current.artist}`
                    : "Pick a track to begin"}
                </span>
              </span>
              {current && playing ? (
                <span aria-hidden className="eq flex-none text-brand">
                  <span />
                  <span />
                  <span />
                </span>
              ) : null}
            </button> : null}

            <div className="flex items-center justify-between gap-1">
              {authStatus === "loading" ? (
                <span aria-hidden className="h-9" />
              ) : authStatus === "authenticated" && user ? (
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    aria-hidden
                    className="grid size-7 flex-none place-items-center rounded-full bg-accent-soft text-[10px] font-bold uppercase text-brand"
                  >
                    {user.avatarUrl ? <Image src={user.avatarUrl} alt="" width={72} height={72} className="size-full rounded-full object-cover" /> : accountInitial}
                  </span>
                  <span
                    className="min-w-0 max-w-[8rem] truncate text-xs font-semibold text-foreground"
                    title={accountName}
                  >
                    {accountName}
                  </span>
                  <DockIcon label="Sign out" onClick={onSignOut}>
                    <Icon name="log-out" className="size-4" strokeWidth={1.9} />
                  </DockIcon>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[12px] font-medium text-muted transition-colors hover:bg-dock-hover hover:text-foreground"
                >
                  <Icon name="user" className="size-4" strokeWidth={1.9} />
                  Sign in
                </Link>
              )}
              <div className="flex flex-none items-center gap-1">
                {canInstall ? (
                  <DockIcon label="Download the app" onClick={() => void install()}>
                    <Icon name="download" className="size-4" strokeWidth={1.9} />
                  </DockIcon>
                ) : null}
                {!personalExperience ? <DockIcon label={themeLabel} onClick={toggle}>
                  <Icon
                    name={resolved === "dark" ? "sun" : "moon"}
                    className="size-4"
                    strokeWidth={1.9}
                  />
                </DockIcon> : null}
              </div>
            </div>
          </>
        ) : (
          <>
            {current?.image ? (
              <button
                type="button"
                onClick={() => setNowPlayingOpen(!nowPlayingOpen)}
                aria-pressed={nowPlayingOpen}
                title={current.title}
                aria-label="Now playing panel"
                className="relative size-9 overflow-clip rounded-lg bg-surface active:scale-95"
              >
                <Image
                  src={current.image}
                  alt=""
                  width={72}
                  height={72}
                  sizes="36px"
                  className="size-full object-cover"
                />
                {playing ? (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />
                ) : null}
              </button>
            ) : null}
            {authStatus === "authenticated" && user ? (
              <div className="flex flex-col items-center gap-1">
                <span
                  title={accountName}
                  className="grid size-9 place-items-center rounded-full bg-accent-soft text-[11px] font-bold uppercase text-brand"
                >
                  {user.avatarUrl ? <Image src={user.avatarUrl} alt="" width={72} height={72} className="size-full rounded-full object-cover" /> : accountInitial}
                </span>
                <DockIcon label="Sign out" onClick={onSignOut}>
                  <Icon name="log-out" className="size-4" strokeWidth={1.9} />
                </DockIcon>
              </div>
            ) : authStatus === "anonymous" ? (
              <Link
                href="/login"
                title="Sign in"
                aria-label="Sign in"
                className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-dock-hover hover:text-foreground"
              >
                <Icon name="user" className="size-4" strokeWidth={1.9} />
              </Link>
            ) : null}
            {canInstall ? (
              <DockIcon label="Download the app" onClick={() => void install()}>
                <Icon name="download" className="size-4" strokeWidth={1.9} />
              </DockIcon>
            ) : null}
            {!personalExperience ? <DockIcon label={themeLabel} onClick={toggle}>
              <Icon
                name={resolved === "dark" ? "sun" : "moon"}
                className="size-4"
                strokeWidth={1.9}
              />
            </DockIcon> : null}
          </>
        )}
      </div>
    </>
  );
}

/**
 * The left dock: a collapsed icon rail on narrow desktops, a wide panel on
 * wider ones, and a slide-in drawer on phones. The header carries the dock's
 * own open/close switch, so it never moves out of reach.
 */
/** How long the drawer's exit runs before the modal itself closes. */
const DRAWER_MS = 260;

export function SideBar() {
  const { sidebarWide, setSidebarWide, mobileNavOpen, setMobileNavOpen } = useMusicPlayer();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const requestLogout = () => {
    // Release the native drawer's top-layer focus before opening confirmation.
    dialogRef.current?.close();
    setMobileNavOpen(false);
    setLogoutOpen(true);
  };


  /* The native modal gives Escape, focus trapping and the backdrop for free;
   * only the panel is styled — and it slides, so the drawer leaves the way it
   * arrived instead of vanishing mid-gesture. */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (mobileNavOpen && !dialog.open) dialog.showModal();
    else if (!mobileNavOpen && dialog.open) {
      const timer = setTimeout(() => dialog.close(), DRAWER_MS);
      return () => clearTimeout(timer);
    }
  }, [mobileNavOpen]);

  // The drawer is a phone affordance; a resize to desktop closes it.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 48rem)");
    const onChange = () => {
      if (query.matches) setMobileNavOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [setMobileNavOpen]);

  // Keyboard: M toggles the dock like a pro DAW.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) {
        return;
      }
      if (event.key.toLowerCase() === "m" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        setSidebarWide(!sidebarWide);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarWide, setSidebarWide]);

  /* The dock body re-fades each time the width tips: restarting the CSS
     animation (via a reflow) keeps DockBody's own state — the chosen tab, a
     half-written playlist — while the content still cross-fades over the
     width spring. */
  const morphRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const body = morphRef.current;
    if (!body) return;
    body.classList.remove("dock-morph-run");
    void body.offsetWidth;
    body.classList.add("dock-morph-run");
  }, [sidebarWide]);

  return (
    <>
      <aside
        aria-label="ZYRAVA dock"
        data-wide={sidebarWide || undefined}
        style={{ bottom: "var(--player-bar-height, 0px)" }}
        className={cn(
          "sidebar-shell fixed top-0 start-0 z-30 hidden flex-col overflow-clip border-e border-dock-line bg-dock md:flex",
          "dock-width",
          sidebarWide ? "w-[var(--dock-wide)]" : "w-[var(--dock-rail)]"
        )}
      >
        {/* The body cross-fades over the width spring (class re-triggered by
            the effect below), so the rail reads as one body easing wide. */}
        <div ref={morphRef} className="dock-morph">
          <DockBody wide={sidebarWide} mobile={false} onSignOut={requestLogout} />
        </div>
      </aside>

      <dialog
        ref={dialogRef}
        aria-label="ZYRAVA dock"
        onClose={() => setMobileNavOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setMobileNavOpen(false);
        }}
        className="fixed inset-0 z-50 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm md:hidden"
      >
        <AnimatePresence>
          {mobileNavOpen ? (
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
              className="sidebar-shell flex h-full w-[min(21rem,88vw)] flex-col rounded-e-3xl border-e border-dock-line bg-dock shadow-pop"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
              <DockBody wide mobile onSignOut={requestLogout} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </dialog>
      {logoutOpen ? <ConfirmDialog
        open title="Sign out of ZYRAVA?"
        description="You'll need to sign in again to access your account."
        confirmLabel="Sign out" cancelLabel="Stay signed in"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => { setLogoutOpen(false); void logout(); }}
      /> : null}
    </>
  );
}

/** One cell of the session grid — label, figure, optional footnote. */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-dock px-3 py-2.5">
      <dt className="text-[9px] font-semibold uppercase leading-none tracking-[0.12em] text-faint-foreground">
        {label}
      </dt>
      <dd className="mt-1.5 text-[15px] font-semibold leading-none tracking-tight text-foreground tabular-nums">
        {value}
      </dd>
      {hint ? (
        <p className="mt-1 truncate text-[10px] font-medium leading-none text-faint-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A labelled range fader with its live readout. */
function Fader({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-muted">{label}</p>
        <span className="text-[11px] font-semibold tabular-nums text-foreground">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer rounded-full"
        style={{ accentColor: "var(--accent)" }}
      />
      {hint ? (
        <p className="mt-1.5 text-[10px] leading-relaxed text-faint-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Compact pill for the space picker. */
function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-7 rounded-full px-2.5 text-[11px] font-semibold transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "bg-surface-secondary/50 text-muted hover:bg-surface-secondary hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
