"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Pagination, PageHeader, SegmentedControl } from "@/components/ui/Controls";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState, Notice, Skeleton, Spinner } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/icons";
import { RegionCarousel } from "@/components/features/music/RegionCarousel";
import { SpotifyPanel } from "@/components/features/music/SpotifyPanel";
import { NowPlayingPanel } from "@/components/features/music/NowPlayingPanel";
import { SearchWithSuggestions } from "@/components/features/music/SearchWithSuggestions";
import { PlaylistsView } from "@/components/features/music/PlaylistsView";
import { LikedView } from "@/components/features/music/LikedView";
import { DownloadsView, OfflineView } from "@/components/features/music/DeviceViews";
import { SaveToDevice } from "@/components/features/music/SongRows";
import { ImportSongsModal } from "@/components/features/music/ImportSongsModal";
import { PlaylistStrip } from "@/components/features/music/PlaylistStrip";
import { VIBES } from "@/components/features/music/filters";
import { REGIONS } from "@/components/features/music/regions";
import { rankSongs } from "@/lib/recommend";
import { Waveform } from "@/components/features/music/Waveform";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { useOffline } from "@/components/providers/OfflineProvider";
import { cn } from "@/lib/cn";
import { dedupeSongs, songFingerprint, type Song } from "@/lib/saavn";

const PAGE_SIZE = 10;
/** How far playback may walk through the pages of one search on its own. */
const MAX_CHAIN_PAGES = 12;

type ViewMode = "small" | "large" | "list";

const VIEW_OPTIONS = [
  { value: "list", label: "List", icon: <Icon name="list" aria-hidden /> },
  { value: "small", label: "Compact grid", icon: <Icon name="grid" aria-hidden /> },
  { value: "large", label: "Large grid", icon: <Icon name="image" aria-hidden /> },
] as const;

const DEFAULT_VIEW: ViewMode = "list";

const HOME_TABS = [
  { value: "songs", label: "Songs" },
  { value: "playlists", label: "Playlists" },
  { value: "liked", label: "Liked songs" },
  { value: "downloads", label: "Downloads" },
  { value: "offline", label: "Offline" },
] as const;

type HomeTab = (typeof HOME_TABS)[number]["value"];

/** The quiet word at the end of the tab bar, one per panel. */
const TAB_EYEBROW: Record<HomeTab, string> = {
  songs: "Catalogue",
  playlists: "Collections",
  liked: "Saved",
  downloads: "On this device",
  offline: "Your files",
};

const GRID_COLS: Record<Exclude<ViewMode, "list">, string> = {
  small: "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6",
  large: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4",
};

const IMAGE_SIZES: Record<ViewMode, string> = {
  small: "(min-width:1024px) 13vw, (min-width:640px) 22vw, 30vw",
  large: "(min-width:1280px) 24vw, (min-width:640px) 30vw, 50vw",
  list: "56px",
};

interface Library {
  /** The region label|attempt combo this chunk belongs to. */
  termKey: string;
  songs: Song[];
  total: number;
  /** True when a batch produced nothing new — pagination is pointless then. */
  drained: boolean;
}

type PagePayload = { songs?: Song[]; total?: number };
type PageResult = PagePayload | { error: string } | null;

