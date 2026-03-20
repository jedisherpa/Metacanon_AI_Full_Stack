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
  useState,
} from "react";
import { ArtifactDialog } from "./components/ArtifactDialog";
import { ForgeBackdrop } from "./components/ForgeBackdrop";
import { PortalGrid } from "./components/PortalGrid";
import { SovereignWall } from "./components/SovereignWall";
import { LIANA_MEMBER_CONFIG } from "./config/member";
import { LIANA_PORTALS } from "./config/portals";
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
  ArtifactDefinition,
  ArtifactResult,
  HeroPortraitOption,
  InfluenceDefinition,
  PrismPromptPair,
  SovereignBadge,
  SovereignEventPayload,
  WallEntry,
} from "./types";

type HeroCrop = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

const LazyForgeScene = lazy(async () => {
  const module = await import("./components/ForgeScene");
  return { default: module.ForgeScene };
});

function normalizePrompt(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

function scorePrismPair(pair: PrismPromptPair, input: string) {
  const pairTerms = new Set(normalizePrompt(pair.prompt).split(/\s+/).filter(Boolean));
  const inputTerms = normalizePrompt(input).split(/\s+/).filter(Boolean);
  return inputTerms.reduce((score, term) => score + (pairTerms.has(term) ? 1 : 0), 0);
}

function resolvePrismPrompt(input: string) {
  if (!input.trim()) {
    return LIANA_MEMBER_CONFIG.prismPairs[0];
  }

  const best = [...LIANA_MEMBER_CONFIG.prismPairs].sort(
    (a, b) => scorePrismPair(b, input) - scorePrismPair(a, input)
  )[0];

  if (!best || scorePrismPair(best, input) === 0) {
    return {
      prompt: input,
      response:
        "Liana lens: slow the pace until your body, language, and desire stop arguing with each other. The next coherent move usually appears after the performance layer drops.",
    };
  }

  return best;
}

function resolveArtifactResult(
  artifact: ArtifactDefinition,
  input: string,
  interactionProgress: number
): ArtifactResult {
  const cleaned = input.trim() || "the unnamed threshold";

  switch (artifact.id) {
    case "eclipse-orb":
      return {
        heading: "Eclipse blessing",
        body: `When you bring "${cleaned}" into the eclipse, the orb answers with a different reading: this shadow is not evidence of failure. It is the place where honesty wants to become illumination.`,
        bullets: [
          "Name the truth you have been softening to stay liked or unchallenged.",
          "Let grief move before you force a lesson out of it.",
          "Choose one small act that brings thought, word, and body back into alignment.",
        ],
      };
    case "fire-staff":
      return {
        heading: "Liberation flare",
        body: `The staff reads "${cleaned}" as dormant life force. What feels numb is often the part of you that was told it had to become manageable before it could become real.`,
        bullets: [
          "Replace one polite performance with a more alive truth this week.",
          "Protect a ritual that returns you to play without dissociation.",
          "Let your body tell you where heat wants to move next.",
        ],
      };
    case "chakra-wheel":
      return {
        heading: "Embodied coherence",
        body: `The wheel receives "${cleaned}" as signal, not inconvenience. Your body is not interrupting the spiritual path. It is the path insisting on participation.`,
        bullets: [
          "Track the sensation before you explain it away.",
          "Choose regulation over intensity for the next 24 hours.",
          "Let one body truth become an explicit boundary or request.",
        ],
      };
    case "castle-gate":
      return {
        heading: "Relational threshold",
        body: `The gate hears "${cleaned}" and asks a harder, cleaner question: what agreement or conversation would create shared reality instead of emotional weather?`,
        bullets: [
          "Say the part you usually edit out to preserve harmony.",
          "Distinguish story, sensation, and fact before asking for repair.",
          "Build the next agreement around clarity, not hope alone.",
        ],
      };
    case "mountain-path": {
      const downloadableText = [
        "Liana Camaras - Rebirth Trail",
        "",
        `Current threshold: ${cleaned}`,
        `Path completion: ${Math.round(interactionProgress * 100)}%`,
        "",
        "Rebirth sequence",
        "1. Name the terrain you are leaving with honesty.",
        "2. Identify the body practice that keeps you coherent inside the transition.",
        "3. Clarify the relationship or community standard your next chapter requires.",
        "4. Take one visible step before certainty arrives in full.",
      ].join("\n");

      return {
        heading: "Rebirth trail",
        body: `The mountain path answers "${cleaned}" with a grounded mandate: stop waiting to feel fully prepared before honoring the chapter that is already asking for devotion.`,
        bullets: [
          "Old terrain: what role, rhythm, or identity is complete enough to release.",
          "Living practice: what keeps your joy coherent rather than performative.",
          "Next move: the simplest step that proves the path is no longer theoretical.",
        ],
        downloadableText,
        downloadableFileName: "liana-rebirth-trail.pdf",
      };
    }
    default:
      return {
        heading: "Artifact response",
        body: cleaned,
        bullets: [],
      };
  }
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

function normalizeHeroRotation(rotation: number) {
  const normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function parseHeroCrop(option: HeroPortraitOption) {
  const position = parseObjectPosition(option.objectPosition);

  return {
    ...position,
    scale: option.scale ?? 1,
    rotation: normalizeHeroRotation(option.rotation ?? 0),
  };
}

function formatHeroScale(scale: number) {
  return Number(scale.toFixed(2));
}

function formatHeroRotation(rotation: number) {
  return `${normalizeHeroRotation(rotation)}deg`;
}

function formatHeroRotationLabel(rotation: number) {
  return `${normalizeHeroRotation(rotation)}°`;
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
      <div className="prism-liana-panel">
        <div className="p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[rgba(245,245,245,0.6)]">
            {eyebrow}
          </p>
        </div>
        <div className="aspect-[4/5] w-full bg-[radial-gradient(circle_at_top,_rgba(214,179,95,0.22),_transparent_34%),linear-gradient(180deg,_rgba(83,183,176,0.18),_rgba(7,9,19,0.76))]" />
      </div>
    );
  }

  return (
    <div className="prism-liana-panel">
      <img
        src={path}
        alt={alt}
        onError={() => setMissing(true)}
        loading={eyebrow === "Hero portrait" ? "eager" : "lazy"}
        decoding="async"
        className="min-h-[420px] w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/55 via-transparent to-transparent" />
      <div className="absolute left-6 top-6">
        <p className="text-xs uppercase tracking-[0.24em] text-[rgba(245,245,245,0.7)]">
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
          className="prism-liana-panel-strong fixed right-6 top-6 z-50 max-w-sm p-5"
        >
          <p className="text-xs uppercase tracking-[0.22em] text-sovereign-gold">Badge earned</p>
          <h3 className="mt-2 font-display text-3xl text-radiant-white">{badge.title}</h3>
          <p className="mt-2 text-sm leading-7 text-[rgba(245,245,245,0.7)]">{badge.description}</p>
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
      <div className="prism-liana-panel p-6 md:p-8">
        <p
          className="text-sm uppercase tracking-[0.24em] text-sovereign-gold"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Prism simulator
        </p>
        <h3 className="mt-5 font-display text-4xl text-radiant-white sm:text-5xl">
          A curated lens set for embodied coherence.
        </h3>
        <p className="mt-5 max-w-xl text-lg leading-9 text-[rgba(245,245,245,0.74)]">
          This is not a live AI chat. It is an authored demonstration of how Liana interprets burnout, relational integrity, unity, and emotional tides.
        </p>

        <div className="mt-10 space-y-3">
          {LIANA_MEMBER_CONFIG.prismPairs.map((pair) => (
            <button
              key={pair.prompt}
              onClick={() => {
                setPrompt(pair.prompt);
                setResponse(pair);
              }}
              className="prism-liana-panel w-full px-5 py-5 text-left transition-transform hover:-translate-y-0.5"
            >
              <p className="text-base leading-8 text-[rgba(245,245,245,0.8)]">{pair.prompt}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="prism-liana-panel p-6 md:p-8">
        <label className="text-xs uppercase tracking-[0.22em] text-[rgba(245,245,245,0.64)]">
          Ask Prism
        </label>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="How do I stay coherent without abandoning joy?"
          className="mt-4 min-h-36 rounded-[1.5rem] border-[rgba(246,241,222,0.12)] bg-[rgba(255,255,255,0.03)] px-5 py-4 text-base text-radiant-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_40px_rgba(0,0,0,0.14)] placeholder:text-[rgba(245,245,245,0.38)]"
        />

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            size="lg"
            variant="prism"
            onClick={() => {
              setResponse(resolvePrismPrompt(prompt));
              void onEvent({
                eventType: "prism_cta",
                metadata: {
                  action: "simulate-response",
                  prompt: prompt || LIANA_MEMBER_CONFIG.prismPairs[0].prompt,
                },
              });
            }}
            className="rounded-full px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em]"
          >
            Simulate Response
          </Button>
          <Button
            size="lg"
            variant="prismOutline"
            className="rounded-full px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-sovereign-gold"
            onClick={() => {
              void onEvent({
                eventType: "prism_cta",
                metadata: {
                  action: "download-prism",
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

        <div className="prism-liana-quote mt-10 pl-6 pr-6 py-6">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[rgba(245,245,245,0.62)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Response
          </p>
          <h4 className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-sovereign-gold">
            {response.prompt}
          </h4>
          <p className="mt-4 text-lg leading-9 text-[rgba(245,245,245,0.82)]">
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
      body: "Carry the lens work into a tool designed for ongoing discernment.",
      icon: Sparkles,
      eventType: "prism_cta" as const,
      url: import.meta.env.VITE_PRISM_DOWNLOAD_URL || "https://metacanonai.com/prism",
    },
    {
      id: "constitution",
      title: "Read the Constitution",
      body: "Step from personal initiation into the structural logic of the wider ecosystem.",
      icon: BookOpenText,
      eventType: "prism_cta" as const,
      url: import.meta.env.VITE_CONSTITUTION_URL || "https://metacanonai.com/constitution",
    },
  ];

  return (
    <div className="grid gap-4">
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <article
            key={action.id}
            className="prism-liana-panel grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
          >
            <div>
              <div className="flex items-center gap-3">
                <Icon className="size-5 text-sovereign-gold" />
                <h4 className="font-display text-3xl text-radiant-white">{action.title}</h4>
              </div>
              <p className="mt-4 max-w-2xl text-base leading-8 text-[rgba(245,245,245,0.72)]">
                {action.body}
              </p>
            </div>

            <Button
              size="lg"
              variant="prismOutline"
              className="rounded-full px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-sovereign-gold"
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

export function LianaWorld() {
  const showHeroCropLab = import.meta.env.DEV;
  const heroPortraitOptions: HeroPortraitOption[] =
    LIANA_MEMBER_CONFIG.heroPortraitOptions.length > 0
      ? LIANA_MEMBER_CONFIG.heroPortraitOptions
      : [
          {
            id: "default",
            label: "Primary",
            path: LIANA_MEMBER_CONFIG.assets.heroPortrait,
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
  const [isHeroConfigSnapshotVisible, setIsHeroConfigSnapshotVisible] = useState(false);
  const [heroCropPositions, setHeroCropPositions] = useState<Record<string, HeroCrop>>(() =>
    Object.fromEntries(heroPortraitOptions.map((option) => [option.id, parseHeroCrop(option)]))
  );
  const [uuid, setUuid] = useState("");
  const [badge, setBadge] = useState<SovereignBadge | null>(null);
  const [wallEntries, setWallEntries] = useState<WallEntry[]>(
    LIANA_MEMBER_CONFIG.wallSeeds.map((label, index) => ({
      id: `seed-${index}`,
      label,
      subtitle: "Anchored in the coherence eclipse",
    }))
  );
  const [activeInfluence, setActiveInfluence] = useState<InfluenceDefinition | null>(
    LIANA_MEMBER_CONFIG.influences[0]
  );
  const activeHero =
    heroPortraitOptions.find((option) => option.id === activeHeroId) ?? heroPortraitOptions[0];
  const activeHeroCrop = heroCropPositions[activeHero.id] ?? parseHeroCrop(activeHero);
  const activeHeroRotation = normalizeHeroRotation(activeHeroCrop.rotation);
  const activeHeroUsesRotatedFrame = activeHeroRotation === 90 || activeHeroRotation === 270;
  const sectionShellClass =
    "prism-liana-section-panel mx-4 px-8 py-24 md:mx-6 md:px-12 md:py-32 lg:mx-8 lg:px-16";
  const footerShellClass =
    "prism-liana-section-panel mx-4 px-8 pb-12 pt-12 md:mx-6 md:px-12 lg:mx-8 lg:px-16";
  const heroPortraitConfigSnapshot = heroPortraitOptions
    .map((option) => {
      const crop = heroCropPositions[option.id] ?? parseHeroCrop(option);

      return [
        "    {",
        `      id: "${option.id}",`,
        `      label: "${option.label}",`,
        `      path: "${option.path}",`,
        `      objectPosition: "${formatObjectPosition(crop.x, crop.y)}",`,
        `      scale: ${formatHeroScale(crop.scale)},`,
        `      rotation: ${normalizeHeroRotation(crop.rotation)},`,
        "    },",
      ].join("\n");
    })
    .join("\n");
  const updateActiveHeroCrop = (updater: (crop: HeroCrop) => HeroCrop) => {
    setHeroCropPositions((current) => {
      const currentCrop = current[activeHero.id] ?? parseHeroCrop(activeHero);
      return {
        ...current,
        [activeHero.id]: updater(currentCrop),
      };
    });
  };

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
    document.title = LIANA_MEMBER_CONFIG.pageTitle;

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
      LIANA_MEMBER_CONFIG.pageDescription
    );
    setMeta('meta[property="og:title"]', "property", "og:title", LIANA_MEMBER_CONFIG.pageTitle);
    setMeta(
      'meta[property="og:description"]',
      "property",
      "og:description",
      LIANA_MEMBER_CONFIG.pageDescription
    );
    setMeta('meta[property="og:image"]', "property", "og:image", "/liana/og-image.svg");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", LIANA_MEMBER_CONFIG.pageTitle);
    setMeta(
      'meta[name="twitter:description"]',
      "name",
      "twitter:description",
      LIANA_MEMBER_CONFIG.pageDescription
    );
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", "/liana/og-image.svg");
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
    <div className="prism-liana-shell relative min-h-screen overflow-x-hidden bg-background text-foreground">
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
                initial={{ opacity: 0.2 }}
                animate={{ opacity: 0.54 }}
                exit={{ opacity: 0.2 }}
                transition={{ duration: 0.42, ease: "easeOut" }}
                style={{
                  backgroundImage: `url(${activeHero.path})`,
                  backgroundPosition: formatObjectPosition(activeHeroCrop.x, activeHeroCrop.y),
                  backgroundSize: `${Math.round(activeHeroCrop.scale * 100)}% auto`,
                  height: activeHeroUsesRotatedFrame ? "100vw" : "100%",
                  transform: `translate(-50%, -50%) rotate(${formatHeroRotation(activeHeroRotation)})`,
                  transformOrigin: "center center",
                  width: activeHeroUsesRotatedFrame ? "100vh" : "100%",
                }}
                className="absolute left-1/2 top-1/2 bg-no-repeat saturate-[1.05]"
              />
            </AnimatePresence>
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/68 to-background/16" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-[#0d1324]/66 to-transparent" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_24%,rgba(214,179,95,0.16),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(83,183,176,0.12),transparent_22%)]" />
          </div>

          {showHeroCropLab ? (
            isHeroCropLabCollapsed ? (
              <div className="prism-liana-panel-strong absolute left-5 top-5 z-20 flex items-center gap-3 px-4 py-3 md:left-8 md:top-8">
                <p
                  className="text-[0.68rem] uppercase tracking-[0.24em] text-sovereign-gold"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Hero crop lab
                </p>
                <button
                  type="button"
                  onClick={() => setIsHeroCropLabCollapsed(false)}
                  className="prism-liana-outline-button rounded-full px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
                >
                  Open
                </button>
              </div>
            ) : (
              <div className="prism-liana-panel-strong absolute left-5 top-5 z-20 w-[min(24rem,calc(100vw-2.5rem))] p-4 md:left-8 md:top-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p
                      className="text-[0.68rem] uppercase tracking-[0.24em] text-sovereign-gold"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      Hero crop lab
                    </p>
                    <p className="mt-2 text-xs leading-6 text-[rgba(245,245,245,0.66)]">
                      These portraits are tall, so horizontal panning needs zoom. Raise zoom a
                      little, then use X and Y to place the frame.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        updateActiveHeroCrop(() => parseHeroCrop(activeHero));
                      }}
                      className="prism-liana-outline-button rounded-full px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIsHeroConfigSnapshotVisible((current) => !current)
                      }
                      className="prism-liana-outline-button rounded-full px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
                    >
                      {isHeroConfigSnapshotVisible ? "Hide config" : "Show config"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsHeroCropLabCollapsed(true)}
                      className="prism-liana-outline-button rounded-full px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
                    >
                      Collapse
                    </button>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <label className="block">
                    <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.2em] text-[rgba(245,245,245,0.66)]">
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
                        updateActiveHeroCrop((crop) => ({
                          ...crop,
                          x: nextValue,
                        }));
                      }}
                        className="mt-2 w-full accent-[#d6b35f]"
                    />
                  </label>

                  <label className="block">
                    <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.2em] text-[rgba(245,245,245,0.66)]">
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
                        updateActiveHeroCrop((crop) => ({
                          ...crop,
                          y: nextValue,
                        }));
                      }}
                        className="mt-2 w-full accent-[#d6b35f]"
                    />
                  </label>

                  <label className="block">
                    <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.2em] text-[rgba(245,245,245,0.66)]">
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
                        updateActiveHeroCrop((crop) => ({
                          ...crop,
                          scale: nextValue,
                        }));
                      }}
                        className="mt-2 w-full accent-[#d6b35f]"
                    />
                  </label>

                  <div className="block">
                    <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.2em] text-[rgba(245,245,245,0.66)]">
                      <span>Rotation</span>
                      <span className="text-sovereign-gold">
                        {formatHeroRotationLabel(activeHeroCrop.rotation)}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          updateActiveHeroCrop((crop) => ({
                            ...crop,
                            rotation: normalizeHeroRotation(crop.rotation - 90),
                          }));
                        }}
                        className="prism-liana-outline-button flex-1 rounded-full px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
                      >
                        Rotate Left
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateActiveHeroCrop((crop) => ({
                            ...crop,
                            rotation: normalizeHeroRotation(crop.rotation + 90),
                          }));
                        }}
                        className="prism-liana-outline-button flex-1 rounded-full px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
                      >
                        Rotate Right
                      </button>
                    </div>
                  </div>
                </div>

                <div className="prism-liana-panel mt-5 rounded-2xl p-3">
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-[rgba(245,245,245,0.56)]">
                    Current crop
                  </p>
                  <p className="mt-2 font-mono text-sm text-sovereign-gold">
                    {formatObjectPosition(activeHeroCrop.x, activeHeroCrop.y)}
                  </p>
                  <p className="mt-1 font-mono text-sm text-sovereign-gold">
                    {formatHeroScale(activeHeroCrop.scale)}x
                  </p>
                  <p className="mt-1 font-mono text-sm text-sovereign-gold">
                    {formatHeroRotationLabel(activeHeroCrop.rotation)}
                  </p>
                </div>

                {isHeroConfigSnapshotVisible ? (
                  <Textarea
                    readOnly
                    value={heroPortraitConfigSnapshot}
                    className="mt-4 min-h-40 resize-y rounded-[1.5rem] border-[rgba(246,241,222,0.12)] bg-[rgba(255,255,255,0.03)] font-mono text-xs leading-6 text-[rgba(245,245,245,0.78)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_40px_rgba(0,0,0,0.14)]"
                  />
                ) : null}
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
                  className={`rounded-full px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] ${
                    isActive
                      ? "prism-liana-solid-button"
                      : "prism-liana-outline-button"
                  }`}
                >
                  {index + 1}. {option.label}
                </button>
              );
            })}
          </div>

          <div className="relative z-10 flex min-h-screen items-end px-8 py-20 md:px-16 lg:px-24">
            <div className="prism-liana-panel-strong max-w-5xl p-8 md:p-10 lg:p-12">
              {arrival.fromLabel ? (
                <FadeIn>
                  <div className="prism-liana-quote mb-10 max-w-2xl px-5 py-4 pl-6">
                    <p className="text-sm leading-7 text-[rgba(245,245,245,0.82)]">
                      Arriving from{" "}
                      <span className="font-semibold text-sovereign-gold">{arrival.fromLabel}</span>.
                      Your UUID has been carried forward so this realm can recognize your passage.
                    </p>
                  </div>
                </FadeIn>
              ) : null}

              <FadeIn delay={0.08}>
                <p
                  className="text-sm uppercase tracking-[0.32em] text-sovereign-gold"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Liana Camaras • Joyful Mystic
                </p>
              </FadeIn>

              <FadeIn delay={0.16}>
                <h1 className="mt-6 max-w-5xl font-display text-5xl leading-[1.04] text-radiant-white sm:text-6xl md:text-7xl lg:text-8xl">
                  {LIANA_MEMBER_CONFIG.primaryHeadline}
                </h1>
              </FadeIn>

              <FadeIn delay={0.24}>
                <p className="mt-8 max-w-3xl text-xl leading-9 text-[rgba(245,245,245,0.8)]">
                  {LIANA_MEMBER_CONFIG.subheadline}
                </p>
              </FadeIn>

              <FadeIn delay={0.32}>
                <p className="mt-6 max-w-3xl text-lg leading-9 text-[rgba(245,245,245,0.66)]">
                  {LIANA_MEMBER_CONFIG.arrivalBody}
                </p>
              </FadeIn>

              <FadeIn delay={0.4}>
                <div className="prism-liana-quote mt-10 max-w-3xl px-6 py-6 pl-8">
                  <p className="text-xl leading-9 text-[rgba(245,245,245,0.82)]">
                    {LIANA_MEMBER_CONFIG.activationMessage}
                  </p>
                </div>
              </FadeIn>

              <FadeIn delay={0.48}>
                <div className="mt-10 flex flex-wrap gap-4">
                  <Button
                    size="lg"
                    variant="prism"
                    onClick={() => scrollToSection("origin")}
                    className="rounded-full px-7 text-[0.82rem] font-semibold uppercase tracking-[0.2em]"
                  >
                    Begin Your Lunar Journey
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    size="lg"
                    variant="prismOutline"
                    onClick={() => scrollToSection("artifacts")}
                    className="rounded-full px-7 text-[0.82rem] font-semibold uppercase tracking-[0.2em]"
                  >
                    Explore The Artifacts
                  </Button>
                </div>
              </FadeIn>

              <FadeIn delay={0.56}>
                <div className="mt-10 grid gap-3 text-sm text-[rgba(245,245,245,0.58)] sm:grid-cols-3">
                  <p className="prism-liana-chip px-4 py-3">Realm: {LIANA_MEMBER_CONFIG.realmId}</p>
                  <p className="prism-liana-chip px-4 py-3">UUID: {uuid || "Resolving"}</p>
                  <p className="prism-liana-chip px-4 py-3">Mode: portal-aware, ledger-ready</p>
                </div>
              </FadeIn>

              <FadeIn delay={0.64}>
                <div className="mt-14 flex items-center gap-4">
                  <div className="h-px w-16 bg-sovereign-gold/50" />
                  <p
                    className="text-sm uppercase tracking-[0.24em] text-[rgba(245,245,245,0.58)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Scroll through the eclipse
                  </p>
                </div>
              </FadeIn>
            </div>
          </div>
        </section>

        <SectionDivider />

        <section id="origin" className="relative overflow-hidden">
          <div className={sectionShellClass}>
            <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <FadeIn>
                <EditorialImage
                  path={LIANA_MEMBER_CONFIG.assets.originPortrait}
                  alt="Liana standing before a storm with her fist raised"
                  eyebrow="Origin wound"
                />
              </FadeIn>

              <div>
                <FadeIn>
                  <p
                    className="text-sm uppercase tracking-[0.28em] text-sovereign-gold"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    The Shadow Tides
                  </p>
                </FadeIn>

                <FadeIn delay={0.08}>
                  <h2 className="mt-5 font-display text-4xl leading-tight text-radiant-white sm:text-5xl md:text-6xl">
                    {LIANA_MEMBER_CONFIG.originHeadline}
                  </h2>
                </FadeIn>

                <FadeIn delay={0.16}>
                  <p className="mt-8 max-w-3xl text-lg leading-9 text-[rgba(245,245,245,0.78)]">
                    {LIANA_MEMBER_CONFIG.originBody}
                  </p>
                </FadeIn>

                <div className="mt-12 space-y-7">
                  {LIANA_MEMBER_CONFIG.originMoments.map((moment, index) => (
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
                        className="prism-liana-panel block w-full px-6 py-5 text-left transition-transform hover:-translate-y-0.5"
                      >
                        <p className="text-sm uppercase tracking-[0.2em] text-sovereign-gold">
                          {moment.label}
                        </p>
                        <p className="mt-2 text-base leading-8 text-[rgba(245,245,245,0.7)]">
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
          <div className={sectionShellClass}>
            <FadeIn>
              <p
                className="text-sm uppercase tracking-[0.28em] text-sovereign-gold"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                The Forge Of Artifacts
              </p>
            </FadeIn>

            <FadeIn delay={0.08}>
              <h2 className="mt-5 max-w-4xl font-display text-4xl leading-tight text-radiant-white sm:text-5xl md:text-6xl">
                Five authored thresholds for turning shadow into coherent joy.
              </h2>
            </FadeIn>

            <FadeIn delay={0.16}>
              <p className="mt-8 max-w-3xl text-lg leading-9 text-[rgba(245,245,245,0.74)]">
                Each artifact is a lightweight ritual, not a gimmick. Move it, reflect with it, and let it answer with a more coherent reading of your threshold.
              </p>
            </FadeIn>

            <div className="mt-12 grid gap-4">
              {LIANA_MEMBER_CONFIG.artifacts.map((artifact, index) => (
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
          <div className={sectionShellClass}>
            <div className="grid gap-16 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <FadeIn>
                  <p
                    className="text-sm uppercase tracking-[0.28em] text-sovereign-gold"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Wellsprings
                  </p>
                </FadeIn>

                <FadeIn delay={0.08}>
                  <h2 className="mt-5 max-w-3xl font-display text-4xl leading-tight text-radiant-white sm:text-5xl">
                    Books and teachings underneath the lunar forge.
                  </h2>
                </FadeIn>

                <div className="mt-12 space-y-3">
                  {LIANA_MEMBER_CONFIG.influences.map((influence, index) => (
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
                        className="prism-liana-panel block w-full px-5 py-5 text-left transition-transform hover:-translate-y-0.5"
                      >
                        <p className="text-sm uppercase tracking-[0.2em] text-[rgba(245,245,245,0.54)]">
                          {influence.author}
                        </p>
                        <h3 className="mt-2 font-display text-3xl text-radiant-white">
                          {influence.title}
                        </h3>
                        <p className="mt-3 max-w-xl text-base leading-8 text-[rgba(245,245,245,0.68)]">
                          {influence.body}
                        </p>
                      </button>
                    </FadeIn>
                  ))}
                </div>
              </div>

              <FadeIn delay={0.18}>
                <div className="prism-liana-panel h-full px-8 py-8 pl-10">
                  <p
                    className="text-sm uppercase tracking-[0.24em] text-[rgba(245,245,245,0.56)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Liana's reflection
                  </p>
                  <h3 className="mt-6 font-display text-4xl text-radiant-white sm:text-5xl">
                    {activeInfluence?.title}
                  </h3>
                  <p className="mt-3 text-sm uppercase tracking-[0.22em] text-sovereign-gold">
                    {activeInfluence?.author}
                  </p>
                  <p className="mt-8 max-w-2xl text-xl leading-10 text-[rgba(245,245,245,0.8)]">
                    {activeInfluence?.reflection}
                  </p>
                </div>
              </FadeIn>
            </div>
          </div>
        </section>

        <SectionDivider />

        <section id="prism" className="relative overflow-hidden">
          <div className={sectionShellClass}>
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
                Prism Simulator: tune your coherence.
              </h2>
            </FadeIn>

            <FadeIn delay={0.16}>
              <p className="mt-8 max-w-3xl text-lg leading-9 text-[rgba(245,245,245,0.72)]">
                Query authored prompts for guidance on burnout, relational truth, unity, and contribution. Prism here is a demo of Liana's interpretive lens, not a black-box oracle.
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
          <div className={sectionShellClass}>
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
          <div className={sectionShellClass}>
            <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <FadeIn>
                <EditorialImage
                  path={LIANA_MEMBER_CONFIG.assets.ascensionPortrait}
                  alt="Liana barefoot on river stones with her arms raised in the mountains"
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
                    Ascend to coherent joy.
                  </h2>
                </FadeIn>

                <FadeIn delay={0.16}>
                  <div className="prism-liana-quote mt-8 px-6 py-6 pl-8">
                    <p className="text-xl leading-10 text-[rgba(245,245,245,0.82)]">
                      {LIANA_MEMBER_CONFIG.ascensionQuote}
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
          <div className={sectionShellClass}>
            <FadeIn>
              <p
                className="text-sm uppercase tracking-[0.28em] text-sovereign-gold"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Portals Beyond The Eclipse
              </p>
            </FadeIn>

            <FadeIn delay={0.08}>
              <h2 className="mt-5 max-w-4xl font-display text-4xl leading-tight text-radiant-white sm:text-5xl md:text-6xl">
                Continue into allied realms without dropping identity state.
              </h2>
            </FadeIn>

            <FadeIn delay={0.16}>
              <p className="mt-8 max-w-3xl text-lg leading-9 text-[rgba(245,245,245,0.72)]">
                These crossings preserve Liana's realm ID and the current UUID so movement through the broader ecosystem can be tracked as one continuous passage.
              </p>
            </FadeIn>

            <div className="mt-12">
              <FadeIn delay={0.24}>
                <PortalGrid
                  portals={LIANA_PORTALS}
                  onPortalClick={async (portal, payload) => {
                    await handleEvent(payload);
                    const destination = buildPortalUrl(portal.destinationUrl, uuid, portal.destinationRealm);
                    window.location.assign(destination);
                  }}
                />
              </FadeIn>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 pb-20 pt-10">
        <div className={footerShellClass}>
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
              Presence is the practice beneath the joy.
            </h2>
          </FadeIn>

          <FadeIn delay={0.16}>
            <p className="mt-6 max-w-3xl text-lg leading-9 text-[rgba(245,245,245,0.72)]">
              The Coherence Eclipse is designed to feel like an initiatory threshold rather than a software panel. Story leads, the body verifies, and structure follows close behind.
            </p>
          </FadeIn>

          <FadeIn delay={0.24}>
            <div className="mt-10 flex flex-wrap gap-4">
              <Button
                size="lg"
                variant="prismOutline"
                className="rounded-full px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-sovereign-gold"
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
                variant="prism"
                onClick={() => scrollToSection("arrival")}
                className="rounded-full px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em]"
              >
                Return To Top
                <ArrowUpRight className="size-4" />
              </Button>
            </div>
          </FadeIn>

          <FadeIn delay={0.32}>
            <p className="mt-10 text-sm leading-7 text-[rgba(245,245,245,0.52)]">
              © 2026 Liana Camaras. Placeholder media and narration are in place pending final production assets.
            </p>
          </FadeIn>
        </div>
      </footer>
    </div>
  );
}
