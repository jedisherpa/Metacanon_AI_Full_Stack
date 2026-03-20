import { FadeIn } from "@/components/sections/FadeIn";
import { SectionDivider } from "@/components/sections/SectionDivider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUpRight,
  BookOpenText,
  Download,
  ScrollText,
  Shield,
  Sparkles,
} from "lucide-react";
import {
  lazy,
  Suspense,
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import { ArtifactDialog } from "./components/ArtifactDialog";
import { ForgeBackdrop } from "./components/ForgeBackdrop";
import { PortalGrid } from "./components/PortalGrid";
import { SovereignWall } from "./components/SovereignWall";
import { DIANA_MEMBER_CONFIG } from "./config/member";
import { DIANA_PORTALS } from "./config/portals";
import { resolveArtifactResult, resolvePrismPrompt } from "./logic";
import {
  buildPortalUrl,
  checkSovereignBadge,
  fetchWallEntries,
  flushQueuedEvents,
  getArrivalContext,
  getOrCreateSovereignUUID,
  logSovereignEvent,
  subscribeToWallEntries,
} from "./lib/sovereign";
import type {
  ArrivalContext,
  HeroPortraitOption,
  InfluenceDefinition,
  SovereignBadge,
  SovereignEventPayload,
  WallEntry,
} from "./types";

const LazyForgeScene = lazy(async () => {
  const module = await import("./components/ForgeScene");
  return { default: module.ForgeScene };
});

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function prettifyToken(value: string | null) {
  if (!value) {
    return null;
  }

  return value.replace(/[-_]/g, " ");
}

function parsePositionToken(token: string | undefined, fallback: number) {
  if (!token) {
    return fallback;
  }

  const normalized = token.trim().toLowerCase();

  if (normalized === "left" || normalized === "top") {
    return 0;
  }

  if (normalized === "center") {
    return 50;
  }

  if (normalized === "right" || normalized === "bottom") {
    return 100;
  }

  if (normalized.endsWith("%")) {
    const parsed = Number.parseFloat(normalized);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function parseObjectPosition(value: string | undefined) {
  const tokens = value?.trim().split(/\s+/) ?? [];

  return {
    x: parsePositionToken(tokens[0], 50),
    y: parsePositionToken(tokens[1], 20),
  };
}

function formatObjectPosition(x: number, y: number) {
  return `${Math.round(x)}% ${Math.round(y)}%`;
}

function parseHeroCrop(option: HeroPortraitOption) {
  const position = parseObjectPosition(option.objectPosition);

  return {
    ...position,
    scale: option.scale ?? 1,
  };
}

function formatHeroScale(scale: number) {
  return Number(scale.toFixed(2));
}

function EditorialImage({
  path,
  alt,
  eyebrow,
}: {
  path: string;
  alt: string;
  eyebrow: string;
}) {
  const [missing, setMissing] = useState(false);

  if (missing) {
    return (
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(160deg,rgba(201,168,76,0.12),rgba(75,0,130,0.2),rgba(26,0,51,0.92))]">
        <div className="p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[rgba(255,250,205,0.62)]">
            {eyebrow}
          </p>
        </div>
        <div className="aspect-[4/5] w-full bg-[radial-gradient(circle_at_top,_rgba(201,168,76,0.25),_transparent_34%),linear-gradient(180deg,_rgba(75,0,130,0.24),_rgba(26,0,51,0.72))]" />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/20">
      <img
        src={path}
        alt={alt}
        onError={() => setMissing(true)}
        loading={eyebrow === "Hero portrait" ? "eager" : "lazy"}
        decoding="async"
        className="min-h-[420px] w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
      <div className="absolute left-6 top-6">
        <p className="text-xs uppercase tracking-[0.24em] text-[rgba(255,250,205,0.72)]">
          {eyebrow}
        </p>
      </div>
    </div>
  );
}

function BadgeNotification({ badge }: { badge: SovereignBadge | null }) {
  return (
    <AnimatePresence>
      {badge ? (
        <motion.div
          initial={{ opacity: 0, y: -22 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -22 }}
          role="status"
          aria-live="polite"
          className="fixed right-6 top-6 z-50 max-w-sm rounded-[1.6rem] border border-sovereign-gold/35 bg-[rgba(26,0,51,0.94)] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-md"
        >
          <p className="text-xs uppercase tracking-[0.22em] text-sovereign-gold">Badge earned</p>
          <h3 className="mt-2 font-display text-3xl text-radiant-white">{badge.title}</h3>
          <p className="mt-2 text-sm leading-7 text-[rgba(255,250,205,0.72)]">
            {badge.description}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function PrismConsole({
  onEvent,
}: {
  onEvent: (payload: SovereignEventPayload) => void | Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState(resolvePrismPrompt(""));

  return (
    <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p
          className="text-sm uppercase tracking-[0.24em] text-sovereign-gold"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Prism simulator
        </p>
        <h3 className="mt-5 font-display text-4xl text-radiant-white sm:text-5xl">
          A lens set for grief, ferocity, and re-selfing.
        </h3>
        <p className="mt-5 max-w-xl text-lg leading-9 text-[rgba(255,250,205,0.74)]">
          These prompts are authored from Diana&apos;s own source material. They
          demonstrate how this realm names fragmentation, shadow, tenderness, and
          return without flattening them into generic self-help.
        </p>

        <div className="mt-10 border-y border-white/10">
          {DIANA_MEMBER_CONFIG.prismPairs.map((pair) => (
            <button
              key={pair.prompt}
              onClick={() => {
                setPrompt(pair.prompt);
                setResponse(pair);
              }}
              className="w-full border-t border-white/10 py-5 text-left first:border-t-0"
            >
              <p className="text-base leading-8 text-[rgba(255,250,205,0.84)]">{pair.prompt}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="border-l border-white/10 pl-0 lg:pl-10">
        <label className="text-xs uppercase tracking-[0.22em] text-[rgba(255,250,205,0.64)]">
          Ask Prism
        </label>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="What fragment wants to come back into coherence?"
          className="mt-4 min-h-36 border-white/10 bg-transparent px-0 text-base text-radiant-white placeholder:text-[rgba(255,250,205,0.36)]"
        />

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={() => setResponse(resolvePrismPrompt(prompt))}
            className="rounded-full bg-sovereign-gold px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-[#1a0033] hover:bg-[rgba(201,168,76,0.92)]"
          >
            Simulate response
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full border-sovereign-gold/35 bg-transparent px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-sovereign-gold"
            onClick={() => {
              void onEvent({
                eventType: "prism_cta",
                metadata: {
                  destination: import.meta.env.VITE_PRISM_DOWNLOAD_URL,
                },
              });

              const url =
                import.meta.env.VITE_PRISM_DOWNLOAD_URL || "https://metacanonai.com/prism";
              window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            <Download className="size-4" />
            Download Prism
          </Button>
        </div>

        <div className="mt-10 border-l-4 border-sovereign-gold pl-6">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[rgba(255,250,205,0.62)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Response
          </p>
          <h4 className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-sovereign-gold">
            {response.prompt}
          </h4>
          <p className="mt-4 text-lg leading-9 text-[rgba(255,250,205,0.84)]">
            {response.response}
          </p>
        </div>
      </div>
    </div>
  );
}

function AscensionBlock({
  onEvent,
}: {
  onEvent: (payload: SovereignEventPayload) => void | Promise<void>;
}) {
  const actions = [
    {
      id: "ddos",
      title: "Sign the DDOS",
      body: "Move from resonance into declaration and anchor your public yes.",
      icon: Shield,
      eventType: "ddos_sign" as const,
      url: import.meta.env.VITE_DDOS_SIGN_URL || "https://metacanonai.com/sign",
    },
    {
      id: "prism",
      title: "Download Prism",
      body: "Carry Diana's lens set into a tool designed for ongoing reflection and coherent action.",
      icon: Sparkles,
      eventType: "prism_cta" as const,
      url: import.meta.env.VITE_PRISM_DOWNLOAD_URL || "https://metacanonai.com/prism",
    },
    {
      id: "constitution",
      title: "Read the Constitution",
      body: "Step from the personal realm into the structural language of the wider Metacanon ecosystem.",
      icon: BookOpenText,
      eventType: "prism_cta" as const,
      url: import.meta.env.VITE_CONSTITUTION_URL || "https://metacanonai.com/constitution",
    },
  ];

  return (
    <div className="border-y border-white/10">
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <article
            key={action.id}
            className="grid gap-5 border-t border-white/10 py-8 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div>
              <div className="flex items-center gap-3">
                <Icon className="size-5 text-sovereign-gold" />
                <h4 className="font-display text-3xl text-radiant-white">{action.title}</h4>
              </div>
              <p className="mt-4 max-w-2xl text-base leading-8 text-[rgba(255,250,205,0.74)]">
                {action.body}
              </p>
            </div>

            <Button
              size="lg"
              variant="outline"
              className="rounded-full border-sovereign-gold/35 bg-transparent px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-sovereign-gold"
              onClick={() => {
                void onEvent({
                  eventType: action.eventType,
                  metadata: {
                    destination: action.url,
                    actionId: action.id,
                  },
                });
                window.open(action.url, "_blank", "noopener,noreferrer");
              }}
            >
              Continue
              <ArrowUpRight className="size-4" />
            </Button>
          </article>
        );
      })}
    </div>
  );
}

export function DianaWorld() {
  const showHeroCropLab = import.meta.env.DEV;
  const heroPortraitOptions: HeroPortraitOption[] =
    DIANA_MEMBER_CONFIG.heroPortraitOptions.length > 0
      ? DIANA_MEMBER_CONFIG.heroPortraitOptions
      : [
          {
            id: "default",
            label: "Primary",
            path: DIANA_MEMBER_CONFIG.assets.heroPortrait,
            objectPosition: "center 20%",
          },
        ];
  const [arrival, setArrival] = useState<ArrivalContext>({
    fromRealm: null,
    fromLabel: null,
    incomingUuid: null,
    heldArtifact: null,
    quest: null,
  });
  const [activeHeroId, setActiveHeroId] = useState(heroPortraitOptions[0].id);
  const [isHeroCropLabCollapsed, setIsHeroCropLabCollapsed] = useState(false);
  const [heroCropPositions, setHeroCropPositions] = useState<
    Record<string, { x: number; y: number; scale: number }>
  >(() =>
    Object.fromEntries(heroPortraitOptions.map((option) => [option.id, parseHeroCrop(option)]))
  );
  const [uuid, setUuid] = useState("");
  const [badge, setBadge] = useState<SovereignBadge | null>(null);
  const [wallEntries, setWallEntries] = useState<WallEntry[]>(
    DIANA_MEMBER_CONFIG.wallSeeds.map((label, index) => ({
      id: `seed-${index}`,
      label,
      subtitle: "Anchored in the luminous covenant",
    }))
  );
  const [activeInfluence, setActiveInfluence] = useState<InfluenceDefinition | null>(
    DIANA_MEMBER_CONFIG.influences[0]
  );
  const activeHero =
    heroPortraitOptions.find((option) => option.id === activeHeroId) ?? heroPortraitOptions[0];
  const activeHeroCrop = heroCropPositions[activeHero.id] ?? parseHeroCrop(activeHero);
  const heroPortraitConfigSnapshot = [
    "heroPortraitOptions: [",
    heroPortraitOptions
      .map((option) => {
        const crop = heroCropPositions[option.id] ?? parseHeroCrop(option);

        return [
          "  {",
          `    id: "${option.id}",`,
          `    label: "${option.label}",`,
          `    path: "${option.path}",`,
          `    objectPosition: "${formatObjectPosition(crop.x, crop.y)}",`,
          `    scale: ${formatHeroScale(crop.scale)},`,
          "  },",
        ].join("\n");
      })
      .join("\n"),
    "],",
  ].join("\n");

  const arrivalThreads = useMemo(() => {
    const threads = [];

    if (arrival.fromLabel) {
      threads.push(
        `Arriving from ${arrival.fromLabel}. Your UUID has been carried forward so this realm can recognize your passage.`
      );
    }

    if (arrival.heldArtifact) {
      threads.push(`Held artifact: ${prettifyToken(arrival.heldArtifact)}.`);
    }

    if (arrival.quest) {
      threads.push(`Current quest: ${prettifyToken(arrival.quest)}.`);
    }

    return threads;
  }, [arrival.fromLabel, arrival.heldArtifact, arrival.quest]);

  const refreshWallEntries = useEffectEvent(async () => {
    const entries = await fetchWallEntries();
    startTransition(() => setWallEntries(entries));
  });

  const handleEvent = useEffectEvent(async (payload: SovereignEventPayload) => {
    if (!uuid) {
      return;
    }

    const didLog = await logSovereignEvent(payload, arrival, uuid);
    if (!didLog) {
      return;
    }

    const maybeBadge = await checkSovereignBadge(uuid);
    if (maybeBadge) {
      startTransition(() => setBadge(maybeBadge));
      window.setTimeout(() => {
        startTransition(() => setBadge(null));
      }, 5200);
    }

    if (payload.eventType === "ddos_sign") {
      await refreshWallEntries();
    }
  });

  useEffect(() => {
    document.title = DIANA_MEMBER_CONFIG.pageTitle;

    const setMeta = (
      selector: string,
      attribute: "name" | "property",
      value: string,
      content: string
    ) => {
      let meta = document.head.querySelector<HTMLMetaElement>(selector);
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute(attribute, value);
        document.head.appendChild(meta);
      }

      meta.setAttribute("content", content);
    };

    setMeta(
      'meta[name="description"]',
      "name",
      "description",
      DIANA_MEMBER_CONFIG.pageDescription
    );
    setMeta('meta[property="og:title"]', "property", "og:title", DIANA_MEMBER_CONFIG.pageTitle);
    setMeta(
      'meta[property="og:description"]',
      "property",
      "og:description",
      DIANA_MEMBER_CONFIG.pageDescription
    );
    setMeta('meta[property="og:image"]', "property", "og:image", "/diana/og-image.svg");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", DIANA_MEMBER_CONFIG.pageTitle);
    setMeta(
      'meta[name="twitter:description"]',
      "name",
      "twitter:description",
      DIANA_MEMBER_CONFIG.pageDescription
    );
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", "/diana/og-image.svg");
  }, []);

  useEffect(() => {
    const nextArrival = getArrivalContext(window.location.search);
    const nextUuid = getOrCreateSovereignUUID(nextArrival.incomingUuid);

    setArrival(nextArrival);
    setUuid(nextUuid);

    void flushQueuedEvents();
    void handleEvent({
      eventType: "visit",
      metadata: {
        pathname: window.location.pathname,
      },
    });

    void refreshWallEntries();

    const timer = window.setInterval(() => {
      void refreshWallEntries();
    }, 30000);

    const unsubscribe = subscribeToWallEntries(() => {
      void refreshWallEntries();
    });

    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [handleEvent, refreshWallEntries]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <Suspense fallback={<ForgeBackdrop />}>
        <LazyForgeScene />
      </Suspense>
      <BadgeNotification badge={badge} />

      <main className="relative z-10">
        <section id="arrival" className="relative min-h-screen overflow-hidden">
          <div className="absolute inset-0">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={activeHero.path}
                initial={{ opacity: 0.18 }}
                animate={{ opacity: 0.62 }}
                exit={{ opacity: 0.18 }}
                transition={{ duration: 0.42, ease: "easeOut" }}
                style={{
                  backgroundImage: `url(${activeHero.path})`,
                  backgroundPosition: formatObjectPosition(activeHeroCrop.x, activeHeroCrop.y),
                  backgroundSize: `${Math.round(activeHeroCrop.scale * 100)}% auto`,
                }}
                className="h-full w-full bg-no-repeat saturate-[1.08] contrast-110"
              />
            </AnimatePresence>
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/26 to-background/46" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/92 via-background/42 via-45% to-background/18" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_32%,rgba(201,168,76,0.16),transparent_28%)]" />
          </div>

          {showHeroCropLab ? (
            isHeroCropLabCollapsed ? (
              <div className="absolute left-5 top-5 z-20 flex items-center gap-3 rounded-[1.4rem] border border-white/10 bg-[rgba(26,0,51,0.74)] px-4 py-3 shadow-[0_24px_70px_rgba(0,0,0,0.3)] backdrop-blur-md md:left-8 md:top-8">
                <p
                  className="text-[0.68rem] uppercase tracking-[0.24em] text-sovereign-gold"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Hero crop lab
                </p>
                <button
                  type="button"
                  onClick={() => setIsHeroCropLabCollapsed(false)}
                  className="rounded-full border border-white/15 px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[rgba(255,250,205,0.78)] transition hover:border-sovereign-gold/45 hover:text-radiant-white"
                >
                  Open
                </button>
              </div>
            ) : (
              <div className="absolute left-5 top-5 z-20 w-[min(24rem,calc(100vw-2.5rem))] rounded-[1.4rem] border border-white/10 bg-[rgba(26,0,51,0.74)] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.3)] backdrop-blur-md md:left-8 md:top-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p
                      className="text-[0.68rem] uppercase tracking-[0.24em] text-sovereign-gold"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      Hero crop lab
                    </p>
                    <p className="mt-2 text-xs leading-6 text-[rgba(255,250,205,0.66)]">
                      Zoom first if the portrait is too narrow, then use X and Y to land the frame.
                      These controls are dev-only and leave the baked config untouched until we
                      paste it back.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setHeroCropPositions((current) => ({
                          ...current,
                          [activeHero.id]: parseHeroCrop(activeHero),
                        }));
                      }}
                      className="rounded-full border border-white/15 px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[rgba(255,250,205,0.78)] transition hover:border-sovereign-gold/45 hover:text-radiant-white"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsHeroCropLabCollapsed(true)}
                      className="rounded-full border border-white/15 px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[rgba(255,250,205,0.78)] transition hover:border-sovereign-gold/45 hover:text-radiant-white"
                    >
                      Collapse
                    </button>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <label className="block">
                    <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.2em] text-[rgba(255,250,205,0.66)]">
                      <span>X position</span>
                      <span className="text-sovereign-gold">{Math.round(activeHeroCrop.x)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={activeHeroCrop.x}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setHeroCropPositions((current) => ({
                          ...current,
                          [activeHero.id]: {
                            ...(current[activeHero.id] ?? parseHeroCrop(activeHero)),
                            x: nextValue,
                          },
                        }));
                      }}
                      className="mt-2 w-full accent-[#c9a84c]"
                    />
                  </label>

                  <label className="block">
                    <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.2em] text-[rgba(255,250,205,0.66)]">
                      <span>Y position</span>
                      <span className="text-sovereign-gold">{Math.round(activeHeroCrop.y)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={activeHeroCrop.y}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setHeroCropPositions((current) => ({
                          ...current,
                          [activeHero.id]: {
                            ...(current[activeHero.id] ?? parseHeroCrop(activeHero)),
                            y: nextValue,
                          },
                        }));
                      }}
                      className="mt-2 w-full accent-[#c9a84c]"
                    />
                  </label>

                  <label className="block">
                    <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.2em] text-[rgba(255,250,205,0.66)]">
                      <span>Zoom</span>
                      <span className="text-sovereign-gold">
                        {formatHeroScale(activeHeroCrop.scale)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="1.8"
                      step="0.01"
                      value={activeHeroCrop.scale}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setHeroCropPositions((current) => ({
                          ...current,
                          [activeHero.id]: {
                            ...(current[activeHero.id] ?? parseHeroCrop(activeHero)),
                            scale: nextValue,
                          },
                        }));
                      }}
                      className="mt-2 w-full accent-[#c9a84c]"
                    />
                  </label>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-[rgba(255,250,205,0.56)]">
                    Current crop
                  </p>
                  <p className="mt-2 font-mono text-sm text-sovereign-gold">
                    {formatObjectPosition(activeHeroCrop.x, activeHeroCrop.y)}
                  </p>
                  <p className="mt-1 font-mono text-sm text-sovereign-gold">
                    {formatHeroScale(activeHeroCrop.scale)}x
                  </p>
                </div>

                <Textarea
                  readOnly
                  value={heroPortraitConfigSnapshot}
                  className="mt-4 min-h-44 resize-y border-white/10 bg-[rgba(0,0,0,0.18)] font-mono text-xs leading-6 text-[rgba(255,250,205,0.78)]"
                />
              </div>
            )
          ) : null}

          <div className="absolute right-5 top-5 z-20 flex flex-wrap justify-end gap-2 md:right-8 md:top-8">
            {heroPortraitOptions.map((option, index) => {
              const isActive = option.id === activeHero.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    setActiveHeroId(option.id);
                    void handleEvent({
                      eventType: "story_interact",
                      metadata: {
                        section: "arrival",
                        interaction: "hero_portrait_select",
                        heroOptionId: option.id,
                      },
                    });
                  }}
                  className={`rounded-full border px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] transition ${
                    isActive
                      ? "border-sovereign-gold bg-sovereign-gold text-[#1a0033]"
                      : "border-white/15 bg-[rgba(26,0,51,0.58)] text-[rgba(255,250,205,0.86)] backdrop-blur-md hover:border-sovereign-gold/45 hover:text-radiant-white"
                  }`}
                >
                  {index + 1}. {option.label}
                </button>
              );
            })}
          </div>

          <div className="relative z-10 flex min-h-screen items-end px-8 py-20 md:px-16 lg:px-24">
            <div className="max-w-5xl">
              {arrivalThreads.length > 0 ? (
                <FadeIn>
                  <div className="mb-10 max-w-2xl rounded-[1.4rem] border border-sovereign-gold/25 bg-[rgba(201,168,76,0.08)] px-5 py-4">
                    <div className="space-y-2">
                      {arrivalThreads.map((thread) => (
                        <p
                          key={thread}
                          className="text-sm leading-7 text-[rgba(255,250,205,0.82)]"
                        >
                          {thread}
                        </p>
                      ))}
                    </div>
                  </div>
                </FadeIn>
              ) : null}

              <FadeIn delay={0.08}>
                <p
                  className="text-sm uppercase tracking-[0.32em] text-sovereign-gold"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Diana Fleishman • Luminous Shadowbreaker
                </p>
              </FadeIn>

              <FadeIn delay={0.16}>
                <h1 className="mt-6 max-w-5xl font-display text-5xl leading-[1.04] text-radiant-white sm:text-6xl md:text-7xl lg:text-8xl">
                  {DIANA_MEMBER_CONFIG.primaryHeadline}
                </h1>
              </FadeIn>

              <FadeIn delay={0.24}>
                <p className="mt-8 max-w-3xl text-xl leading-9 text-[rgba(255,250,205,0.82)]">
                  {DIANA_MEMBER_CONFIG.subheadline}
                </p>
              </FadeIn>

              <FadeIn delay={0.32}>
                <p className="mt-6 max-w-3xl text-lg leading-9 text-[rgba(255,250,205,0.68)]">
                  {DIANA_MEMBER_CONFIG.arrivalBody}
                </p>
              </FadeIn>

              <FadeIn delay={0.4}>
                <div className="mt-10 max-w-3xl border-l-4 border-sovereign-gold pl-6">
                  <p className="text-xl leading-9 text-[rgba(255,250,205,0.88)]">
                    {DIANA_MEMBER_CONFIG.activationMessage}
                  </p>
                </div>
              </FadeIn>

              <FadeIn delay={0.48}>
                <div className="mt-10 flex flex-wrap gap-4">
                  <Button
                    size="lg"
                    onClick={() => scrollToSection("origin")}
                    className="rounded-full bg-sovereign-gold px-7 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-[#1a0033] hover:bg-[rgba(201,168,76,0.92)]"
                  >
                    Begin the pilgrimage
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => scrollToSection("artifacts")}
                    className="rounded-full border-white/15 bg-transparent px-7 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-radiant-white"
                  >
                    Enter the relics
                  </Button>
                </div>
              </FadeIn>

              <FadeIn delay={0.56}>
                <div className="mt-10 flex flex-wrap gap-8 text-sm text-[rgba(255,250,205,0.58)]">
                  <p>Realm: {DIANA_MEMBER_CONFIG.realmId}</p>
                  <p>UUID: {uuid || "Resolving"}</p>
                  <p>Mode: portal-aware, ledger-ready</p>
                  {arrival.heldArtifact ? (
                    <p>Artifact: {prettifyToken(arrival.heldArtifact)}</p>
                  ) : null}
                </div>
              </FadeIn>

              <FadeIn delay={0.64}>
                <div className="mt-14 flex items-center gap-4">
                  <div className="h-px w-16 bg-sovereign-gold/50" />
                  <p
                    className="text-sm uppercase tracking-[0.24em] text-[rgba(255,250,205,0.58)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Scroll to begin
                  </p>
                </div>
              </FadeIn>
            </div>
          </div>
        </section>

        <SectionDivider />

        <section id="origin" className="relative overflow-hidden">
          <div className="px-8 py-24 md:px-16 md:py-32 lg:px-24">
            <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <FadeIn>
                <EditorialImage
                  path={DIANA_MEMBER_CONFIG.assets.originPortrait}
                  alt="Diana outdoors in white"
                  eyebrow="Origin"
                />
              </FadeIn>

              <div>
                <FadeIn>
                  <p
                    className="text-sm uppercase tracking-[0.28em] text-sovereign-gold"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Origin
                  </p>
                </FadeIn>

                <FadeIn delay={0.08}>
                  <h2 className="mt-5 font-display text-4xl leading-tight text-radiant-white sm:text-5xl md:text-6xl">
                    {DIANA_MEMBER_CONFIG.originHeadline}
                  </h2>
                </FadeIn>

                <FadeIn delay={0.16}>
                  <p className="mt-8 max-w-3xl text-lg leading-9 text-[rgba(255,250,205,0.78)]">
                    {DIANA_MEMBER_CONFIG.originBody}
                  </p>
                </FadeIn>

                <div className="mt-12 space-y-7">
                  {DIANA_MEMBER_CONFIG.originMoments.map((moment, index) => (
                    <FadeIn key={moment.id} delay={0.24 + index * 0.08}>
                      <button
                        onClick={() => {
                          void handleEvent({
                            eventType: "story_interact",
                            metadata: {
                              storyMoment: moment.id,
                            },
                          });
                        }}
                        className="block border-l-4 border-white/10 pl-6 text-left transition-colors hover:border-sovereign-gold"
                      >
                        <p className="text-sm uppercase tracking-[0.2em] text-sovereign-gold">
                          {moment.label}
                        </p>
                        <p className="mt-2 text-base leading-8 text-[rgba(255,250,205,0.72)]">
                          {moment.detail}
                        </p>
                      </button>
                    </FadeIn>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        <section id="artifacts" className="relative overflow-hidden">
          <div className="px-8 py-24 md:px-16 md:py-32 lg:px-24">
            <FadeIn>
              <p
                className="text-sm uppercase tracking-[0.28em] text-sovereign-gold"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                The relics
              </p>
            </FadeIn>

            <FadeIn delay={0.08}>
              <h2 className="mt-5 max-w-4xl font-display text-4xl leading-tight text-radiant-white sm:text-5xl md:text-6xl">
                Five thresholds for turning fragmentation into coherent selfhood.
              </h2>
            </FadeIn>

            <FadeIn delay={0.16}>
              <p className="mt-8 max-w-3xl text-lg leading-9 text-[rgba(255,250,205,0.74)]">
                Each artifact is grounded in Diana&apos;s actual themes: performance,
                grief, ferocity, relational initiation, and the rebuilding of
                story. The point is not spectacle. It is return.
              </p>
            </FadeIn>

            <div className="mt-12 border-b border-white/10">
              {DIANA_MEMBER_CONFIG.artifacts.map((artifact, index) => (
                <FadeIn key={artifact.id} delay={0.24 + index * 0.06}>
                  <ArtifactDialog
                    artifact={artifact}
                    onEvent={handleEvent}
                    onResolve={resolveArtifactResult}
                  />
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        <section id="lineage" className="relative overflow-hidden">
          <div className="px-8 py-24 md:px-16 md:py-32 lg:px-24">
            <div className="grid gap-16 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <FadeIn>
                  <p
                    className="text-sm uppercase tracking-[0.28em] text-sovereign-gold"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Intellectual lineage
                  </p>
                </FadeIn>

                <FadeIn delay={0.08}>
                  <h2 className="mt-5 max-w-3xl font-display text-4xl leading-tight text-radiant-white sm:text-5xl">
                    The books and thinkers beneath the mythic frame.
                  </h2>
                </FadeIn>

                <div className="mt-12 border-y border-white/10">
                  {DIANA_MEMBER_CONFIG.influences.map((influence, index) => (
                    <FadeIn key={influence.id} delay={0.16 + index * 0.05}>
                      <button
                        onClick={() => {
                          setActiveInfluence(influence);
                          void handleEvent({
                            eventType: "influence_click",
                            metadata: {
                              influenceId: influence.id,
                            },
                          });
                        }}
                        className="block w-full border-t border-white/10 py-5 text-left first:border-t-0"
                      >
                        <p className="text-sm uppercase tracking-[0.2em] text-[rgba(255,250,205,0.56)]">
                          {influence.author}
                        </p>
                        <h3 className="mt-2 font-display text-3xl text-radiant-white">
                          {influence.title}
                        </h3>
                        <p className="mt-3 max-w-xl text-base leading-8 text-[rgba(255,250,205,0.7)]">
                          {influence.body}
                        </p>
                      </button>
                    </FadeIn>
                  ))}
                </div>
              </div>

              <FadeIn delay={0.18}>
                <div className="border-l-4 border-sovereign-gold pl-8">
                  <p
                    className="text-sm uppercase tracking-[0.24em] text-[rgba(255,250,205,0.58)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Diana&apos;s reflection
                  </p>
                  <h3 className="mt-6 font-display text-4xl text-radiant-white sm:text-5xl">
                    {activeInfluence?.title}
                  </h3>
                  <p className="mt-3 text-sm uppercase tracking-[0.22em] text-sovereign-gold">
                    {activeInfluence?.author}
                  </p>
                  <p className="mt-8 max-w-2xl text-xl leading-10 text-[rgba(255,250,205,0.82)]">
                    {activeInfluence?.reflection}
                  </p>
                </div>
              </FadeIn>
            </div>
          </div>
        </section>

        <SectionDivider />

        <section id="prism" className="relative overflow-hidden">
          <div className="px-8 py-24 md:px-16 md:py-32 lg:px-24">
            <FadeIn>
              <p
                className="text-sm uppercase tracking-[0.28em] text-sovereign-gold"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Prism
              </p>
            </FadeIn>

            <FadeIn delay={0.08}>
              <h2 className="mt-5 max-w-4xl font-display text-4xl leading-tight text-radiant-white sm:text-5xl md:text-6xl">
                A refracting lens for shadow, grief, and return.
              </h2>
            </FadeIn>

            <FadeIn delay={0.16}>
              <p className="mt-8 max-w-3xl text-lg leading-9 text-[rgba(255,250,205,0.74)]">
                Diana&apos;s lens is not about abstract signal. It is about what the
                body, story, and relational field are actually asking to be
                witnessed and integrated.
              </p>
            </FadeIn>

            <div className="mt-12">
              <FadeIn delay={0.24}>
                <PrismConsole onEvent={handleEvent} />
              </FadeIn>
            </div>
          </div>
        </section>

        <SectionDivider />

        <section id="wall" className="relative overflow-hidden">
          <div className="px-8 py-24 md:px-16 md:py-32 lg:px-24">
            <FadeIn>
              <SovereignWall
                entries={wallEntries}
                onViewed={() =>
                  handleEvent({
                    eventType: "wall_view",
                    metadata: {
                      count: wallEntries.length,
                    },
                  })
                }
              />
            </FadeIn>
          </div>
        </section>

        <SectionDivider />

        <section id="ascension" className="relative overflow-hidden">
          <div className="px-8 py-24 md:px-16 md:py-32 lg:px-24">
            <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <FadeIn>
                <EditorialImage
                  path={DIANA_MEMBER_CONFIG.assets.ascensionPortrait}
                  alt="Diana at dusk on the shoreline"
                  eyebrow="Ascension"
                />
              </FadeIn>

              <div>
                <FadeIn>
                  <p
                    className="text-sm uppercase tracking-[0.28em] text-sovereign-gold"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Ascension
                  </p>
                </FadeIn>

                <FadeIn delay={0.08}>
                  <h2 className="mt-5 max-w-4xl font-display text-4xl leading-tight text-radiant-white sm:text-5xl md:text-6xl">
                    Claim the throne beneath the crumbling palace.
                  </h2>
                </FadeIn>

                <FadeIn delay={0.16}>
                  <div className="mt-8 border-l-4 border-sovereign-gold pl-6">
                    <p className="text-xl leading-10 text-[rgba(255,250,205,0.84)]">
                      {DIANA_MEMBER_CONFIG.ascensionQuote}
                    </p>
                  </div>
                </FadeIn>

                <div className="mt-12">
                  <FadeIn delay={0.24}>
                    <AscensionBlock onEvent={handleEvent} />
                  </FadeIn>
                </div>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        <section id="portals" className="relative overflow-hidden">
          <div className="px-8 py-24 md:px-16 md:py-32 lg:px-24">
            <FadeIn>
              <p
                className="text-sm uppercase tracking-[0.28em] text-sovereign-gold"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Outgoing portals
              </p>
            </FadeIn>

            <FadeIn delay={0.08}>
              <h2 className="mt-5 max-w-4xl font-display text-4xl leading-tight text-radiant-white sm:text-5xl md:text-6xl">
                Carry your reclaimed fragment into allied realms.
              </h2>
            </FadeIn>

            <FadeIn delay={0.16}>
              <p className="mt-8 max-w-3xl text-lg leading-9 text-[rgba(255,250,205,0.74)]">
                These crossings preserve Diana&apos;s realm ID and the current UUID so
                passage through the wider ecosystem can remain one continuous story
                instead of a disconnected set of visits.
              </p>
            </FadeIn>

            <div className="mt-12">
              <FadeIn delay={0.24}>
                <PortalGrid
                  portals={DIANA_PORTALS}
                  onPortalClick={async (portal, payload) => {
                    await handleEvent(payload);
                    const destination = buildPortalUrl(
                      portal.destinationUrl,
                      uuid,
                      portal.destinationRealm
                    );
                    window.location.assign(destination);
                  }}
                />
              </FadeIn>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 px-8 pb-20 pt-10 md:px-16 lg:px-24">
        <div className="max-w-4xl border-t border-white/10 pt-12">
          <FadeIn>
            <p
              className="text-sm uppercase tracking-[0.28em] text-sovereign-gold"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Closing note
            </p>
          </FadeIn>

          <FadeIn delay={0.08}>
            <h2 className="mt-5 font-display text-4xl leading-tight text-radiant-white sm:text-5xl">
              The myth is not decoration. It is a way back to coherence.
            </h2>
          </FadeIn>

          <FadeIn delay={0.16}>
            <p className="mt-6 max-w-3xl text-lg leading-9 text-[rgba(255,250,205,0.72)]">
              This world is built from Diana&apos;s myth, transcript, origin story,
              and throughlines. Its job is not to flatten the journey but to hold
              it long enough for truth, tenderness, and sovereignty to meet.
            </p>
          </FadeIn>

          <FadeIn delay={0.24}>
            <div className="mt-10 flex flex-wrap gap-4">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full border-sovereign-gold/35 bg-transparent px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-sovereign-gold"
                onClick={() =>
                  window.open(
                    import.meta.env.VITE_CONSTITUTION_URL || "https://metacanonai.com/constitution",
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              >
                <ScrollText className="size-4" />
                Constitution
              </Button>
              <Button
                size="lg"
                onClick={() => scrollToSection("arrival")}
                className="rounded-full bg-sovereign-gold px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-[#1a0033] hover:bg-[rgba(201,168,76,0.92)]"
              >
                Return to top
                <ArrowUpRight className="size-4" />
              </Button>
            </div>
          </FadeIn>
        </div>
      </footer>
    </div>
  );
}