export default function MusicPage() {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState<string>(REGIONS[0].label);
  const [batch, setBatch] = useState(0);
  /** Bumped by "Retry" to force a refetch without changing the query. */
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<ViewMode>(DEFAULT_VIEW);
  const [homeTab, setHomeTab] = useState<HomeTab>("songs");
  const [importOpen, setImportOpen] = useState(false);

  /* Multi-check filters — languages and "why am I listening" vibes. An empty
   * language set falls back to the active region, empty vibes to plain hits. */
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);

  /** Cover images for the region cards, fetched once on mount. */
  const [covers, setCovers] = useState<Record<string, string>>({});

  const [library, setLibrary] = useState<Library>({
    termKey: "",
    songs: [],
    total: 0,
    drained: false,
  });
  const [error, setError] = useState<string | null>(null);

  // Playback state is app-wide — provided by the shell's MusicPlayerProvider
  // so the queue keeps playing across tab switches and in background tabs.
  const {
    queue,
    index,
    playing,
    queueLabel,
    visualizerReady,
    getAnalyser,
    startQueue,
    appendQueue,
    repeat,
    nowPlayingOpen,
    sidebarWide,
    setMobileNavOpen,
    shuffle,
    toggleShuffle,
  } = useMusicPlayer();

  const { isLiked, toggleLike, openPicker } = useLibrary();
  const { locals } = useOffline();

  /** First look at the Offline tab is the import pitch — an empty list alone
   *  would just read as a broken feature. */
  const openTab = (value: HomeTab) => {
    setHomeTab(value);
    if (value === "offline" && !locals.length) setImportOpen(true);
  };

  const baseRegion = useMemo(
    () => REGIONS.find((candidate) => candidate.label === term) ?? REGIONS[0],
    [term]
  );

  /** A region chip was picked (or nothing was typed) — otherwise this is a
   *  free-text search, and the typed phrase becomes the query itself. */
  const isRegion = useMemo(
    () => REGIONS.some((candidate) => candidate.label === term),
    [term]
  );
  const freeText = isRegion ? "" : term.trim();
  /** Catalogue playlist query: the typed phrase, or the region's own opener. */
  const playlistQuery = freeText || baseRegion.queries[0] || "top playlists";
  /** Tracks per numbered page: ten songs, then next. */
  const pageSize = PAGE_SIZE;

  /** The regions the filter bar currently counts — selected, or the active one. */
  const activeRegions = useMemo(
    () =>
      selectedLangs.length
        ? REGIONS.filter((candidate) => selectedLangs.includes(candidate.label))
        : [baseRegion],
    [selectedLangs, baseRegion]
  );
  /** The checked vibes, resolved to full definitions (preserving chip order). */
  const activeVibes = useMemo(
    () => VIBES.filter((vibe) => selectedVibes.includes(vibe.value)),
    [selectedVibes]
  );
  /** Signature of the whole filter selection — any change is a new library. */
  const filterKey = `${selectedLangs.join(">")}|${selectedVibes.join(">")}`;

  const requestKey = `${term}|${filterKey}|${batch}|${attempt}`;
  const termKey = `${term}|${filterKey}|${attempt}`;
  const [loadedKey, setLoadedKey] = useState("");
  const fetching = loadedKey !== requestKey;

  const requestRef = useRef(0);

  /**
   * Page chaining: playback started from this list walks the numbered pages
   * 1 → 2 → 3 … instead of looping the ten songs it began with. `key` is the
   * term+filters the queue belongs to, `page` the last page already handed to
   * the queue, `firstId` the track that opened it and `turnToken` the position
   * that most recently asked for a page, so one page end turns exactly once.
   */
  const chain = useRef<{ key: string; page: number; firstId: string; turnToken: string; empties: number } | null>(
    null
  );

  const activeId = queue[index]?.id ?? null;

  /** Toggles a language chip — any change resets the page counter. */
  const toggleLang = (label: string) => {
    setSelectedLangs((prev) =>
      prev.includes(label) ? prev.filter((value) => value !== label) : [...prev, label]
    );
    setBatch(0);
  };

  /** Toggles a vibe chip — same reset, new query shape. */
  const toggleVibe = (value: string) => {
    setSelectedVibes((prev) =>
      prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]
    );
    setBatch(0);
  };

  /** Clears every filter chip in one tap. */
  const clearFilters = () => {
    setSelectedLangs([]);
    setSelectedVibes([]);
    setBatch(0);
  };

  /** Opens a region below and brings the library into view. A region card is
   * a single-language pick, so it also pins the language chips to just that
   * region — chips and cards never disagree about what should load. */
  const openRegion = (label: string) => {
    setInput("");
    setTerm(label);
    setBatch(0);
    setSelectedLangs([label]);
    if (term !== label) setAttempt((value) => value + 1);
    document
      .getElementById("region-library")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** A page turn replaces the ten visible songs, then rests on the list. */
  const openPage = (value: number) => {
    setBatch(value);
    document
      .getElementById("library-list")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /**
   * Carousel play — starts the region's catalogue immediately: fetches its
   * first page, queues it and opens the library underneath.
   */
  const playRegionNow = async (label: string): Promise<void> => {
    const region = REGIONS.find((candidate) => candidate.label === label);
    if (!region) return;
    setTerm(label);
    setBatch(0);
    try {
      const params = new URLSearchParams({
        q: region.queries[0],
        page: "1",
        limit: String(PAGE_SIZE),
      });
      const response = await fetch(`/api/music/search?${params.toString()}`);
      const payload = (await response.json().catch(() => null)) as PagePayload | null;
      const fresh = (payload?.songs ?? []).slice();
      if (fresh.length) {
        // The carousel's own first page is not the ranked list below, so it
        // does not join the chain.
        chain.current = null;
        startQueue(fresh, label, 0);
        document
          .getElementById("region-library")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch {
      // The catalogue fetch failing quietly keeps the app usable — the region
      // can still be opened manually.
    }
  };

  // Debounced search — clearing the box returns to the region you were
  // browsing instead of snapping back to the first region.
  useEffect(() => {
    const value = input.trim();
    const timer = setTimeout(() => {
      if (value.length >= 2) {
        setTerm(value);
        setBatch(0);
      } else if (!value) {
        setTerm((current) =>
          REGIONS.some((candidate) => candidate.label === current)
            ? current
            : REGIONS[0].label
        );
        setBatch(0);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [input]);

  // Region card covers: one quiet search per region, first artwork wins.
  useEffect(() => {
    let cancelled = false;
    for (const candidate of REGIONS) {
      const params = new URLSearchParams({
        q: candidate.queries[0],
        page: "1",
        limit: "1",
      });
      fetch(`/api/music/search?${params.toString()}`)
        .then((response) => response.json())
        .then((payload: { songs?: Song[] } | null) => {
          if (cancelled) return;
          const image = payload?.songs?.[0]?.imageLarge ?? payload?.songs?.[0]?.image;
          if (image) {
            setCovers((prev) =>
              prev[candidate.label] ? prev : { ...prev, [candidate.label]: image }
            );
          }
        })
        .catch(() => {
          // A missing cover just means the card falls back to its tone block.
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    const controller = new AbortController();

    // Combos, cheapest meaningful set per selection:
    // · vibes: several angles per vibe — one rooted in the first language
    //   (e.g. "malayalam bus travel songs"), one open ("bus travel songs"),
    //   plus all other selected languages rooted — the pool gets ample
    //   candidates even for languages whose titles rarely carry vibe words;
    // · no vibes: the region's own queries as before.
    const combos: Array<{ query: string; page: number }> = [];
    if (freeText) {
      // A typed phrase is the query. Checked vibes narrow it; checked
      // languages only re-rank the results below.
      if (activeVibes.length) {
        for (const vibe of activeVibes) {
          combos.push({ query: `${freeText} ${vibe.queries[0]}`, page: batch + 1 });
        }
      } else {
        combos.push({ query: freeText, page: batch + 1 });
      }
    } else {
      for (const activeRegion of activeRegions) {
        if (!activeVibes.length) {
          for (const query of activeRegion.queries) {
            combos.push({ query, page: batch + 1 });
          }
        }
      }
      if (activeVibes.length) {
        for (const vibe of activeVibes) {
          // Rooted in the first selected language first, then an open angle,
          // then the remaining languages rooted — all one page deep each.
          const angles: string[] = [
            `${activeRegions[0].label.toLowerCase()} ${vibe.queries[0]}`,
            vibe.queries[1] ?? vibe.queries[0],
            ...activeRegions
              .slice(1)
              .map((candidate) => `${candidate.label.toLowerCase()} ${vibe.queries[0]}`),
          ];
          for (const query of angles.slice(0, 6)) {
            combos.push({ query, page: batch + 1 });
          }
        }
      }
    }

    const fetchPage = (query: string, page: number): Promise<PageResult> => {
      const params = new URLSearchParams({
        q: query,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      return fetch(`/api/music/search?${params.toString()}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as
            | (PagePayload & { error?: string })
            | null;
          if (!response.ok) return { error: payload?.error ?? "Search failed." };
          return payload ?? { error: "Empty response." };
        })
        .catch((cause: unknown) => {
          if (cause instanceof Error && cause.name === "AbortError") throw cause;
          // One flaky page must not sink the whole batch.
          return { error: cause instanceof Error ? cause.message : "Search failed." };
        });
    };

    // Pages load in parallel; failed ones simply contribute no tracks.
    Promise.all(combos.map(({ query, page }) => fetchPage(query, page)))
      .then((responses) => {
        if (requestRef.current !== requestId) return;

        /** One deduped list per combo, in combo order for interleaving. */
        const usableByPosition: Song[][] = combos.map(() => []);
        const seen = new Set<string>();
        let failure: string | null = null;

        responses.forEach((response, position) => {
          if (!response) return;
          if ("error" in response) {
            failure ??= response.error;
            return;
          }
          const list = usableByPosition[position];
          for (const song of response.songs ?? []) {
            const key = songFingerprint(song);
            if (!seen.has(key)) {
              seen.add(key);
              list.push(song);
            }
          }
        });

        if (!usableByPosition.some((list) => list.length > 0) && failure) {
          throw new Error(failure);
        }

        // Pool, dedupe, then rank: relevance to the typed phrase first, then
        // checked vibes, then the language mix. An artist cap spreads the page
        // across voices so one singer cannot own the whole list.
        const regionLabels = freeText
          ? REGIONS.filter((candidate) => selectedLangs.includes(candidate.label)).map(
              (candidate) => candidate.label
            )
          : activeRegions.map((candidate) => candidate.label);
        const selected = rankSongs(dedupeSongs(usableByPosition.flat()), {
          query: freeText,
          vibes: activeVibes,
          regionLabels,
        }).slice(0, pageSize);

        const total = responses.reduce(
          (sum, response) =>
            response && "total" in response && typeof response.total === "number"
              ? Math.max(sum, response.total)
              : sum,
          0
        );

        setLibrary((prev) =>
          prev.termKey === termKey
            ? // A page turn replaces the visible ten with the fresh ten;
              // the old page stays visible until this batch lands.
              { ...prev, songs: selected, total: total || prev.total }
            : { termKey, songs: selected, total, drained: selected.length === 0 }
        );
        setError(null);
        setLoadedKey(requestKey);
      })
      .catch((cause: unknown) => {
        if (requestRef.current !== requestId) return;
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Search failed.");
        setLoadedKey(requestKey);
      });

    return () => controller.abort();
    // `library` is intentionally not a dependency: merges read-and-write via
    // the setState updater, and watching it would refetch on every merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termKey, batch]);

  const songs = library.termKey === termKey ? library.songs : [];
  /** True while the first results for a new query are still on the wire. */
  const listLoading = fetching && songs.length === 0;
  const pageCount = Math.max(1, Math.ceil(library.total / pageSize));

  /* ── Page chaining ───────────────────────────────────────────────────────
   * The last track of a page turns the page, and the fresh ten join the queue
   * instead of the queue running out and restarting from the top. Only a queue
   * started from this list participates — liked songs, playlists, related
   * tracks and shuffle keep their existing behaviour. */
  useEffect(() => {
    const active = chain.current;
    if (
      !active ||
      !playing ||
      shuffle ||
      repeat === "one" ||
      queue.length === 0 ||
      index < queue.length - 1 ||
      active.key !== termKey ||
      active.page !== batch ||
      queue[0]?.id !== active.firstId ||
      fetching ||
      error ||
      !songs.length ||
      batch + 1 >= pageCount ||
      batch >= MAX_CHAIN_PAGES
    ) {
      return;
    }
    // The turn is spent on the track that ends this run, so an all-duplicate
    // page cannot keep asking the catalogue for another one.
    const turnToken = queue[queue.length - 1]?.id ?? "";
    if (active.turnToken === turnToken) return;
    const frame = requestAnimationFrame(() => {
      active.turnToken = turnToken;
      // A page turn is the same `batch` move the numbered buttons make, just
      // one track early so the next ten are in hand before the queue runs dry.
      // It deliberately skips `openPage`, whose scroll would hijack the view.
      setBatch((value) => value + 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, shuffle, repeat, queue, index, termKey, batch, fetching, error, songs.length, pageCount]);

  useEffect(() => {
    const active = chain.current;
    if (!active || active.key !== termKey || active.page + 1 !== batch) return;
    // The queue must still be the run this chain opened — a related-track or
    // playlist queue that started meanwhile owns its own length.
    if (queue.length === 0 || queue[0]?.id !== active.firstId) {
      chain.current = null;
      return;
    }
    if (fetching) return;
    const landed = library.termKey === termKey ? library.songs : [];
    if (!landed.length || error) {
      // Nothing to chain into: put the page that is still playing back on
      // screen and let the queue behave the way it always has.
      const frame = requestAnimationFrame(() => {
        chain.current = null;
        setBatch(active.page);
      });
      return () => cancelAnimationFrame(frame);
    }
    const held = new Set(queue.map((song) => song.id));
    const frame = requestAnimationFrame(() => {
      appendQueue(landed);
      active.page = batch;
      // A page of songs the queue already holds adds nothing; two of those in
      // a row means the catalogue has stopped giving new tracks.
      active.empties = landed.some((song) => !held.has(song.id)) ? 0 : active.empties + 1;
      if (active.empties >= 2) chain.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [batch, fetching, error, termKey, queue, library, appendQueue]);

  /** Card heading: a typed phrase leads, then vibes, then the region mix. */
  const libraryTitle = freeText
    ? `${freeText}${activeVibes.length ? ` · ${activeVibes.map((vibe) => vibe.label).join(" + ")}` : ""}`
    : activeVibes.length
      ? activeRegions.length > 1 || activeVibes.length > 1
        ? `Filtered mix · ${activeVibes.map((vibe) => vibe.label).join(" + ")}`
        : `${activeRegions[0].label} · ${activeVibes[0].label}`
      : activeRegions.length > 1
        ? "Multi-language mix"
        : isRegion
          ? activeRegions[0].hint
          : "Search results";

  /** Queue the visible page and hand that run to the page chain, so playback
   *  walks into page 2, 3 … instead of looping these ten. */
  const playFromPage = (songIndex: number) => {
    chain.current = {
      key: termKey,
      page: batch,
      // The queue's opening track, whatever position was pressed — it is the
      // fingerprint that says "this queue is still the run we started".
      firstId: songs[0]?.id ?? "",
      turnToken: "",
      empties: 0,
    };
    startQueue(songs, term, songIndex);
  };

  /** Shuffle-play the visible list: mix the queue, then start at the top. */
  const shufflePlay = () => {
    if (!songs.length) return;
    // A shuffled run never reaches "the last track" in order, so it stays out
    // of the chain and keeps looping the list it was given.
    chain.current = null;
    const mixed = [...songs];
    for (let i = mixed.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
    }
    if (!shuffle) toggleShuffle();
    startQueue(mixed, term, 0);
  };

  /** Live bars with a CSS mimic fallback where CORS blocks the analyser. */
  const renderWave = (className: string, tone: string) => (
    <span className={cn("grid place-items-center p-1", className)}>
      {visualizerReady ? (
        <Waveform
          getAnalyser={getAnalyser}
          active={playing}
          className={cn("h-full w-full", tone)}
        />
      ) : (
        <span className={cn("eq", tone)}>
          <span />
          <span />
          <span />
        </span>
      )}
    </span>
  );

  return (
    <div
      id="top"
      className={cn(
        "mx-auto w-full max-w-screen-2xl px-4 pb-24 pt-5 sm:px-6 sm:pt-7 lg:px-10",
        "dock-offset",
        !sidebarWide && "dock-offset--rail",
        nowPlayingOpen && "xl:pe-[24rem]"
      )}
    >
      {/* Spotify-style side preview — fixed, wide screens only. */}
      <NowPlayingPanel />

      {/* Oversized wordmark — a barely-there watermark behind the header,
          absolutely placed so it owns no layout space. */}
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-5 end-0 select-none text-[clamp(5rem,15vw,13rem)] font-black leading-none tracking-tighter text-foreground/[0.045]"
        >
          ZYRAVA
        </span>
        <PageHeader
          title="ZYRAVA"
          leading={
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open the dock"
              className="grid size-10 flex-none place-items-center rounded-xl border border-separator bg-surface text-foreground shadow-field transition-colors hover:text-brand md:hidden"
            >
              <Icon name="menu" className="size-5" />
            </button>
          }
          actions={
            <SearchWithSuggestions
              value={input}
              onChange={setInput}
              onPick={(song) => startQueue([song], song.title, 0)}
              className="w-full sm:w-96"
            />
          }
        />
      </div>

      {/* Primary home tabs — everything below switches with them. */}
      <nav
        aria-label="Home sections"
        className="mt-6 flex flex-nowrap items-end gap-1 overflow-x-auto border-b border-separator [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {HOME_TABS.map((entry) => {
          const active = homeTab === entry.value;
          return (
            <button
              key={entry.value}
              type="button"
              onClick={() => openTab(entry.value)}
              aria-current={active || undefined}
              className={cn(
                "relative -mb-px h-10 shrink-0 whitespace-nowrap border-b-2 px-3.5 text-[13px] font-semibold transition-colors",
                active
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              )}
            >
              {entry.label}
            </button>
          );
        })}
        <span className="ms-auto hidden shrink-0 pb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-faint-foreground sm:block">
          {TAB_EYEBROW[homeTab]}
        </span>
      </nav>

      {homeTab === "songs" ? (
        <>
      {/* Multi-check filter bar — the top section's quick pickers. Languages
          narrow the catalogue; vibes retune the queries, then the list is
          ranked so vibe-fitting songs lead. */}
      <div className="mt-4 rounded-xl border border-separator bg-surface shadow-field">
        <div className="flex items-center justify-between gap-3 px-3.5 pt-3 pb-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Filters
          </p>
          {selectedLangs.length + selectedVibes.length > 1 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-muted transition-colors hover:text-foreground"
            >
              <Icon name="x" className="size-3" />
              Clear all
            </button>
          ) : null}
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-3 border-t border-separator px-3.5 py-2.5">
            <span className="w-20 flex-none whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Language
            </span>
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_94%,transparent)] [&::-webkit-scrollbar]:hidden">
              {REGIONS.map((candidate) => {
                const checked =
                  selectedLangs.length > 0
                    ? selectedLangs.includes(candidate.label)
                    : candidate.label === baseRegion.label;
                return (
                  <button
                    key={candidate.label}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggleLang(candidate.label)}
                    className={cn(
                      "inline-flex h-9 flex-none items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all duration-150",
                      checked
                        ? "border-transparent bg-accent text-accent-foreground shadow-field"
                        : "border-separator bg-transparent text-muted hover:border-border-strong hover:text-foreground"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-3.5 place-items-center rounded-full transition-colors",
                        checked ? "bg-accent-foreground/15" : "bg-transparent"
                      )}
                    >
                      {checked ? <Icon name="check" className="size-2.5" /> : null}
                    </span>
                    {candidate.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-separator px-3.5 py-2.5">
            <span className="w-20 flex-none whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Vibe
            </span>
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_94%,transparent)] [&::-webkit-scrollbar]:hidden">
              {VIBES.map((vibe) => {
                const checked = selectedVibes.includes(vibe.value);
                return (
                  <button
                    key={vibe.value}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    title={`Rebuild the list around ${vibe.label.toLowerCase()} tracks`}
                    onClick={() => toggleVibe(vibe.value)}
                    className={cn(
                      "inline-flex h-9 flex-none items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all duration-150",
                      checked
                        ? "border-transparent bg-accent text-accent-foreground shadow-field"
                        : "border-separator bg-transparent text-muted hover:border-border-strong hover:text-foreground"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-3.5 place-items-center rounded-full transition-colors",
                        checked ? "bg-accent-foreground/15" : "bg-transparent"
                      )}
                    >
                      {checked ? <Icon name="check" className="size-2.5" /> : null}
                    </span>
                    {vibe.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {selectedLangs.length + selectedVibes.length > 0 ? (
          <div className="flex items-center gap-2 border-t border-separator px-3.5 py-2">
            <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted">
              Showing{" "}
              <span className="font-bold text-foreground">
                {[
                  selectedLangs.length
                    ? selectedLangs.join(" + ")
                    : `${baseRegion.label} (current region)`,
                  ...selectedVibes.map(
                    (value) => VIBES.find((vibe) => vibe.value === value)?.label ?? value
                  ),
                ].join(" · ")}
              </span>
            </p>
            <span className="flex-none rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted">
              {selectedLangs.length + selectedVibes.length} active
            </span>
          </div>
        ) : null}
      </div>

      {freeText ? (
        <PlaylistStrip query={freeText} onOpen={() => setHomeTab("playlists")} />
      ) : null}

      {/* Featured rotation — full-width hero panes per region */}
      <div className="mt-5">
        <RegionCarousel
          covers={covers}
          active={isRegion ? term : ""}
          nowPlaying={queueLabel}
          onPlay={playRegionNow}
          onSelect={openRegion}
        />
      </div>

      {/* Spotify library — connect, liked songs, private + collaborative playlists */}
      <div className="mt-5">
        <SpotifyPanel />
      </div>

      {/* Region grid — square cover cards with a hover play affordance. */}
      <div id="region-library" className="mt-8 scroll-mt-24 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {REGIONS.map((candidate) => {
          const active = candidate.label === term;
          return (
            <button
              key={candidate.label}
              type="button"
              aria-pressed={active}
              onClick={() => openRegion(candidate.label)}
              className={cn(
                "group relative aspect-square w-full cursor-pointer overflow-hidden rounded-lg border text-start shadow-field transition-all duration-200 hover:-translate-y-1 hover:shadow-pop",
                active
                  ? "border-transparent ring-2 ring-accent ring-offset-2 ring-offset-background"
                  : "border-separator"
              )}
            >
              {covers[candidate.label] ? (
                <Image
                  src={covers[candidate.label]}
                  alt=""
                  width={352}
                  height={352}
                  sizes="(min-width:1024px) 14vw, (min-width:640px) 30vw, 45vw"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <span
                  className="absolute inset-0 grid place-items-center text-black/60"
                  style={{ backgroundColor: candidate.tone }}
                >
                  <Icon name="globe" className="size-8" />
                </span>
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              {/* Play affordance appears on hover / stays for the active card */}
              <span
                className={cn(
                  "absolute end-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-white text-black shadow-field transition-all duration-200",
                  active
                    ? "opacity-100"
                    : "translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
                )}
              >
                {active && playing ? (
                  <span className="eq text-black">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  <Icon name="play" size={15} className="fill-black text-black" />
                )}
              </span>
              <span className="absolute inset-x-0 bottom-0 p-3">
                <span className="block truncate text-sm font-bold text-white drop-shadow">
                  {candidate.label}
                </span>
                <span className="block truncate text-[11px] text-white/80">{candidate.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
          {isRegion ? `${term} · music` : "Search results"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={shufflePlay}
            disabled={!songs.length}
            aria-pressed={shuffle}
            title="Play this list in a random order"
            className={cn(
              "flex h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40",
              shuffle
                ? "border-transparent bg-accent-soft text-brand"
                : "border-separator text-muted hover:border-border-strong hover:text-foreground"
            )}
          >
            <Icon name="shuffle" className="size-3.5" />
            Shuffle
          </button>
          <SegmentedControl
            options={VIEW_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
              icon: option.icon,
            }))}
            value={view}
            onChange={(value) => setView(value as ViewMode)}
            ariaLabel="Library view"
          />
        </div>
      </div>

      {error ? (
        <div className="mt-4">
          <Notice
            tone="warning"
            title="Music search is unavailable"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null);
                  setAttempt((value) => value + 1);
                }}
              >
                Retry
              </Button>
            }
          >
            {error}
          </Notice>
        </div>
      ) : null}

      <Card id="library-list" className="mt-4 rounded-xl scroll-mt-24">
        <CardHeader
          title={libraryTitle}
          description={
            listLoading
              ? "Loading tracks…"
              : pageCount > 1
                ? `${library.total.toLocaleString("en-IN")} tracks · page ${batch + 1} of ${pageCount}`
                : `${library.total.toLocaleString("en-IN")} tracks`
          }
          actions={
            fetching ? (
              <div className="flex items-center gap-2 text-xs font-medium text-muted">
                <Spinner className="size-4" />
              </div>
            ) : null
          }
        />
        {listLoading ? (
          <CardContent
            className={cn("p-3 sm:p-4", view === "list" ? "flex flex-col gap-1.5" : cn("grid gap-3 sm:gap-4", GRID_COLS[view]))}
          >
            {Array.from({ length: view === "large" ? 6 : 12 }).map((_, tileIndex) =>
              view === "list" ? (
                <Skeleton key={tileIndex} className="h-16 rounded-xl" />
              ) : (
                <div key={tileIndex} className="flex flex-col gap-2.5">
                  <Skeleton className="aspect-square w-full rounded-xl" />
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              )
            )}
          </CardContent>
        ) : songs.length ? (
          <CardContent
            className={cn(
              view === "list" ? "flex flex-col gap-1 p-2 sm:p-3" : cn("grid p-3 sm:p-4", GRID_COLS[view], "gap-3 sm:gap-4")
            )}
          >
            {songs.map((song, songIndex) => {
              const active = song.id === activeId;
              if (view === "list") {
                return (
                  <div key={song.id} className="relative">
                    <button
                      type="button"
                      onClick={() => playFromPage(songIndex)}
                      aria-label={`Play ${song.title} by ${song.artist}`}
                      className={cn(
                        "group flex min-h-[68px] w-full items-center gap-3 rounded-lg pe-28 ps-2 py-2 text-start transition-all duration-150 hover:bg-surface-secondary sm:ps-3",
                        active && "bg-accent-soft"
                      )}
                    >
                    <span className="relative size-12 flex-none overflow-hidden rounded-xl bg-surface-muted sm:size-[52px]">
                      {song.image ? (
                        <Image
                          src={song.image}
                          alt=""
                          width={112}
                          height={112}
                          sizes={IMAGE_SIZES.list}
                          className="inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <span className="grid h-full place-items-center text-faint-foreground">
                          <Icon name="music" size={16} />
                        </span>
                      )}
                      <span
                        className={cn(
                          "absolute inset-0 grid place-items-center bg-black/50 transition-opacity duration-200",
                          active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}
                      >
                        {active && playing ? (
                          renderWave("h-full w-full", "text-white")
                        ) : (
                          <Icon name="play" size={16} className="fill-white text-white" />
                        )}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-semibold sm:text-[15px]",
                          active ? "text-brand" : "text-foreground"
                        )}
                      >
                        {song.title}
                      </span>
                      <span className="block truncate text-xs text-muted sm:text-[13px]">
                        {song.artist}
                        {song.album ? ` · ${song.album}` : ""}
                      </span>
                    </span>
                    {active ? (
                      <span className="hidden h-6 w-24 shrink-0 sm:block">
                        {renderWave("h-full w-full", "text-brand")}
                      </span>
                    ) : null}
                    <span className="flex-none text-xs font-medium tabular-nums text-muted-foreground sm:text-[13px]">
                      {formatSeconds(song.duration)}
                    </span>
                    </button>

                    <div className="absolute end-1.5 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleLike(song)}
                        aria-pressed={isLiked(song)}
                        aria-label={
                          isLiked(song)
                            ? `Remove ${song.title} from Liked songs`
                            : `Like ${song.title}`
                        }
                        title={isLiked(song) ? "Liked" : "Like this song"}
                        className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
                      >
                        <Icon
                          name="heart"
                          className={cn("size-4", isLiked(song) && "fill-danger text-danger")}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => openPicker(song)}
                        aria-label={`Add ${song.title} to a playlist`}
                        title="Add to playlist"
                        className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
                      >
                        <Icon name="plus" className="size-4" />
                      </button>
                      <SaveToDevice song={song} />
                    </div>
                  </div>
                );
              }

              const cover = view === "large" ? 500 : 300;
              const src = song.imageLarge || song.image;
              return (
                <div key={song.id} className="group relative flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => toggleLike(song)}
                    aria-pressed={isLiked(song)}
                    aria-label={
                      isLiked(song) ? `Remove ${song.title} from Liked songs` : `Like ${song.title}`
                    }
                    title={isLiked(song) ? "Liked" : "Like this song"}
                    className="absolute start-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-black/50 text-white/85 backdrop-blur transition-colors hover:bg-black/70 hover:text-white"
                  >
                    <Icon
                      name="heart"
                      className={cn("size-4", isLiked(song) && "fill-danger text-danger")}
                    />
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => playFromPage(songIndex)}
                    aria-label={`Play ${song.title} by ${song.artist}`}
                    className="relative aspect-square h-auto w-full overflow-hidden rounded-lg p-0 shadow-field transition-transform duration-300 hover:scale-[1.02]"
                  >
                    {src ? (
                      <Image
                        src={src}
                        alt=""
                        width={cover}
                        height={cover}
                        sizes={IMAGE_SIZES[view]}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <Icon name="music" className="size-7 text-faint-foreground" />
                    )}
                    <span
                      className={cn(
                        "absolute inset-0 grid place-items-center bg-black/45 transition-opacity duration-200",
                        active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}
                    >
                      {active && playing ? (
                        renderWave("h-2/3 w-2/3", "text-white")
                      ) : (
                        <Icon name="play" size={view === "large" ? 22 : 18} className="fill-white text-white" />
                      )}
                    </span>
                    {view === "large" ? (
                      <span className="pointer-events-none absolute end-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                        {formatSeconds(song.duration)}
                      </span>
                    ) : null}
                  </Button>
                  <div className="min-w-0 pb-1">
                    <p
                      className={cn(
                        "truncate text-sm font-semibold",
                        active ? "text-brand" : "text-foreground",
                        view === "small" && "text-xs sm:text-sm"
                      )}
                    >
                      {song.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted" title={song.artist}>
                      {song.artist}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        ) : (
          <CardContent className="p-4">
            <EmptyState
              icon={
                <Icon name={activeVibes.length ? "sliders" : "search"} className="size-5" />
              }
              title={
                activeVibes.length
                  ? "No songs matched the selected filters"
                  : "Nothing matched that search"
              }
              description={
                activeVibes.length
                  ? "Even the mixed vibe-and-language pool came back empty — untick a vibe or language and retry."
                  : "Try a shorter phrase, an artist name, or one of the regions above."
              }
            />
          </CardContent>
        )}
      </Card>

      {/* Numbered pages: 1 · 2 · 3 … next — each next lists ten more. */}
      {pageCount > 1 && songs.length ? (
        <Pagination
          page={batch + 1}
          pageCount={pageCount}
          total={library.total}
          pageSize={pageSize}
          onChange={(value) => openPage(value - 1)}
          className="mt-2"
        />
      ) : null}

      {/* Label line — the quiet footer, Zomato style. Large but faint, so it
          reads like the wordmark watermark at the top of the page. */}
      <footer className="mt-16 overflow-hidden px-2 pb-4 text-center sm:mt-20">
        <p className="text-balance text-[clamp(1.5rem,6.5vw,5rem)] font-black leading-[1.05] tracking-tighter text-foreground/[0.07]">
          Crafted with{" "}
          <Icon
            name="heart"
            className="inline-block size-[0.52em] fill-danger align-baseline text-danger"
          />{" "}
          <span className="whitespace-nowrap">in Kochi, India</span>
        </p>
      </footer>
        </>
      ) : homeTab === "playlists" ? (
        <PlaylistsView query={playlistQuery} />
      ) : homeTab === "liked" ? (
        <LikedView />
      ) : homeTab === "downloads" ? (
        <DownloadsView />
      ) : homeTab === "offline" ? (
        <OfflineView onImport={() => setImportOpen(true)} />
      ) : null}

      <ImportSongsModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
