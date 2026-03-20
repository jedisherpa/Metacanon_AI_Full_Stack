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
import { Download, Hand, Sparkles } from "lucide-react";
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
    gestureProgress: number
  ) => ArtifactResult | null;
};

async function downloadPdf(title: string, result: ArtifactResult) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    unit: "pt",
    format: "letter",
  });

  doc.setFillColor("#071920");
  doc.rect(0, 0, 612, 792, "F");
  doc.setTextColor("#f5f5f5");
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

  doc.save(result.downloadableFileName ?? "sovereignty-blueprint.pdf");
}

export function ArtifactDialog({
  artifact,
  onEvent,
  onResolve,
}: ArtifactDialogProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ArtifactResult | null>(null);
  const [gestureProgress, setGestureProgress] = useState(0);
  const startXRef = useRef<number | null>(null);
  const hasLoggedRef = useRef(false);

  useEffect(() => {
    if (open && !hasLoggedRef.current) {
      hasLoggedRef.current = true;
      void onEvent({
        eventType: "artifact_click",
        artifactId: artifact.id,
        metadata: {
          artifactTitle: artifact.title,
        },
      });
    }

    if (!open) {
      hasLoggedRef.current = false;
      startXRef.current = null;
      setInput("");
      setResult(null);
      setGestureProgress(0);
    }
  }, [artifact.id, artifact.title, onEvent, open]);

  const readiness = useMemo(() => {
    if (artifact.interactionType === "gesture") {
      return gestureProgress >= 0.62;
    }

    return input.trim().length >= 8;
  }, [artifact.interactionType, gestureProgress, input]);

  const resolveArtifact = () => {
    const nextResult = onResolve(artifact, input, gestureProgress);
    setResult(nextResult);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) {
      return;
    }

    const delta = Math.max(0, event.clientX - startXRef.current);
    setGestureProgress(Math.max(gestureProgress, Math.min(1, delta / 220)));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <motion.button
          whileHover={{ x: 8 }}
          whileTap={{ scale: 0.995 }}
          className="group w-full border-t border-white/10 py-8 text-left transition-colors hover:border-sovereign-gold/40"
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

      <DialogContent className="max-w-3xl border-white/10 bg-[rgba(7,25,32,0.96)] p-0 text-radiant-white shadow-[0_30px_120px_rgba(0,0,0,0.4)] sm:max-w-3xl">
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

          {artifact.interactionType === "input" ? (
            <div className="space-y-4">
              <label className="text-sm uppercase tracking-[0.2em] text-[rgba(245,245,245,0.72)]">
                {artifact.promptLabel}
              </label>
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={artifact.promptPlaceholder}
                className="min-h-36 border-white/10 bg-white/5 text-base text-radiant-white placeholder:text-[rgba(245,245,245,0.4)]"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm uppercase tracking-[0.2em] text-[rgba(245,245,245,0.72)]">
                <span>{artifact.promptLabel}</span>
                <span>{Math.round(gestureProgress * 100)}%</span>
              </div>
              <div
                role="button"
                tabIndex={0}
                onPointerDown={(event) => {
                  startXRef.current = event.clientX;
                }}
                onPointerMove={handlePointerMove}
                onPointerUp={() => {
                  startXRef.current = null;
                }}
                onPointerLeave={() => {
                  startXRef.current = null;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setGestureProgress(1);
                  }
                }}
                className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(139,30,63,0.26),rgba(201,168,76,0.12))] p-6"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,rgba(201,168,76,0.32),rgba(245,245,245,0.08))] transition-all"
                  style={{ width: `${gestureProgress * 100}%` }}
                />
                <div className="relative flex min-h-36 flex-col justify-between gap-4">
                  <Hand className="size-8 text-sovereign-gold" />
                  <p className="max-w-xl text-lg leading-8 text-radiant-white">
                    Drag across the relic to open the wing. If you prefer, press Enter or Space to reveal it in one step.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={resolveArtifact}
              disabled={!readiness}
              className="rounded-full bg-sovereign-gold px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-[#071920] hover:bg-[rgba(201,168,76,0.92)]"
            >
              {artifact.ctaLabel}
            </Button>
            {artifact.interactionType === "gesture" ? (
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  setGestureProgress(1);
                  setResult(onResolve(artifact, input, 1));
                }}
                className="rounded-full border-white/15 bg-transparent px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-radiant-white"
              >
                Reveal without dragging
              </Button>
            ) : null}
          </div>

          {result ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[1.75rem] border border-white/10 bg-white/6 p-6"
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
                    variant="outline"
                    onClick={() => {
                      void downloadPdf(artifact.title, result);
                    }}
                    className="rounded-full border-sovereign-gold/35 bg-transparent px-6 text-[0.82rem] font-semibold uppercase tracking-[0.2em] text-sovereign-gold"
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
