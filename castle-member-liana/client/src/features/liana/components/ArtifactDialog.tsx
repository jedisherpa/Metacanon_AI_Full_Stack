import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { Download, Headphones, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ArtifactDefinition,
  ArtifactResult,
  SovereignEventPayload,
} from "../types";

type ArtifactDialogProps = {
  artifact: ArtifactDefinition;
  onEvent: (payload: SovereignEventPayload) => void | Promise<void>;
  onResolve: (
    artifact: ArtifactDefinition,
    input: string,
    interactionProgress: number
  ) => ArtifactResult | null;
};

async function downloadPdf(title: string, result: ArtifactResult) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    unit: "pt",
    format: "letter",
  });

  doc.setFillColor("#090d1c");
  doc.rect(0, 0, 612, 792, "F");
  doc.setTextColor("#f6f1de");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(title, 52, 72);
  doc.setFontSize(15);
  doc.text(result.heading, 52, 112);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);

  const bodyLines = doc.splitTextToSize(result.body, 500);
  doc.text(bodyLines, 52, 146);

  let y = 182 + bodyLines.length * 14;
  result.bullets.forEach((bullet) => {
    const lines = doc.splitTextToSize(`• ${bullet}`, 490);
    doc.text(lines, 60, y);
    y += lines.length * 14 + 6;
  });

  doc.save(result.downloadableFileName ?? "coherence-blueprint.pdf");
}

const INTERACTION_COPY: Record<
  ArtifactDefinition["interactionType"],
  { label: string; hint: string }
> = {
  rotate: {
    label: "Rotate the orb",
    hint: "Each pass turns shadow toward illumination."
  },
  spin: {
    label: "Spin the staff",
    hint: "Build heat gradually until aliveness returns."
  },
  pulse: {
    label: "Pulse the wheel",
    hint: "Let the body answer before the mind explains."
  },
  open: {
    label: "Open the gate",
    hint: "Truth clears the threshold one honest action at a time."
  },
  walk: {
    label: "Walk the path",
    hint: "Advance the trail until a next chapter becomes visible."
  }
};

