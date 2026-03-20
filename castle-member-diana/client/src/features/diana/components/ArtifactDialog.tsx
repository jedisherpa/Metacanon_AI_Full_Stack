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
import type { PointerEvent as ReactPointerEvent } from "react";
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

  doc.setFillColor("#08080e");
  doc.rect(0, 0, 612, 792, "F");
  doc.setTextColor("#d4cfc4");
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

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
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
          className="group editorial-rule w-full border-t py-7 text-left transition-colors hover:bg-black/[0.02]"
        >
          <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-start">
            <div className="editorial-label">
              {artifact.realmToken}
            </div>
            <div className="space-y-3">
              <h3 className="font-display text-3xl text-black sm:text-4xl">
                {artifact.title}
              </h3>
              <p className="editorial-copy max-w-2xl text-base leading-8">
                {artifact.body}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 font-[var(--font-ui)] text-[10px] uppercase tracking-[0.26em] text-black/54">
              Enter
              <Sparkles className="size-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </motion.button>
      </DialogTrigger>

      <DialogContent className="editorial-window max-w-3xl border border-black/10 bg-white p-0 text-black shadow-[0_30px_90px_rgba(15,15,15,0.14)] sm:max-w-3xl">
        <div className="space-y-8 p-8">
          <DialogHeader className="space-y-4 text-left">
            <div className="editorial-pill inline-flex w-fit rounded-full px-3 py-1 text-xs uppercase tracking-[0.22em]">
              {artifact.realmToken}
            </div>
            <DialogTitle className="font-display text-4xl">{artifact.headline}</DialogTitle>
            <DialogDescription className="editorial-copy max-w-2xl text-base leading-7">
              {artifact.body}
            </DialogDescription>
          </DialogHeader>

          {artifact.interactionType === "input" ? (
            <div className="space-y-4">
              <label className="editorial-label">
                {artifact.promptLabel}
              </label>
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={artifact.promptPlaceholder}
                className="editorial-inset min-h-36 rounded-[1.4rem] border-black/10 bg-white text-base text-black placeholder:text-black/35"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="editorial-label flex items-center justify-between">
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
                className="editorial-inset relative overflow-hidden rounded-[1.5rem] p-6"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,rgba(17,17,17,0.12),rgba(17,17,17,0.02))] transition-all"
                  style={{ width: `${gestureProgress * 100}%` }}
                />
                <div className="relative flex min-h-36 flex-col justify-between gap-4">
                  <Hand className="size-8 text-black/62" />
                  <p className="editorial-copy max-w-xl text-lg leading-8">
                    Drag through the storm to move the fragment back into your hands. If you prefer, press Enter or Space to reveal it in one step.
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
              className="rounded-full bg-black px-6 text-[0.74rem] uppercase tracking-[0.24em] text-white hover:bg-black/88"
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
                className="rounded-full border-black/12 bg-white px-6 text-[0.74rem] uppercase tracking-[0.24em] text-black hover:bg-black/[0.03]"
              >
                Reveal without dragging
              </Button>
            ) : null}
          </div>

          {result ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="editorial-inset rounded-[1.75rem] p-6"
            >
              <div className="space-y-3">
                <p className="editorial-label">
                  Sovereignty Output
                </p>
                <h4 className="font-display text-3xl text-black">{result.heading}</h4>
                <p className="editorial-copy text-base leading-8">{result.body}</p>
                <ul className="editorial-copy space-y-3 pt-2 text-sm leading-7">
                  {result.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3">
                      <span className="mt-2 size-2 rounded-full bg-black" />
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
                    className="rounded-full border-black/12 bg-white px-6 text-[0.74rem] uppercase tracking-[0.24em] text-black hover:bg-black/[0.03]"
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
