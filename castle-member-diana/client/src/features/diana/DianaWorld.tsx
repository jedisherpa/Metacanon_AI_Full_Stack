import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  BookOpenText,
  Download,
  Menu,
  RefreshCcw,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import {
  type ReactNode,
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import { ArtifactDialog } from "./components/ArtifactDialog";
import { DraggableCollageCanvas } from "./components/DraggableCollageCanvas";
import { PortalGrid } from "./components/PortalGrid";
import { SovereignWall } from "./components/SovereignWall";
import { DIANA_MEMBER_CONFIG } from "./config/member";
import { DIANA_PORTALS } from "./config/portals";
import { resolveArtifactResult, resolvePrismPrompt } from "./logic";
import { DIANA_PRE_EDITORIAL_IMAGE_SNAPSHOT } from "../../../../reference/snapshots/diana-pre-editorial-image-swap";
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
import {
  getNextCollageViewId,
  resolveLandingWindowId,
} from "./shell";
import type {
  ArrivalContext,
  CollageCardDefinition,
  CollageViewDefinition,
  DesktopNavItem,
  FooterQuickLinkDefinition,
  InfluenceDefinition,
  LandingWindowViewId,
  SovereignBadge,
  SovereignEventPayload,
  WallEntry,
} from "./types";

const IMAGE_SET_STORAGE_KEY = "diana:landing:image-set";

function cloneCollageViews(views: readonly CollageViewDefinition[]): CollageViewDefinition[] {
  return views.map((view) => ({
    ...view,
    cards: view.cards.map((card) => ({
      ...card,
      desktop: { ...card.desktop },
      mobile: { ...card.mobile },
    })) as CollageCardDefinition[],
  }));
}

const IMAGE_SETS = {
  original: {
    label: "Original",
    collageViews: cloneCollageViews(
      DIANA_PRE_EDITORIAL_IMAGE_SNAPSHOT.collageViews as unknown as readonly CollageViewDefinition[]
    ),
  },
  editorial: {
    label: "New",
    collageViews: cloneCollageViews(
      DIANA_MEMBER_CONFIG.collageViews as readonly CollageViewDefinition[]
    ),
  },
} as const;

type ImageSetId = keyof typeof IMAGE_SETS;

function prettifyToken(value: string | null) {
  if (!value) {
    return null;
  }

  return value.replace(/[-_]/g, " ");
}

function resolveFooterActionUrl(action: FooterQuickLinkDefinition) {
  switch (action.id) {
    case "download-prism":
      return import.meta.env.VITE_PRISM_DOWNLOAD_URL || action.url;
    case "sign-ddos":
      return import.meta.env.VITE_DDOS_SIGN_URL || action.url;
    case "read-constitution":
      return import.meta.env.VITE_CONSTITUTION_URL || action.url;
    default:
      return action.url;
  }
}

function BadgeNotification({ badge }: { badge: SovereignBadge | null }) {
  return (
    <AnimatePresence>
      {badge ? (
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -18 }}
          className="editorial-badge fixed right-4 top-[4.5rem] z-50 max-w-sm rounded-[1.3rem] px-5 py-4 shadow-[0_24px_60px_rgba(17,17,17,0.12)] sm:right-6"
          role="status"
          aria-live="polite"
        >
          <p className="font-[var(--font-ui)] text-[10px] uppercase tracking-[0.28em] text-black/48">
            Badge earned
          </p>
          <h3 className="mt-2 font-display text-3xl leading-none text-black">{badge.title}</h3>
          <p className="editorial-copy mt-3 text-sm leading-7">{badge.description}</p>
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
    <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr]">
      <div>
        <p className="editorial-label">Prism simulator</p>
        <h3 className="mt-4 font-display text-4xl leading-[1.02] text-black sm:text-5xl">
          A lens set for grief, ferocity, and re-selfing.
        </h3>
        <p className="editorial-copy mt-5 max-w-xl text-[1.02rem] leading-8">
          These prompts are authored from Diana&apos;s source material. They remain
          the same Diana lens set as before, only reframed inside this editorial
          shell.
        </p>

        <div className="editorial-rule mt-8 border-y">
          {DIANA_MEMBER_CONFIG.prismPairs.map((pair) => (
            <button
              key={pair.prompt}
              type="button"
              onClick={() => {
                setPrompt(pair.prompt);
                setResponse(pair);
              }}
              className="editorial-rule w-full border-t px-0 py-4 text-left first:border-t-0 transition-colors hover:bg-black/[0.02]"
            >
              <p className="editorial-copy text-[0.98rem] leading-8">{pair.prompt}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="editorial-inset rounded-[1.7rem] p-5 sm:p-6">
        <label className="editorial-label">Ask Prism</label>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="What fragment wants to come back into coherence?"
          className="mt-4 min-h-36 rounded-[1.4rem] border-black/10 bg-white/90 text-black placeholder:text-black/35"
        />

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={() => setResponse(resolvePrismPrompt(prompt))}
            className="rounded-full bg-black px-6 text-[0.74rem] uppercase tracking-[0.24em] text-white hover:bg-black/88"
          >
            Simulate response
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full border-black/12 bg-white px-6 text-[0.74rem] uppercase tracking-[0.24em] text-black hover:bg-black/[0.03]"
            onClick={() => {
              void onEvent({
                eventType: "prism_cta",
                metadata: {
                  destination: import.meta.env.VITE_PRISM_DOWNLOAD_URL,
                },
              });

              window.open(
                import.meta.env.VITE_PRISM_DOWNLOAD_URL || "https://metacanonai.com/prism",
                "_blank",
                "noopener,noreferrer"
              );
            }}
          >
            <Download className="size-4" />
            Download Prism
          </Button>
        </div>

        <div className="editorial-rule mt-8 border-t pt-5">
          <p className="editorial-label">Response</p>
          <h4 className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-black/56">
            {response.prompt}
          </h4>
          <p className="editorial-copy mt-4 text-[1rem] leading-8">{response.response}</p>
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
      url:
        import.meta.env.VITE_CONSTITUTION_URL ||
        "https://metacanonai.com/constitution",
    },
  ];

  return (
    <div className="editorial-rule border-y">
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <article
            key={action.id}
            className="editorial-rule grid gap-5 border-t py-7 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div>
              <div className="flex items-center gap-3">
                <Icon className="size-5 text-black/68" />
                <h4 className="font-display text-3xl text-black">{action.title}</h4>
              </div>
              <p className="editorial-copy mt-3 max-w-2xl text-[0.98rem] leading-8">
                {action.body}
              </p>
            </div>

            <Button
              size="lg"
              variant="outline"
              className="rounded-full border-black/12 bg-white px-6 text-[0.74rem] uppercase tracking-[0.24em] text-black hover:bg-black/[0.03]"
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

function LandingWindow({
  navItem,
  uuid,
  arrival,
  children,
}: {
  navItem: DesktopNavItem;
  uuid: string;
  arrival: ArrivalContext;
  children: ReactNode;
}) {
  return (
    <section className="editorial-window relative flex h-full flex-col overflow-hidden rounded-[2rem]">
      <div className="editorial-window-bar flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="editorial-os-dot bg-[#ff5f56]" />
          <span className="editorial-os-dot bg-[#ffbd2e]" />
          <span className="editorial-os-dot bg-[#27c93f]" />
        </div>

        <div className="min-w-0 text-center">
          <p className="font-[var(--font-ui)] text-[10px] uppercase tracking-[0.28em] text-black/48">
            {DIANA_MEMBER_CONFIG.brandName}
          </p>
          <p className="hidden truncate font-[var(--font-ui)] text-[10px] uppercase tracking-[0.22em] text-black/38 sm:block">
            {navItem.label}
          </p>
        </div>

        <div className="hidden font-[var(--font-ui)] text-[10px] uppercase tracking-[0.22em] text-black/38 sm:block">
          {arrival.fromLabel ? `via ${arrival.fromLabel}` : uuid ? `uuid ${uuid}` : "landing"}
        </div>
      </div>

      <div className="overflow-y-auto px-5 pb-8 pt-5 sm:px-7 sm:pb-9 sm:pt-6">
        <p className="editorial-label">{navItem.label}</p>
        <h2 className="mt-4 max-w-3xl font-display text-4xl leading-[1.02] text-black sm:text-5xl">
          {navItem.title}
        </h2>
        <p className="editorial-copy mt-4 max-w-3xl text-[1.02rem] leading-8">
          {navItem.subtitle}
        </p>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export function DianaWorld() {
  const [activeImageSetId, setActiveImageSetId] = useState<ImageSetId>(() => {
    if (typeof window === "undefined") {
      return "editorial";
    }

    const stored = window.localStorage.getItem(IMAGE_SET_STORAGE_KEY);
    return stored === "original" ? "original" : "editorial";
  });
  const [arrival, setArrival] = useState<ArrivalContext>({
    fromRealm: null,
    fromLabel: null,
    incomingUuid: null,
    heldArtifact: null,
    quest: null,
  });
  const [uuid, setUuid] = useState("");
  const [badge, setBadge] = useState<SovereignBadge | null>(null);
  const [activeView, setActiveView] = useState<LandingWindowViewId>("origin");
  const [activeCollageViewId, setActiveCollageViewId] = useState(
    IMAGE_SETS.editorial.collageViews[0]?.id ?? ""
  );
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = DIANA_MEMBER_CONFIG.desktopNavItems;
  const activeImageSet = IMAGE_SETS[activeImageSetId];
  const activeNavItem =
    navItems.find((item) => item.id === activeView) ?? navItems[0];
  const activeCollageView =
    activeImageSet.collageViews.find((view) => view.id === activeCollageViewId) ??
    activeImageSet.collageViews[0];

  const arrivalThreads = useMemo(() => {
    const threads = [];

    if (arrival.fromLabel) {
      threads.push(
        `Arriving from ${arrival.fromLabel}. Your UUID has been carried forward so this landing shell can recognize your passage.`
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
    setMeta("meta[property=\"og:title\"]", "property", "og:title", DIANA_MEMBER_CONFIG.pageTitle);
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
    window.localStorage.setItem(IMAGE_SET_STORAGE_KEY, activeImageSetId);
  }, [activeImageSetId]);

  useEffect(() => {
    if (
      activeImageSet.collageViews.some((view) => view.id === activeCollageViewId)
    ) {
      return;
    }

    setActiveCollageViewId(activeImageSet.collageViews[0]?.id ?? "");
  }, [activeCollageViewId, activeImageSet]);

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

  const openView = (nextId: string) => {
    const resolvedId = resolveLandingWindowId(nextId, navItems, navItems[0].id);

    setActiveView(resolvedId);
    setIsMobileMenuOpen(false);
    void handleEvent({
      eventType: "story_interact",
      metadata: {
        section: "landing-shell",
        interaction: "nav_select",
        viewId: resolvedId,
      },
    });
  };

  const cycleCollageView = () => {
    const nextId = getNextCollageViewId(
      activeImageSet.collageViews,
      activeCollageViewId
    );

    setActiveCollageViewId(nextId);
    void handleEvent({
      eventType: "story_interact",
      metadata: {
        section: "landing-shell",
        interaction: "collage_refresh",
        collageViewId: nextId,
      },
    });
  };

  const switchImageSet = (nextId: ImageSetId) => {
    if (nextId === activeImageSetId) {
      return;
    }

    setActiveImageSetId(nextId);
    setIsMobileMenuOpen(false);
    void handleEvent({
      eventType: "story_interact",
      metadata: {
        section: "landing-shell",
        interaction: "image_set_toggle",
        imageSetId: nextId,
      },
    });
  };

  const handleFooterAction = (action: FooterQuickLinkDefinition) => {
    const url = resolveFooterActionUrl(action);

    void handleEvent({
      eventType: action.eventType,
      metadata: {
        destination: url,
        ...(action.metadata ?? {}),
      },
    });

    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="relative h-screen overflow-hidden bg-background text-foreground">
      <BadgeNotification badge={badge} />

      <header className="editorial-menu-shell fixed inset-x-0 top-0 z-40 h-14 border-b px-4 sm:px-6">
        <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-display text-[1.45rem] italic text-black">
              {DIANA_MEMBER_CONFIG.brandName}
            </p>
          </div>

          <nav className="hidden items-center gap-2 lg:flex">
            {navItems.map((item) => {
              const isActive = item.id === activeView;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openView(item.id)}
                  className={`rounded-full px-4 py-2 font-display text-[1.08rem] italic transition ${
                    isActive
                      ? "bg-black text-white shadow-[0_14px_30px_rgba(15,15,15,0.12)]"
                      : "text-black/62 hover:bg-black/[0.04] hover:text-black"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-full border border-black/10 bg-white p-1 md:flex">
              {(Object.entries(IMAGE_SETS) as Array<[ImageSetId, (typeof IMAGE_SETS)[ImageSetId]]>).map(
                ([imageSetId, imageSet]) => {
                  const isActive = imageSetId === activeImageSetId;

                  return (
                    <button
                      key={imageSetId}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => switchImageSet(imageSetId)}
                      className={`rounded-full px-3 py-2 font-[var(--font-ui)] text-[10px] uppercase tracking-[0.24em] transition ${
                        isActive
                          ? "bg-black text-white"
                          : "text-black/58 hover:bg-black/[0.04] hover:text-black"
                      }`}
                    >
                      {imageSet.label}
                    </button>
                  );
                }
              )}
            </div>

            <button
              type="button"
              onClick={cycleCollageView}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 font-[var(--font-ui)] text-[10px] uppercase tracking-[0.28em] text-black/62 transition hover:bg-black/[0.03] hover:text-black"
            >
              <RefreshCcw className="size-3.5" />
              refresh.
            </button>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 font-[var(--font-ui)] text-[10px] uppercase tracking-[0.28em] text-black/62 transition hover:bg-black/[0.03] hover:text-black lg:hidden"
            >
              {isMobileMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
              menu
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isMobileMenuOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="editorial-mobile-menu fixed inset-x-4 top-[4.5rem] z-[45] rounded-[1.8rem] p-4 shadow-[0_24px_60px_rgba(15,15,15,0.12)] lg:hidden"
          >
            <div className="mb-4 flex items-center gap-1 rounded-full border border-black/10 bg-white p-1">
              {(Object.entries(IMAGE_SETS) as Array<[ImageSetId, (typeof IMAGE_SETS)[ImageSetId]]>).map(
                ([imageSetId, imageSet]) => {
                  const isActive = imageSetId === activeImageSetId;

                  return (
                    <button
                      key={imageSetId}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => switchImageSet(imageSetId)}
                      className={`flex-1 rounded-full px-3 py-2 font-[var(--font-ui)] text-[10px] uppercase tracking-[0.24em] transition ${
                        isActive
                          ? "bg-black text-white"
                          : "text-black/58 hover:bg-black/[0.04] hover:text-black"
                      }`}
                    >
                      {imageSet.label}
                    </button>
                  );
                }
              )}
            </div>

            <div className="space-y-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openView(item.id)}
                  className={`w-full rounded-[1.2rem] px-4 py-3 text-left transition ${
                    item.id === activeView
                      ? "bg-black text-white"
                      : "bg-black/[0.03] text-black hover:bg-black/[0.06]"
                  }`}
                  >
                    <p className="font-display text-2xl italic">{item.label}</p>
                    <p className="mt-1 font-[var(--font-ui)] text-[10px] uppercase tracking-[0.22em] text-black/62">
                      {item.subtitle}
                    </p>
                  </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main className="relative h-full px-3 pb-24 pt-18 sm:px-5 sm:pb-26">
        <div className="mx-auto h-full max-w-[1280px]">
          <div className="editorial-canvas-shell relative h-full overflow-hidden rounded-[2.2rem]">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(246,244,239,0.92)),radial-gradient(circle_at_top_right,rgba(17,17,17,0.06),transparent_34%)]" />
            {activeCollageView ? (
              <div className="absolute inset-0">
                <DraggableCollageCanvas view={activeCollageView} />
              </div>
            ) : null}

            <div className="absolute inset-x-3 bottom-3 top-3 sm:inset-x-auto sm:bottom-4 sm:left-4 sm:top-4 sm:w-[min(43rem,calc(100vw-10rem))]">
              <LandingWindow navItem={activeNavItem} uuid={uuid} arrival={arrival}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeView}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.24, ease: "easeOut" }}
                    className="space-y-8"
                  >
                    {activeView === "origin" ? (
                      <>
                        {arrivalThreads.length > 0 ? (
                          <div className="editorial-inset rounded-[1.5rem] p-4 sm:p-5">
                            {arrivalThreads.map((thread) => (
                              <p key={thread} className="editorial-copy text-[0.98rem] leading-8">
                                {thread}
                              </p>
                            ))}
                          </div>
                        ) : null}

                        <div className="space-y-5">
                          <h3 className="font-display text-4xl leading-[1.02] text-black sm:text-5xl">
                            {DIANA_MEMBER_CONFIG.primaryHeadline}
                          </h3>
                          <p className="editorial-copy text-[1.02rem] leading-8">
                            {DIANA_MEMBER_CONFIG.subheadline}
                          </p>
                          <div className="rounded-[0_1.5rem_1.5rem_0] border-l-2 border-black/12 pl-5">
                            <p className="editorial-copy text-[1rem] leading-8">
                              {DIANA_MEMBER_CONFIG.activationMessage}
                            </p>
                          </div>
                        </div>

                        <div className="editorial-rule border-y py-6">
                          <p className="editorial-copy text-[1rem] leading-8">
                            {DIANA_MEMBER_CONFIG.originBody}
                          </p>
                        </div>

                        <div className="space-y-4">
                          {DIANA_MEMBER_CONFIG.originMoments.map((moment) => (
                            <button
                              key={moment.id}
                              type="button"
                              onClick={() => {
                                void handleEvent({
                                  eventType: "story_interact",
                                  metadata: {
                                    storyMoment: moment.id,
                                  },
                                });
                              }}
                              className="editorial-inset block w-full rounded-[1.35rem] px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,15,15,0.06)] sm:px-5"
                            >
                              <p className="editorial-label">{moment.label}</p>
                              <p className="editorial-copy mt-3 text-[0.98rem] leading-8">
                                {moment.detail}
                              </p>
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button
                            size="lg"
                            onClick={() => openView("relics")}
                            className="rounded-full bg-black px-6 text-[0.74rem] uppercase tracking-[0.24em] text-white hover:bg-black/88"
                          >
                            Enter the relics
                          </Button>
                          <Button
                            size="lg"
                            variant="outline"
                            onClick={() => openView("prism")}
                            className="rounded-full border-black/12 bg-white px-6 text-[0.74rem] uppercase tracking-[0.24em] text-black hover:bg-black/[0.03]"
                          >
                            Open Prism
                          </Button>
                        </div>
                      </>
                    ) : null}

                    {activeView === "relics" ? (
                      <>
                        <p className="editorial-copy max-w-3xl text-[1rem] leading-8">
                          Each artifact is still grounded in Diana&apos;s actual themes:
                          performance, grief, ferocity, relational initiation, and the
                          rebuilding of story. The logic and outputs remain unchanged.
                        </p>
                        <div className="editorial-rule border-b">
                          {DIANA_MEMBER_CONFIG.artifacts.map((artifact) => (
                            <ArtifactDialog
                              key={artifact.id}
                              artifact={artifact}
                              onEvent={handleEvent}
                              onResolve={resolveArtifactResult}
                            />
                          ))}
                        </div>
                      </>
                    ) : null}

                    {activeView === "lineage" ? (
                      <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
                        <div className="editorial-rule border-y">
                          {DIANA_MEMBER_CONFIG.influences.map((influence) => (
                            <button
                              key={influence.id}
                              type="button"
                              onClick={() => {
                                setActiveInfluence(influence);
                                void handleEvent({
                                  eventType: "influence_click",
                                  metadata: {
                                    influenceId: influence.id,
                                  },
                                });
                              }}
                              className="editorial-rule block w-full border-t px-0 py-4 text-left first:border-t-0 transition-colors hover:bg-black/[0.02]"
                            >
                              <p className="editorial-label">{influence.author}</p>
                              <h3 className="mt-2 font-display text-3xl text-black">
                                {influence.title}
                              </h3>
                              <p className="editorial-copy mt-3 text-[0.98rem] leading-8">
                                {influence.body}
                              </p>
                            </button>
                          ))}
                        </div>

                        <div className="editorial-inset rounded-[1.7rem] p-5 sm:p-6">
                          <p className="editorial-label">Diana&apos;s reflection</p>
                          <h3 className="mt-4 font-display text-4xl leading-none text-black">
                            {activeInfluence?.title}
                          </h3>
                          <p className="mt-2 text-sm uppercase tracking-[0.22em] text-black/48">
                            {activeInfluence?.author}
                          </p>
                          <p className="editorial-copy mt-6 text-[1.04rem] leading-9">
                            {activeInfluence?.reflection}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {activeView === "prism" ? <PrismConsole onEvent={handleEvent} /> : null}

                    {activeView === "wall" ? (
                      <>
                        <p className="editorial-copy max-w-3xl text-[1rem] leading-8">
                          When the shared ledger is connected, this window updates from real
                          declaration activity rather than remaining only symbolic.
                        </p>
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
                      </>
                    ) : null}

                    {activeView === "ascend" ? (
                      <>
                        <div className="rounded-[0_1.5rem_1.5rem_0] border-l-2 border-black/12 pl-5">
                          <p className="font-display text-[2rem] leading-[1.12] text-black sm:text-[2.35rem]">
                            {DIANA_MEMBER_CONFIG.ascensionQuote}
                          </p>
                        </div>
                        <AscensionBlock onEvent={handleEvent} />
                      </>
                    ) : null}

                    {activeView === "portals" ? (
                      <>
                        <p className="editorial-copy max-w-3xl text-[1rem] leading-8">
                          These crossings still preserve Diana&apos;s realm ID and the
                          current UUID so passage through the wider ecosystem can remain one
                          continuous story instead of a disconnected set of visits.
                        </p>
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
                      </>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </LandingWindow>
            </div>
          </div>
        </div>
      </main>

      <footer className="editorial-footer-shell fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="editorial-copy max-w-3xl text-sm leading-7">
            {DIANA_MEMBER_CONFIG.footerLine}
          </p>

          <div className="flex flex-wrap gap-2">
            {DIANA_MEMBER_CONFIG.footerQuickLinks.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => handleFooterAction(action)}
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 font-[var(--font-ui)] text-[10px] uppercase tracking-[0.28em] text-black/62 transition hover:bg-black/[0.03] hover:text-black"
              >
                {action.label}
                <ArrowUpRight className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
