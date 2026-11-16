"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCustomization } from "@/components/providers/CustomizationProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { formatPaymentAmount } from "@/lib/razorpay";
import { apiFetch } from "@/lib/api";
import {
  CUSTOM_ANIMATIONS,
  CUSTOM_ANIMATION_SETS,
  BIRTHDAY_CUSTOMIZATION,
  CUSTOM_PALETTES,
  DEFAULT_CUSTOMIZATION,
  durationLabel,
  contrast,
  customizationVariables,
  isCustomizationConfig,
  type AnimationId,
  type CustomizationConfig,
  type CustomizationTemplate,
  type CustomizationDesign,
  type CustomizationPerson,
} from "@/lib/customization";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { useCustomizationCheckout } from "./useCustomizationCheckout";
import { CustomizationAnimation } from "./CustomizationAnimation";

const SLOTS = [
  { key: "loadingAnimation", label: "Loading" },
  { key: "headerAnimation", label: "Header" },
  { key: "lyricsAnimation", label: "Lyrics background" },
] as const;
type Slot = (typeof SLOTS)[number]["key"];
type Panel = "design" | "received" | "sent";
const COLORS = [
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "surface", label: "Cards & panels" },
  { key: "text", label: "Text" },
] as const;
const HEX = /^#[0-9a-f]{6}$/i;