export function ArtifactDialog({
  artifact,
  onEvent,
  onResolve,
}: ArtifactDialogProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ArtifactResult | null>(null);
  const [interactionProgress, setInteractionProgress] = useState(0);
  const [isNarrating, setIsNarrating] = useState(false);
  const hasLoggedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (open && !hasLoggedRef.current) {
      hasLoggedRef.current = true;
      void onEvent({
        eventType: "artifact_click",
        artifactId: artifact.id,
        metadata: {
          artifactTitle: artifact.title,
          interactionType: artifact.interactionType,
        },
      });
    }

    if (!open) {
      hasLoggedRef.current = false;
      setInput("");
      setResult(null);
      setInteractionProgress(0);
      setIsNarrating(false);
      audioRef.current?.pause();
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
    }
  }, [artifact.id, artifact.interactionType, artifact.title, onEvent, open]);

  const readiness = useMemo(() => interactionProgress >= 0.68, [interactionProgress]);

  const resolveArtifact = () => {
    const nextResult = onResolve(artifact, input, interactionProgress);
    setResult(nextResult);
  };

  const advanceInteraction = () => {
    setInteractionProgress((current) =>
      Math.min(1, Number((current + 0.34).toFixed(2)))
    );
  };

  const toggleNarration = async () => {
    if (!artifact.audioSrc) {
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio(artifact.audioSrc);
      audioRef.current.addEventListener("ended", () => {
        setIsNarrating(false);
      });
    }

    if (isNarrating) {
      audioRef.current.pause();
      setIsNarrating(false);
      return;
    }

    try {
      await audioRef.current.play();
      setIsNarrating(true);
    } catch {
      setIsNarrating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <motion.button
          whileHover={{ x: 8 }}
          whileTap={{ scale: 0.995 }}
          className="prism-liana-panel group w-full px-6 py-8 text-left transition-colors hover:border-sovereign-gold/40"
        >
          <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-start">
            <div className="text-xs uppercase tracking-[0.28em] text-sovereign-gold">
              {artifact.realmToken}
            </div>
            <div className="space-y-3">
              <h3 className="font-display text-3xl text-radiant-white sm:text-4xl">
                {artifact.title}
              </h3>
              <p className="max-w-2xl text-base leading-8 text-[rgba(245,245,245,0.72)]">
                {artifact.body}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-sovereign-gold">
              Enter
              <Sparkles className="size-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </motion.button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl border-[rgba(214,179,95,0.22)] bg-[rgba(9,13,28,0.96)] p-0 text-radiant-white shadow-[0_30px_120px_rgba(0,0,0,0.45)] sm:max-w-4xl">
        <div className="space-y-8 p-8">
          <DialogHeader className="space-y-4 text-left">
            <div className="inline-flex w-fit rounded-full border border-[rgba(201,168,76,0.3)] bg-[rgba(201,168,76,0.08)] px-3 py-1 text-xs uppercase tracking-[0.22em] text-[rgba(245,245,245,0.82)]">
              {artifact.realmToken}
            </div>
            <DialogTitle className="font-display text-4xl">{artifact.headline}</DialogTitle>
            <DialogDescription className="max-w-2xl text-base leading-7 text-[rgba(245,245,245,0.72)]">
              {artifact.body}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm uppercase tracking-[0.2em] text-[rgba(245,245,245,0.72)]">
                <span>{INTERACTION_COPY[artifact.interactionType].label}</span>
                <span>{Math.round(interactionProgress * 100)}%</span>
              </div>
              <button
                type="button"
                onClick={advanceInteraction}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    advanceInteraction();
                  }
                }}
                className="prism-liana-panel relative block min-h-52 w-full p-6 text-left"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,rgba(214,179,95,0.34),rgba(83,183,176,0.08))] transition-all duration-500"
                  style={{ width: `${interactionProgress * 100}%` }}
                />
                <div className="relative flex h-full flex-col justify-between gap-6">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sovereign-gold/30 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.2em] text-sovereign-gold">
                    <Wand2 className="size-3.5" />
                    {artifact.interactionType}
                  </div>
                  <div>
                    <p className="max-w-xl text-xl leading-8 text-radiant-white">
                      {INTERACTION_COPY[artifact.interactionType].hint}
                    </p>
                    <p className="mt-4 text-sm leading-7 text-[rgba(245,245,245,0.68)]">
                      Click or press Enter to continue the motion. You can complete it in stages or reveal it all at once.
                    </p>
                  </div>
                </div>
              </button>
              <div className="flex flex-wrap gap-3">
                <Button
                  size="lg"
                  variant="prismOutline"
                  onClick={() => setInteractionProgress(1)}
                  className="rounded-full px-5 text-[0.78rem] font-semibold uppercase tracking-[0.2em]"
                >
                  Complete The Motion
                </Button>
                <Button
                  size="lg"
                  variant="prismOutline"
                  onClick={() => {
                    setInteractionProgress(0);
                    setResult(null);
                  }}
                  className="rounded-full px-5 text-[0.78rem] font-semibold uppercase tracking-[0.2em]"
                >
                  Reset
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-sm uppercase tracking-[0.2em] text-[rgba(245,245,245,0.72)]">
                {artifact.promptLabel}
              </label>
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={artifact.promptPlaceholder}
                className="min-h-36 rounded-[1.5rem] border-[rgba(246,241,222,0.12)] bg-[rgba(255,255,255,0.03)] text-base text-radiant-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_40px_rgba(0,0,0,0.14)] placeholder:text-[rgba(245,245,245,0.4)]"
              />
              <div className="prism-liana-panel p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    variant="prismOutline"
                    disabled={!artifact.audioSrc}
                    onClick={() => {
                      void toggleNarration();
                    }}
                    className="rounded-full px-5 text-[0.78rem] font-semibold uppercase tracking-[0.2em] text-sovereign-gold disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <Headphones className="size-4" />
                    {artifact.audioSrc
                      ? isNarrating
                        ? "Pause Narration"
                        : "Play Narration"
                      : "Narration Coming Soon"}
                  </Button>
                  <p className="text-sm leading-6 text-[rgba(245,245,245,0.66)]">
                    {artifact.audioSrc
                      ? "Optional artifact narration supplied by Liana."
                      : "Audio hook is ready. Final narration can be dropped in during polish without changing the interaction flow."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              variant="prism"
              onClick={resolveArtifact}
              disabled={!readiness}
              className="rounded-full px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] disabled:border-[rgba(214,179,95,0.2)] disabled:bg-[rgba(214,179,95,0.08)] disabled:text-[rgba(255,247,216,0.5)]"
            >
              {artifact.ctaLabel}
            </Button>
          </div>

          {result ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="prism-liana-quote rounded-[1.75rem] p-6 pl-8"
            >
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.22em] text-[rgba(245,245,245,0.66)]">
                  Sovereignty Output
                </p>
                <h4 className="font-display text-3xl text-radiant-white">{result.heading}</h4>
                <p className="text-base leading-8 text-[rgba(245,245,245,0.76)]">{result.body}</p>
                <ul className="space-y-3 pt-2 text-sm leading-7 text-[rgba(245,245,245,0.74)]">
                  {result.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3">
                    <span className="mt-2 size-2 rounded-full bg-sovereign-gold" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {artifact.outputType === "pdf" && result.downloadableText ? (
                <div className="mt-6 flex justify-start">
                  <Button
                    size="lg"
                    variant="prismOutline"
                    onClick={() => {
                      void downloadPdf(artifact.title, result);
                    }}
                    className="rounded-full px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-sovereign-gold"
                  >
                    <Download className="size-4" />
                    Download Blueprint PDF
                  </Button>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
