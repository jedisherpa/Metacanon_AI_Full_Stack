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
import { ANNA_MEMBER_CONFIG } from "./config/member";
import { ANNA_PORTALS } from "./config/portals";
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
  InfluenceDefinition,
  PrismPromptPair,
  SovereignBadge,
  SovereignEventPayload,
  WallEntry,
} from "./types";

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
    return ANNA_MEMBER_CONFIG.prismPairs[0];
  }

  const best = [...ANNA_MEMBER_CONFIG.prismPairs].sort(
    (a, b) => scorePrismPair(b, input) - scorePrismPair(a, input)
  )[0];

  if (!best || scorePrismPair(best, input) === 0) {
    return {
      prompt: input,
      response:
        "Anna lens response: slow down long enough to distinguish signal from urgency. The next coherent move usually arrives after the performance layer drops.",
    };
  }

  return best;
}

function resolveArtifactResult(
  artifact: ArtifactDefinition,
  input: string,
  gestureProgress: number
): ArtifactResult {
  const cleaned = input.trim() || "the unnamed threshold";

  switch (artifact.id) {
    case "cosmic-scroll":
      return {
        heading: "Treasure hidden inside the pattern",
        body: `When you name "${cleaned}," the scroll answers with a different reading: this pattern is not proof that you are broken. It is proof that a former strategy is outliving the season it was built for.`,
        bullets: [
          "Replace over-control with one act of deliberate surrender this week.",
          "Track where your body braces before your language does.",
          "Let synchronicity guide one decision you would normally over-design.",
        ],
      };
    case "authority-mirror":
      return {
        heading: "Mirror reading",
        body: `The mirror does not accuse you. It shows where the prompt "${cleaned}" is asking for borrowed certainty instead of lived authorship.`,
        bullets: [
          "Name the authority you have outsourced in this situation.",
          "Bring one hidden fear into explicit language before you act.",
          "Ask what presence would choose here if performance were no longer driving.",
        ],
      };
    case "chosen-crucible":
      return {
        heading: "Relational repair path",
        body: `The crucible reads "${cleaned}" as material for covenant, not catastrophe. Repair begins where the pattern stops needing a villain to justify itself.`,
        bullets: [
          "State the wound without making it the whole identity of the other person.",
          "Ask what truth has been avoided because harmony felt safer.",
          "Build the next agreement around clarity, not mood.",
        ],
      };
    case "phoenix-wing":
      return {
        heading: "Wing vision unlocked",
        body: `At ${Math.round(gestureProgress * 100)}% reveal, the wing answers with a mandate: stop waiting for certainty to bless your next responsibility. Move because the call is already clear enough.`,
        bullets: [
          "Protect one practice that keeps you in prayerful authorship.",
          "Let your next public action say what your old strategy could not.",
          "Choose coherence over impressiveness in the next threshold you enter.",
        ],
      };
    case "reselfing-codex": {
      const downloadableText = [
        "Anna's Phoenix Covenant Blueprint",
        "",
        `Source fragment: ${cleaned}`,
        "",
        "Blueprint",
        "1. Name the wound without making it your throne.",
        "2. Identify the pattern that once kept you safe but now leaks authority.",
        "3. Write the covenant that replaces self-protection with coherent responsibility.",
        "4. Define the next visible act that proves the new structure is real.",
      ].join("\n");

      return {
        heading: "Re-selfing blueprint",
        body: `The codex turns "${cleaned}" into a sovereignty map. Instead of asking who you used to be, it asks what structure must exist so your next chapter can hold truth under pressure.`,
        bullets: [
          "Wound: what pain still asks to be governed with tenderness.",
          "Threshold: what old survival move no longer deserves command authority.",
          "Mandate: the practice, container, or relationship form that must now be built.",
        ],
        downloadableText,
        downloadableFileName: "anna-phoenix-covenant-blueprint.pdf",
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
      <div className="relative overflow-hidden border border-white/10 bg-[linear-gradient(160deg,rgba(201,168,76,0.14),rgba(139,30,63,0.12),rgba(7,25,32,0.88))]">
        <div className="p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[rgba(245,245,245,0.6)]">
            {eyebrow}
          </p>
        </div>
        <div className="aspect-[4/5] w-full bg-[radial-gradient(circle_at_top,_rgba(201,168,76,0.28),_transparent_34%),linear-gradient(180deg,_rgba(139,30,63,0.2),_rgba(7,25,32,0.6))]" />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden border border-white/10 bg-black/20">
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
          className="fixed right-6 top-6 z-50 max-w-sm border border-sovereign-gold/35 bg-[rgba(7,25,32,0.94)] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-md"
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
      <div>
        <p
          className="text-sm uppercase tracking-[0.24em] text-sovereign-gold"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Prism simulator
        </p>
        <h3 className="mt-5 font-display text-4xl text-radiant-white sm:text-5xl">
          A curated lens set for reading the threshold.
        </h3>
        <p className="mt-5 max-w-xl text-lg leading-9 text-[rgba(245,245,245,0.74)]">
          This is not a live AI chat. It is an authored demonstration of how Anna
          interprets signal, power, relationship, and coherence under accelerated change.
        </p>

        <div className="mt-10 border-y border-white/10">
          {ANNA_MEMBER_CONFIG.prismPairs.map((pair, index) => (
            <button
              key={pair.prompt}
              onClick={() => {
                setPrompt(pair.prompt);
                setResponse(pair);
              }}
              className={`w-full border-t border-white/10 py-5 text-left first:border-t-0 ${
                index === 0 ? "" : ""
              }`}
            >
              <p className="text-base leading-8 text-[rgba(245,245,245,0.8)]">{pair.prompt}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="border-l border-white/10 pl-0 lg:pl-10">
        <label className="text-xs uppercase tracking-[0.22em] text-[rgba(245,245,245,0.64)]">
          Ask Prism
        </label>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="What is real, relevant, and trustworthy here?"
          className="mt-4 min-h-36 border-white/10 bg-transparent px-0 text-base text-radiant-white placeholder:text-[rgba(245,245,245,0.38)]"
        />

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={() => setResponse(resolvePrismPrompt(prompt))}
            className="rounded-full bg-sovereign-gold px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-[#071920] hover:bg-[rgba(201,168,76,0.92)]"
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
              <p className="mt-4 max-w-2xl text-base leading-8 text-[rgba(245,245,245,0.72)]">
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

export function AnnaWorld() {
  const [arrival, setArrival] = useState<ArrivalContext>({
    fromRealm: null,
    fromLabel: null,
    incomingUuid: null,
    heldArtifact: null,
    quest: null,
  });
  const [uuid, setUuid] = useState("");
  const [badge, setBadge] = useState<SovereignBadge | null>(null);
  const [wallEntries, setWallEntries] = useState<WallEntry[]>(
    ANNA_MEMBER_CONFIG.wallSeeds.map((label, index) => ({
      id: `seed-${index}`,
      label,
      subtitle: "Anchored in the sovereign covenant",
    }))
  );
  const [activeInfluence, setActiveInfluence] = useState<InfluenceDefinition | null>(
    ANNA_MEMBER_CONFIG.influences[0]
  );

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
    document.title = ANNA_MEMBER_CONFIG.pageTitle;

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
      ANNA_MEMBER_CONFIG.pageDescription
    );
    setMeta('meta[property="og:title"]', "property", "og:title", ANNA_MEMBER_CONFIG.pageTitle);
    setMeta(
      'meta[property="og:description"]',
      "property",
      "og:description",
      ANNA_MEMBER_CONFIG.pageDescription
    );
    setMeta('meta[property="og:image"]', "property", "og:image", "/anna/og-image.svg");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", ANNA_MEMBER_CONFIG.pageTitle);
    setMeta(
      'meta[name="twitter:description"]',
      "name",
      "twitter:description",
      ANNA_MEMBER_CONFIG.pageDescription
    );
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", "/anna/og-image.svg");
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
            <img
              src={ANNA_MEMBER_CONFIG.assets.heroPortrait}
              alt=""
              className="h-full w-full object-cover opacity-28"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/70" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-transparent to-background/80" />
          </div>

          <div className="relative z-10 flex min-h-screen items-end px-8 py-20 md:px-16 lg:px-24">
            <div className="max-w-5xl">
              {arrival.fromLabel ? (
                <FadeIn>
                  <div className="mb-10 max-w-2xl border-l-4 border-sovereign-gold bg-[rgba(201,168,76,0.06)] px-5 py-4">
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
                  Anna Margolis • Sovereign Signal
                </p>
              </FadeIn>

              <FadeIn delay={0.16}>
                <h1 className="mt-6 max-w-5xl font-display text-5xl leading-[1.04] text-radiant-white sm:text-6xl md:text-7xl lg:text-8xl">
                  {ANNA_MEMBER_CONFIG.primaryHeadline}
                </h1>
              </FadeIn>

              <FadeIn delay={0.24}>
                <p className="mt-8 max-w-3xl text-xl leading-9 text-[rgba(245,245,245,0.8)]">
                  {ANNA_MEMBER_CONFIG.subheadline}
                </p>
              </FadeIn>

              <FadeIn delay={0.32}>
                <p className="mt-6 max-w-3xl text-lg leading-9 text-[rgba(245,245,245,0.66)]">
                  {ANNA_MEMBER_CONFIG.arrivalBody}
                </p>
              </FadeIn>

              <FadeIn delay={0.4}>
                <div className="mt-10 max-w-3xl border-l-4 border-sovereign-gold pl-6">
                  <p className="text-xl leading-9 text-[rgba(245,245,245,0.82)]">
                    {ANNA_MEMBER_CONFIG.activationMessage}
                  </p>
                </div>
              </FadeIn>

              <FadeIn delay={0.48}>
                <div className="mt-10 flex flex-wrap gap-4">
                  <Button
                    size="lg"
                    onClick={() => scrollToSection("origin")}
                    className="rounded-full bg-sovereign-gold px-7 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-[#071920] hover:bg-[rgba(201,168,76,0.92)]"
                  >
                    Read the story
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => scrollToSection("artifacts")}
                    className="rounded-full border-white/15 bg-transparent px-7 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-radiant-white"
                  >
                    Open the relics
                  </Button>
                </div>
              </FadeIn>

              <FadeIn delay={0.56}>
                <div className="mt-10 flex flex-wrap gap-8 text-sm text-[rgba(245,245,245,0.58)]">
                  <p>Realm: {ANNA_MEMBER_CONFIG.realmId}</p>
                  <p>UUID: {uuid || "Resolving"}</p>
                  <p>Mode: portal-aware, ledger-ready</p>
                </div>
              </FadeIn>

              <FadeIn delay={0.64}>
                <div className="mt-14 flex items-center gap-4">
                  <div className="h-px w-16 bg-sovereign-gold/50" />
                  <p
                    className="text-sm uppercase tracking-[0.24em] text-[rgba(245,245,245,0.58)]"
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
                  path={ANNA_MEMBER_CONFIG.assets.originPortrait}
                  alt="Anna by the creek"
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
                    {ANNA_MEMBER_CONFIG.originHeadline}
                  </h2>
                </FadeIn>

                <FadeIn delay={0.16}>
                  <p className="mt-8 max-w-3xl text-lg leading-9 text-[rgba(245,245,245,0.78)]">
                    {ANNA_MEMBER_CONFIG.originBody}
                  </p>
                </FadeIn>

                <div className="mt-12 space-y-7">
                  {ANNA_MEMBER_CONFIG.originMoments.map((moment, index) => (
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
                Five authored thresholds for moving from fracture into structure.
              </h2>
            </FadeIn>

            <FadeIn delay={0.16}>
              <p className="mt-8 max-w-3xl text-lg leading-9 text-[rgba(245,245,245,0.74)]">
                The point here is not spectacle. Each relic is deterministic, source-grounded, and
                designed to move the visitor through discernment rather than passive consumption.
              </p>
            </FadeIn>

            <div className="mt-12 border-b border-white/10">
              {ANNA_MEMBER_CONFIG.artifacts.map((artifact, index) => (
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
                    The books and lenses underneath the forge.
                  </h2>
                </FadeIn>

                <div className="mt-12 border-y border-white/10">
                  {ANNA_MEMBER_CONFIG.influences.map((influence, index) => (
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
                <div className="border-l-4 border-sovereign-gold pl-8">
                  <p
                    className="text-sm uppercase tracking-[0.24em] text-[rgba(245,245,245,0.56)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Anna's reflection
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
                A trustworthy interpreter of the times.
              </h2>
            </FadeIn>

            <FadeIn delay={0.16}>
              <p className="mt-8 max-w-3xl text-lg leading-9 text-[rgba(245,245,245,0.72)]">
                Anna's publication brief is clear: translate complexity into trustworthy clarity
                for people who want what is real, relevant, and usable.
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
                  path={ANNA_MEMBER_CONFIG.assets.ascensionPortrait}
                  alt="Anna portrait in white"
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
                    From ashes, rise into structured sovereignty.
                  </h2>
                </FadeIn>

                <FadeIn delay={0.16}>
                  <div className="mt-8 border-l-4 border-sovereign-gold pl-6">
                    <p className="text-xl leading-10 text-[rgba(245,245,245,0.82)]">
                      {ANNA_MEMBER_CONFIG.ascensionQuote}
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
                Continue into allied realms without dropping identity state.
              </h2>
            </FadeIn>

            <FadeIn delay={0.16}>
              <p className="mt-8 max-w-3xl text-lg leading-9 text-[rgba(245,245,245,0.72)]">
                These crossings preserve Anna's realm ID and the current UUID so movement through
                the broader ecosystem can be tracked as one continuous passage.
              </p>
            </FadeIn>

            <div className="mt-12">
              <FadeIn delay={0.24}>
                <PortalGrid
                  portals={ANNA_PORTALS}
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
              Presence is the price of your power.
            </h2>
          </FadeIn>

          <FadeIn delay={0.16}>
            <p className="mt-6 max-w-3xl text-lg leading-9 text-[rgba(245,245,245,0.72)]">
              Anna's Phoenix Covenant should feel like a threshold, not a software panel. This
              build is now moving in that direction: story first, signal first, structure close
              behind it.
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
                className="rounded-full bg-sovereign-gold px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-[#071920] hover:bg-[rgba(201,168,76,0.92)]"
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
