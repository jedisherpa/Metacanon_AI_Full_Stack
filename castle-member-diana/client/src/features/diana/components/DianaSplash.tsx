import { AnimatePresence, motion } from "framer-motion";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import { DIANA_MEMBER_CONFIG } from "../config/member";
import {
  flushQueuedEvents,
  getArrivalContext,
  getOrCreateSovereignUUID,
  logSovereignEvent,
} from "../lib/sovereign";
import { buildLandingPagePath } from "../shell";
import type { ArrivalContext } from "../types";

const EMPTY_ARRIVAL: ArrivalContext = {
  fromRealm: null,
  fromLabel: null,
  incomingUuid: null,
  heldArtifact: null,
  quest: null,
};

const FOLDER_POSITIONS = [
  "left-[10%] top-[20%]",
  "right-[14%] top-[28%]",
  "right-[20%] bottom-[18%]",
];

export function DianaSplash() {
  const [, navigate] = useLocation();
  const [arrival, setArrival] = useState<ArrivalContext>(EMPTY_ARRIVAL);
  const [typedCount, setTypedCount] = useState(0);
  const enteredRef = useRef(false);
  const arrivalRef = useRef<ArrivalContext>(EMPTY_ARRIVAL);
  const uuidRef = useRef("");

  const splashConfig = DIANA_MEMBER_CONFIG.splashScreen;
  const typewriterText = splashConfig.typewriterText.slice(0, typedCount);
  const arrivalMeta = useMemo(() => {
    const items = [];

    if (arrival.fromLabel) {
      items.push(`via ${arrival.fromLabel}`);
    }

    if (arrival.heldArtifact) {
      items.push(`artifact ${arrival.heldArtifact.replace(/[-_]/g, " ")}`);
    }

    if (arrival.quest) {
      items.push(`quest ${arrival.quest.replace(/[-_]/g, " ")}`);
    }

    return items.join(" · ");
  }, [arrival.fromLabel, arrival.heldArtifact, arrival.quest]);

  const enterLandingPage = useEffectEvent(() => {
    if (enteredRef.current) {
      return;
    }

    enteredRef.current = true;

    if (uuidRef.current) {
      void logSovereignEvent(
        {
          eventType: "story_interact",
          metadata: {
            section: "splash",
            interaction: "enter",
            pathname: window.location.pathname,
          },
        },
        arrivalRef.current,
        uuidRef.current
      );
    }

    navigate(buildLandingPagePath(window.location.search));
  });

  useEffect(() => {
    document.title = `${DIANA_MEMBER_CONFIG.brandName} | Threshold Entry`;

    const nextArrival = getArrivalContext(window.location.search);
    const nextUuid = getOrCreateSovereignUUID(nextArrival.incomingUuid);

    arrivalRef.current = nextArrival;
    uuidRef.current = nextUuid;
    setArrival(nextArrival);

    void flushQueuedEvents();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTypedCount((current) => {
        if (current >= splashConfig.typewriterText.length) {
          window.clearInterval(timer);
          return current;
        }

        return current + 1;
      });
    }, 26);

    return () => window.clearInterval(timer);
  }, [splashConfig.typewriterText.length]);

  useEffect(() => {
    const onKeyDown = () => {
      enterLandingPage();
    };
    const onClick = () => {
      enterLandingPage();
    };
    const onTouchStart = () => {
      enterLandingPage();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("click", onClick);
    window.addEventListener("touchstart", onTouchStart, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("click", onClick);
      window.removeEventListener("touchstart", onTouchStart);
    };
  }, [enterLandingPage]);

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(17,17,17,0.06),_transparent_34%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(245,243,238,0.95))]" />

      <div className="editorial-menu-bar absolute inset-x-0 top-0 z-20 hidden h-11 items-center px-5 md:flex">
        <div className="flex items-center gap-2">
          <span className="editorial-os-dot bg-[#ff5f56]" />
          <span className="editorial-os-dot bg-[#ffbd2e]" />
          <span className="editorial-os-dot bg-[#27c93f]" />
        </div>
        <div className="ml-5 flex items-center gap-5 font-[var(--font-ui)] text-[11px] uppercase tracking-[0.24em] text-black/55">
          <span>Finder</span>
          <span>Archive</span>
          <span>Window</span>
          <span>Threshold</span>
        </div>
      </div>

      {splashConfig.floatingFolders.map((folder, index) => (
        <motion.div
          key={folder}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 6 + index, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          className={`editorial-folder absolute ${FOLDER_POSITIONS[index] ?? FOLDER_POSITIONS[0]} z-10 hidden rounded-[18px] px-4 py-3 md:block`}
        >
          <p className="font-[var(--font-ui)] text-[11px] uppercase tracking-[0.26em] text-black/65">
            {folder}
          </p>
        </motion.div>
      ))}

      <main className="relative z-10 flex w-full items-center justify-center px-5 pb-10 pt-20 sm:px-8 md:px-14">
        <motion.section
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="editorial-mail-window w-full max-w-[74rem] overflow-hidden rounded-[2rem]"
        >
          <div className="border-b border-black/10 bg-black/[0.03] px-6 py-4">
            <div className="grid gap-2 font-[var(--font-ui)] text-[11px] uppercase tracking-[0.24em] text-black/58 sm:grid-cols-[90px_minmax(0,1fr)]">
              <span>From</span>
              <span>{splashConfig.fromLabel}</span>
              <span>To</span>
              <span>{splashConfig.toLabel}</span>
              <span>Subject</span>
              <span>{splashConfig.subjectLine}</span>
            </div>
          </div>

          <div className="grid gap-8 px-6 py-8 sm:px-8 sm:py-10 lg:grid-cols-[0.78fr_1.22fr] lg:px-10">
            <div className="editorial-letter rounded-[1.6rem] p-6 sm:p-8">
              <p className="font-[var(--font-ui)] text-[11px] uppercase tracking-[0.3em] text-black/55">
                Threshold Access
              </p>
              <h1 className="mt-5 font-display text-5xl leading-[0.94] text-black sm:text-6xl">
                {splashConfig.headline}
              </h1>
              <p className="mt-4 text-sm uppercase tracking-[0.28em] text-black/52">
                {splashConfig.realmLine}
              </p>

              <div className="editorial-rule mt-8 border-t pt-6">
                <p className="editorial-copy text-lg leading-8">
                  {DIANA_MEMBER_CONFIG.primaryHeadline}
                </p>
              </div>

              <p className="editorial-copy-soft mt-8 text-base leading-8">
                {DIANA_MEMBER_CONFIG.arrivalBody}
              </p>
            </div>

            <div className="flex flex-col justify-between gap-8">
              <div className="rounded-[1.8rem] border border-black/10 bg-white px-6 py-7 shadow-[0_24px_100px_rgba(15,15,15,0.08)] sm:px-8">
                <p className="font-[var(--font-ui)] text-[11px] uppercase tracking-[0.28em] text-black/55">
                  Opening line
                </p>
                <div className="mt-6 min-h-28 font-display text-3xl leading-[1.1] text-black sm:text-4xl">
                  {typewriterText}
                  <AnimatePresence initial={false}>
                    {typedCount < splashConfig.typewriterText.length ? (
                      <motion.span
                        key="caret"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="ml-1 inline-block h-[0.9em] w-[1px] bg-black align-middle"
                      />
                    ) : null}
                  </AnimatePresence>
                </div>

                <div className="editorial-rule mt-8 border-t pt-5">
                  <p className="editorial-copy text-base leading-8">
                    {DIANA_MEMBER_CONFIG.activationMessage}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-[var(--font-ui)] text-[11px] uppercase tracking-[0.28em] text-black/55">
                    Enter
                  </p>
                  <p className="mt-2 text-sm text-black/62">{splashConfig.instruction}</p>
                  {arrivalMeta ? (
                    <p className="mt-3 font-[var(--font-ui)] text-[11px] uppercase tracking-[0.22em] text-black/42">
                      {arrivalMeta}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    enterLandingPage();
                  }}
                  className="editorial-enter-button inline-flex items-center justify-center rounded-full px-6 py-3 font-[var(--font-ui)] text-[11px] uppercase tracking-[0.28em]"
                >
                  Enter Diana's world
                </button>
              </div>
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