function Preview({
  config,
  slot,
  creator,
  recipient,
}: {
  config: CustomizationConfig;
  slot: Slot;
  creator: CustomizationPerson;
  recipient: CustomizationPerson;
}) {
  const safe = { ...config, title: config.title || "Made for you" };
  for (const { key } of COLORS)
    if (!HEX.test(safe[key])) safe[key] = DEFAULT_CUSTOMIZATION[key];
  return (
    <div
      className="customize-preview"
      style={
        {
          ...customizationVariables(safe),
          background: safe.background,
          color: safe.text,
        } as CSSProperties
      }
    >
      <div className="customize-preview-label">
        LIVE PREVIEW{" "}
        <span>{recipient.name || recipient.email || "Your account"}</span>
      </div>
      {slot === "loadingAnimation" ? (
        <div className="customize-preview-loading">
          <CustomizationAnimation
            id={safe.loadingAnimation}
            className="size-36"
          />
          <strong>{safe.title}</strong>
          <p>{safe.loadingMessage || "Your music is getting ready."}</p>
        </div>
      ) : slot === "headerAnimation" ? (
        <div className="customize-preview-home">
          <div className="customize-preview-header">
            <CustomizationAnimation
              id={safe.headerAnimation}
              className="size-24 shrink-0"
            />
            <div>
              <strong>{safe.title}</strong>
              <p>{safe.wishMessage || "Your listening room"}</p>
            </div>
          </div>
          <div className="customize-preview-search">
            Search your favourite music
          </div>
          <div className="customize-preview-tabs">
            <span>Songs</span>
            <span>Playlists</span>
            <span>Liked</span>
          </div>
          {[
            "Your favourite song",
            "One more little moment",
            "Made for your evening",
          ].map((name, i) => (
            <div key={name} className="customize-preview-song">
              <span>{String(i + 1).padStart(2, "0")}</span>
              {name}
              <Icon name="heart" className="size-4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="customize-preview-lyrics">
          <CustomizationAnimation
            id={safe.lyricsAnimation}
            className="absolute inset-0 opacity-20"
          />
          <div className="relative">
            <p>Your words,</p>
            <strong>your music.</strong>
            <p>A little world of your own.</p>
          </div>
          <div className="customize-preview-cover">
            <Icon name="music" className="size-10" />
          </div>
          <div className="relative col-span-2 flex items-center justify-center gap-6">
            <Icon name="skip-back" />
            <Icon name="play" />
            <Icon name="skip-forward" />
          </div>
        </div>
      )}
      <p className="customize-preview-credit">
        Created by <strong>{creator.name || "ZYRAVA listener"}</strong>
        {creator.email || creator.phone ? (
          <span>{creator.email || creator.phone}</span>
        ) : null}
      </p>
    </div>
  );
}

export function CustomizeConsole() {
  const { user, personalExperience } = useAuth();
  if (personalExperience) return null;
  if (!user)
    return (
      <section className="customize-console">
        <header className="customize-console-header">
          <div>
            <h1>Customize</h1>
            <p>Sign in to save a design or see looks made for you.</p>
            <Link href="/login?next=/customize">Sign in</Link>
          </div>
        </header>
      </section>
    );
  return (
    <ConsoleBody
      key={user.id}
      me={{ id: user.id, name: user.name, email: user.email }}
    />
  );
}
function ConsoleBody({ me }: { me: CustomizationPerson }) {
  const {
    active,
    state,
    busy: providerBusy,
    error,
    refresh,
    respond,
    reset,
    remove,
  } = useCustomization();
  const payment = useCustomizationCheckout();
  const busy = providerBusy || payment.busy;
  const priceLabel = payment.pricing
    ? formatPaymentAmount(payment.pricing.amount, payment.pricing.currency)
    : "…";
  const notifications = useToast();
  const searchRevision = useRef(0);
  const invalidateSearch = useCallback(() => {
    searchRevision.current++;
  }, []);
  const [panel, setPanel] = useState<Panel>("design");
  const [recipient, setRecipient] = useState<CustomizationPerson | null>(me);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomizationPerson[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CustomizationConfig>(
    active?.config ?? DEFAULT_CUSTOMIZATION,
  );
  const templateDrafts = useRef<
    Partial<Record<CustomizationTemplate, CustomizationConfig>>
  >({});
  const template = draft.template ?? "partner";
  const [durationUnit, setDurationUnit] = useState(() => {
    const minutes = active?.config.durationMinutes;
    return minutes == null || minutes % 1440 === 0
      ? 1440
      : minutes % 60 === 0
        ? 60
        : 1;
  });
  const received = state.received ?? state.incoming;
  const [slot, setSlot] = useState<Slot>("headerAnimation");
  const [previewDesign, setPreviewDesign] =
    useState<CustomizationDesign | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const valid = isCustomizationConfig(draft);
  const lowContrast =
    valid &&
    (contrast(draft.text, draft.background) < 4.5 ||
      contrast(draft.text, draft.surface) < 4.5);

  useEffect(() => () => invalidateSearch(), [invalidateSearch]);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) void refresh().catch(() => undefined);
    });
    return () => {
      alive = false;
    };
  }, [refresh]);
  const change = <K extends keyof CustomizationConfig>(
    key: K,
    value: CustomizationConfig[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setNotice(null);
    setPreviewDesign(null);
  };
  const selectTemplate = (next: CustomizationTemplate) => {
    if (busy || next === template) return;
    templateDrafts.current[template] = draft;
    const nextDraft =
      templateDrafts.current[next] ??
      (next === "birthday" ? BIRTHDAY_CUSTOMIZATION : DEFAULT_CUSTOMIZATION);
    setDraft(nextDraft);
    const minutes = nextDraft.durationMinutes;
    setDurationUnit(
      minutes == null || minutes % 1440 === 0
        ? 1440
        : minutes % 60 === 0
          ? 60
          : 1,
    );
    setSlot("headerAnimation");
    setPreviewDesign(null);
    setNotice(null);
  };
  const search = async () => {
    if (query.trim().length < 3) return;
    const version = ++searchRevision.current;
    setSearching(true);
    setSearchError(null);
    setSearched(false);
    setResults([]);
    try {
      const response = await apiFetch<{ users: CustomizationPerson[] }>(
        `/api/customization/users?q=${encodeURIComponent(query.trim())}`,
      );
      if (version === searchRevision.current) {
        setResults(response.users);
        setSearched(true);
      }
    } catch (e) {
      if (version === searchRevision.current)
        setSearchError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      if (version === searchRevision.current) setSearching(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!recipient || !valid || busy) return;
    try {
      if (!(await payment.pay(recipient.id, draft))) return;
      const message =
        recipient.id === me.id
          ? "Saved to your account. Your new look is live."
          : "Design saved and sent. They can preview and apply it in Customize.";
      setNotice(message);
      notifications.success(
        recipient.id === me.id ? "Your look is ready" : "Customization sent",
        recipient.name || recipient.email || undefined,
      );
    } catch {
      /* Provider displays the server error. */
    }
  };
  const respondTo = async (design: CustomizationDesign, accept: boolean) => {
    try {
      await respond(design.id, accept, design.updatedAt);
      setPreviewDesign(null);
      notifications.success(
        accept ? "Your new look is live" : "Customization dismissed",
        design.config.title,
      );
    } catch {
      /* Provider error stays visible. */
    }
  };
  const removeDesign = async (design: CustomizationDesign) => {
    try {
      await remove(design.id);
      setPreviewDesign(null);
      notifications.success("Customization removed", design.config.title);
    } catch {
      /* Provider error stays visible. */
    }
  };
  const currentPreview = previewDesign?.config ?? draft;
  const previewRecipient = previewDesign?.recipient ?? recipient ?? me;
  const previewCreator = previewDesign?.creator ?? me;

  return (
    <section className="customize-console" aria-labelledby="customize-title">
      <header className="customize-console-header">
        <div>
          <p className="customize-eyebrow">A LITTLE MORE YOU</p>
          <h1 id="customize-title">Customize</h1>
          <p>Your colours. Your moments. Made for someone.</p>
        </div>
        <Link href="/" className="customize-back" aria-label="Back to music">
          <Icon name="music" />
          <span>Back to music</span>
        </Link>
      </header>
      <nav className="customize-navigation" aria-label="Customization sections">
        {(
          [
            { id: "design", label: "Create a design" },
            {
              id: "received",
              label: `Received${state.incoming.length ? ` · ${state.incoming.length}` : ""}`,
            },
            { id: "sent", label: "Your designs" },
          ] as const
        ).map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={panel === item.id}
            onClick={() => {
              setPanel(item.id);
              setPreviewDesign(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {panel === "design" ? (
        <div className="customize-template-picker">
          <div
            role="tablist"
            aria-label="Customization occasion"
            className="customize-template-tabs"
          >
            {(
              [
                {
                  id: "partner",
                  label: "For partner",
                  detail: "A little world for someone you love",
                },
                {
                  id: "birthday",
                  label: "Birthday",
                  detail: "A wish, a surprise, their favourite songs",
                },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`occasion-${item.id}`}
                aria-selected={template === item.id}
                aria-controls="customize-occasion-panel"
                tabIndex={template === item.id ? 0 : -1}
                disabled={busy}
                onClick={() => selectTemplate(item.id)}
                onKeyDown={(event) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  ) {
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? "partner"
                        : event.key === "End"
                          ? "birthday"
                          : template === "partner"
                            ? "birthday"
                            : "partner";
                    selectTemplate(next);
                    document.getElementById(`occasion-${next}`)?.focus();
                  }
                }}
              >
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </button>
            ))}
          </div>
          <p className="customize-help">
            {template === "birthday"
              ? "A birthday wish with a warm gold and plum theme. Starts when they apply it; one day by default, or choose your own duration."
              : "Create a personal gift with your own colours, message, and motion."}
          </p>
        </div>
      ) : null}
      <div className="customize-price-note">
        <strong>{priceLabel} per save or send</strong>
        <Link href="/payments" className="payment-history-recover">
          View payment history
        </Link>
        <span>
          One-time payment through Razorpay. Editing and saving again costs{" "}
          {priceLabel}. Recipients can apply paid gifts for free.
        </span>
      </div>
      {payment.error ? (
        <p className="customize-notice" role="alert">
          {payment.error}
        </p>
      ) : null}
      {payment.pending.length > 0 ? (
        <section
          className="customize-payments"
          aria-label="Pending customization payments"
        >
          <h2>Pending checkouts</h2>
          <p className="customize-help">
            Already paid? Check payment first. Resume uses the same order and
            the design saved when you started checkout.
          </p>
          {payment.pending.map((purchase) => (
            <div className="customize-payment-row" key={purchase.id}>
              <div>
                <strong>{purchase.title}</strong>
                <p className="customize-help">
                  {formatPaymentAmount(purchase.amount, purchase.currency)} ·{" "}
                  {new Date(purchase.createdAt).toLocaleDateString()} ·{" "}
                  {purchase.orderId}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void payment.check(purchase).then((done) => {
                    if (done)
                      notifications.success(
                        "Payment confirmed",
                        "Your customization is saved.",
                      );
                  })
                }
              >
                Check payment
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void payment.resume(purchase).then((done) => {
                    if (done)
                      notifications.success(
                        "Payment confirmed",
                        "Your customization is saved.",
                      );
                  })
                }
              >
                Resume checkout
              </Button>
            </div>
          ))}
        </section>
      ) : null}
      {error ? (
        <div className="customize-notice" role="alert">
          {error}{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh().catch(() => undefined)}
          >
            Try again
          </button>
        </div>
      ) : null}
      {active ? (
        <div className="customize-current">
          <div>
            <strong>{active.config.title}</strong>
            <p>
              Created by {active.creator.name || "ZYRAVA listener"}
              {active.creator.email || active.creator.phone
                ? ` · ${active.creator.email || active.creator.phone}`
                : ""}
            </p>
            <p>
              {active.expiresAt
                ? `Ends ${new Date(active.expiresAt).toLocaleString()}`
                : "Until removed"}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void reset()
                .then(() => notifications.success("Original theme restored"))
                .catch(() => undefined)
            }
          >
            {panel === "received" ? "Remove customization" : "Restore default"}
          </Button>
        </div>
      ) : null}
      <div className="customize-workspace">
        <div className="customize-editor">
          {panel === "design" ? (
            <form id="customize-form" onSubmit={submit}>
              <div
                id="customize-occasion-panel"
                role="tabpanel"
                aria-labelledby={`occasion-${template}`}
              >
                <fieldset
                  className="customize-payment-fields"
                  disabled={payment.busy}
                >
                  <fieldset className="customize-section">
                    <legend>01 · Who is it for?</legend>
                    <p className="customize-help">
                      Choose your own account or find someone by name, email or
                      phone number.
                    </p>
                    <div className="customize-search">
                      <input
                        aria-label="Search users by name, email or phone"
                        value={query}
                        maxLength={254}
                        placeholder="Name, email or phone number"
                        onChange={(e) => {
                          searchRevision.current++;
                          setQuery(e.target.value);
                          setSearching(false);
                          setSearched(false);
                          setResults([]);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void search();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        loading={searching}
                        disabled={query.trim().length < 3}
                        onClick={() => void search()}
                      >
                        Search
                      </Button>
                    </div>
                    <p className="customize-help">
                      Full usernames are shown. Contact details are masked by
                      the server; only the last three phone digits are visible.
                    </p>
                    {searchError ? (
                      <p role="alert" className="customize-help">
                        {searchError}
                      </p>
                    ) : null}
                    {searched && !results.length ? (
                      <p role="status" className="customize-help">
                        No matching users. Try their name, email or phone
                        number.
                      </p>
                    ) : null}
                    {!!results.length ? (
                      <ul
                        className="customize-results"
                        aria-label="Matching users"
                      >
                        {results.map((person) => (
                          <li key={person.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setRecipient(person);
                                setResults([]);
                                setSearched(false);
                                setNotice(null);
                              }}
                            >
                              <strong>
                                {person.name || "ZYRAVA listener"}
                              </strong>
                              <span>
                                {[person.email, person.phone]
                                  .filter(Boolean)
                                  .join(" · ") || "No contact details"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="customize-recipient">
                      <Icon name="heart" className="size-5" />
                      <div>
                        <strong>
                          {recipient?.id === me.id
                            ? "For me"
                            : recipient?.name || "Select a recipient"}
                        </strong>
                        <span>
                          {[recipient?.email, recipient?.phone]
                            .filter(Boolean)
                            .join(" · ") || recipient?.name}
                        </span>
                      </div>
                      {recipient?.id !== me.id ? (
                        <button
                          type="button"
                          onClick={() => {
                            setRecipient(me);
                            setNotice(null);
                          }}
                        >
                          Use my account
                        </button>
                      ) : (
                        <span className="customize-chip">YOU</span>
                      )}
                    </div>
                  </fieldset>
                  <fieldset className="customize-section">
                    <legend>02 · Set the mood</legend>
                    <label className="customize-label">
                      Design name
                      <input
                        value={draft.title}
                        maxLength={60}
                        required
                        onChange={(e) => change("title", e.target.value)}
                        placeholder="A little world for you"
                      />
                    </label>
                    <p className="customize-help">
                      144 colour palettes, plus your own hex colours.
                    </p>
                    <div
                      className="customize-palette-grid"
                      role="group"
                      aria-label="144 colour palettes"
                    >
                      {CUSTOM_PALETTES.map((palette) => (
                        <button
                          type="button"
                          key={palette.name}
                          style={{ background: palette.accent }}
                          title={`${palette.name} · ${palette.accent}`}
                          aria-label={`${palette.name} ${palette.accent}`}
                          aria-pressed={draft.accent === palette.accent}
                          onClick={() => {
                            setDraft((prev) => ({
                              ...prev,
                              accent: palette.accent,
                              background: palette.background,
                              surface: palette.surface,
                              text: palette.text,
                            }));
                            setPreviewDesign(null);
                            setNotice(null);
                          }}
                        />
                      ))}
                    </div>
                    <div className="customize-colors">
                      {COLORS.map(({ key, label }) => (
                        <label key={key} className="customize-color">
                          <span>{label}</span>
                          <div>
                            <input
                              type="color"
                              aria-label={`${label} colour picker`}
                              value={
                                HEX.test(draft[key])
                                  ? draft[key]
                                  : DEFAULT_CUSTOMIZATION[key]
                              }
                              onChange={(e) => change(key, e.target.value)}
                            />
                            <input
                              aria-label={`${label} hex colour`}
                              value={draft[key]}
                              maxLength={7}
                              pattern="#[0-9a-fA-F]{6}"
                              required
                              onChange={(e) => change(key, e.target.value)}
                              spellCheck={false}
                            />
                          </div>
                        </label>
                      ))}
                    </div>
                    {lowContrast ? (
                      <p className="customize-help" role="status">
                        Text may be hard to read. Choose lighter text or a
                        darker background.
                      </p>
                    ) : null}
                  </fieldset>
                  <fieldset className="customize-section">
                    <legend>03 · Add a little motion</legend>
                    <p className="customize-help">
                      Select a location, then choose an animation. Watch it in
                      the preview.
                    </p>
                    <div
                      className="customize-motion-sets"
                      role="group"
                      aria-label="Animation sets"
                    >
                      {CUSTOM_ANIMATION_SETS.map((set) => (
                        <button
                          type="button"
                          key={set.id}
                          aria-pressed={SLOTS.every(
                            ({ key }) => draft[key] === set[key],
                          )}
                          onClick={() => {
                            setDraft((prev) => ({
                              ...prev,
                              loadingAnimation: set.loadingAnimation,
                              headerAnimation: set.headerAnimation,
                              lyricsAnimation: set.lyricsAnimation,
                            }));
                            setPreviewDesign(null);
                            setNotice(null);
                          }}
                        >
                          {set.label}
                        </button>
                      ))}
                    </div>
                    <p className="customize-help">
                      Sets fill all three locations. You can also mix any of the
                      11 animations below.
                    </p>
                    <div
                      className="customize-slot-tabs"
                      role="group"
                      aria-label="Animation location"
                    >
                      {SLOTS.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          aria-pressed={slot === item.key}
                          onClick={() => {
                            setSlot(item.key);
                            setPreviewDesign(null);
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div
                      className="customize-animation-grid"
                      role="group"
                      aria-label={`${SLOTS.find((item) => item.key === slot)?.label} animation`}
                    >
                      {[
                        { id: "none", label: "No animation" },
                        ...CUSTOM_ANIMATIONS,
                      ].map((asset, i) => (
                        <button
                          type="button"
                          key={asset.id}
                          aria-pressed={draft[slot] === asset.id}
                          onClick={() => change(slot, asset.id as AnimationId)}
                        >
                          {i ? (
                            <CustomizationAnimation
                              id={asset.id as AnimationId}
                              className="size-20"
                            />
                          ) : (
                            <span className="grid size-20 place-items-center">
                              <Icon name="x" className="size-5" />
                            </span>
                          )}
                          <span>{asset.label}</span>
                          {draft[slot] === asset.id ? (
                            <span className="customize-selected">Selected</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="customize-section">
                    <legend>04 · Say something lovely</legend>
                    <label className="customize-label">
                      {template === "birthday"
                        ? "Birthday wish"
                        : "Personal message"}
                      <textarea
                        aria-label={
                          template === "birthday"
                            ? "Birthday wish"
                            : "Personal message"
                        }
                        value={draft.wishMessage ?? ""}
                        maxLength={280}
                        rows={3}
                        onChange={(event) =>
                          change(
                            "wishMessage",
                            event.target.value.replace(/[\r\n]/g, " "),
                          )
                        }
                        placeholder={
                          template === "birthday"
                            ? "Happy birthday! Here’s to a year full of your favourite moments."
                            : "A little love in every listen."
                        }
                      />
                    </label>
                    <p className="customize-help">
                      {(draft.wishMessage ?? "").length}/280 · Shown in their
                      home header after they apply your design.
                    </p>

                    <label className="customize-label">
                      Loading screen message
                      <textarea
                        value={draft.loadingMessage}
                        maxLength={140}
                        rows={3}
                        onChange={(e) =>
                          change(
                            "loadingMessage",
                            e.target.value.replace(/[\r\n]/g, " "),
                          )
                        }
                        placeholder="Your favourite songs are getting ready."
                      />
                    </label>
                    <p className="customize-help">
                      {draft.loadingMessage.length}/140 · Your name and masked
                      contact will appear on their customization.
                    </p>
                  </fieldset>
                  <fieldset className="customize-section">
                    <legend>05 · How long should it stay?</legend>
                    <label className="customize-label">
                      Customization duration
                      <select
                        value={
                          draft.durationMinutes == null ? "forever" : "timed"
                        }
                        onChange={(e) => {
                          setDurationUnit(1440);
                          change(
                            "durationMinutes",
                            e.target.value === "forever" ? null : 10080,
                          );
                        }}
                      >
                        <option value="forever">Until removed</option>
                        <option value="timed">For a set time</option>
                      </select>
                    </label>
                    {draft.durationMinutes != null ? (
                      <div className="customize-duration">
                        <label className="customize-label">
                          Duration
                          <input
                            type="number"
                            min={1}
                            max={Math.floor(525600 / durationUnit)}
                            step={1}
                            value={
                              Number.isFinite(draft.durationMinutes)
                                ? draft.durationMinutes / durationUnit
                                : ""
                            }
                            onChange={(e) =>
                              change(
                                "durationMinutes",
                                e.target.value === ""
                                  ? NaN
                                  : Number(e.target.value) * durationUnit,
                              )
                            }
                          />
                        </label>
                        <label className="customize-label">
                          Time unit
                          <select
                            value={durationUnit}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              change(
                                "durationMinutes",
                                Math.min(
                                  Math.floor(525600 / next),
                                  Math.max(
                                    1,
                                    Math.round(
                                      (draft.durationMinutes ?? durationUnit) /
                                        durationUnit,
                                    ),
                                  ),
                                ) * next,
                              );
                              setDurationUnit(next);
                            }}
                          >
                            <option value={1}>Minutes</option>
                            <option value={60}>Hours</option>
                            <option value={1440}>Days</option>
                          </select>
                        </label>
                      </div>
                    ) : null}
                    <p className="customize-help">
                      Starts when the recipient applies it. Choose up to 365
                      days. Their original theme returns automatically, and they
                      can remove it anytime.
                    </p>
                  </fieldset>
                  {notice ? (
                    <p className="customize-notice" role="status">
                      {notice}
                    </p>
                  ) : null}
                </fieldset>
              </div>
            </form>
          ) : (
            <section
              className="customize-section"
              aria-label={
                panel === "received"
                  ? "Received customizations"
                  : "Your designs"
              }
            >
              <h2>{panel === "received" ? "Made for you" : "Made by you"}</h2>
              {(panel === "received" ? received : state.outgoing).length ===
              0 ? (
                <p className="customize-empty">
                  {busy
                    ? "Loading your designs…"
                    : panel === "received"
                      ? "When someone creates a look for you, it will appear here with their name and masked contact."
                      : "Your saved and sent designs will appear here."}
                </p>
              ) : null}
              {(panel === "received" ? received : state.outgoing).map(
                (design) => (
                  <article key={design.id} className="customize-design-card">
                    <div
                      className="customize-design-colours"
                      aria-hidden="true"
                    >
                      {[
                        design.config.accent,
                        design.config.background,
                        design.config.surface,
                      ].map((color, i) => (
                        <span key={i} style={{ background: color }} />
                      ))}
                    </div>
                    <h3>{design.config.title}</h3>
                    <span className="customize-chip">
                      {design.config.template === "birthday"
                        ? "Birthday"
                        : "For partner"}
                    </span>
                    <p>{durationLabel(design.config.durationMinutes)}</p>
                    <p>
                      {panel === "received" ? "Created by" : "For"}{" "}
                      {(panel === "received"
                        ? design.creator
                        : design.recipient
                      ).name || "ZYRAVA listener"}
                    </p>
                    <p>
                      {(panel === "received"
                        ? design.creator
                        : design.recipient
                      ).email ||
                        (panel === "received"
                          ? design.creator
                          : design.recipient
                        ).phone ||
                        "No contact details"}
                    </p>
                    <div className="customize-design-actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setPreviewDesign(design);
                          setSlot("headerAnimation");
                        }}
                      >
                        Preview
                      </Button>
                      {panel === "received" ? (
                        <>
                          <Button
                            size="sm"
                            disabled={
                              busy ||
                              (active?.id === design.id &&
                                design.status !== "pending")
                            }
                            onClick={() => void respondTo(design, true)}
                          >
                            {active?.id === design.id &&
                            design.status !== "pending"
                              ? "Applied"
                              : "Apply"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void removeDesign(design)}
                          >
                            Remove
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              templateDrafts.current[template] = draft;
                              setDraft(design.config);
                              const minutes = design.config.durationMinutes;
                              setDurationUnit(
                                minutes == null || minutes % 1440 === 0
                                  ? 1440
                                  : minutes % 60 === 0
                                    ? 60
                                    : 1,
                              );
                              setRecipient(design.recipient);
                              setPanel("design");
                              setPreviewDesign(null);
                              setNotice(null);
                            }}
                          >
                            Edit
                          </Button>
                          <span className="customize-chip">
                            {design.status}
                          </span>
                        </>
                      )}
                    </div>
                  </article>
                ),
              )}
            </section>
          )}
        </div>
        <aside className="customize-preview-column" aria-label="Design preview">
          <div
            className="customize-slot-tabs"
            role="group"
            aria-label="Preview screen"
          >
            {SLOTS.map((item) => (
              <button
                type="button"
                key={item.key}
                aria-pressed={slot === item.key}
                onClick={() => setSlot(item.key)}
              >
                {item.key === "lyricsAnimation" ? "Lyrics" : item.label}
              </button>
            ))}
          </div>
          <Preview
            config={currentPreview}
            slot={slot}
            creator={previewCreator}
            recipient={previewRecipient}
          />
          <p className="customize-help">
            Preview only. Your current app stays as it is until you apply a
            design. Animation respects reduced-motion settings.
          </p>
        </aside>
      </div>
      <footer className="customize-console-footer">
        <p>
          {panel === "design"
            ? recipient?.id === me.id
              ? `${priceLabel} once. Your design is saved after payment is verified.`
              : `${priceLabel} once. Your recipient chooses when to apply it.`
            : "You’re always in control of your own look."}
        </p>
        {panel === "design" ? (
          <Button
            type="submit"
            form="customize-form"
            loading={busy}
            disabled={!recipient || !valid || !payment.pricing?.configured}
          >
            {recipient?.id === me.id
              ? `Pay ${priceLabel} and apply`
              : `Pay ${priceLabel} and send`}
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setPanel("design")}>
            Create a design
          </Button>
        )}
      </footer>
    </section>
  );
}
