import { DIANA_MEMBER_CONFIG } from "./config/member";
import type {
  ArtifactDefinition,
  ArtifactResult,
  PrismPromptPair,
} from "./types";

export function normalizePrompt(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

export function scorePrismPair(pair: PrismPromptPair, input: string) {
  const pairTerms = new Set(normalizePrompt(pair.prompt).split(/\s+/).filter(Boolean));
  const inputTerms = normalizePrompt(input).split(/\s+/).filter(Boolean);
  return inputTerms.reduce((score, term) => score + (pairTerms.has(term) ? 1 : 0), 0);
}

export function resolvePrismPrompt(input: string) {
  if (!input.trim()) {
    return DIANA_MEMBER_CONFIG.prismPairs[0];
  }

  const best = [...DIANA_MEMBER_CONFIG.prismPairs].sort(
    (a, b) => scorePrismPair(b, input) - scorePrismPair(a, input)
  )[0];

  if (!best || scorePrismPair(best, input) === 0) {
    return {
      prompt: input,
      response:
        "Diana lens: fragmentation is asking for witness, not more performance. Name the true feeling, track where it lives in your body, and let the next action come from coherence instead of armor.",
    };
  }

  return best;
}

export function resolveArtifactResult(
  artifact: ArtifactDefinition,
  input: string,
  gestureProgress: number
): ArtifactResult {
  const cleaned = input.trim() || "the unnamed fragment";

  switch (artifact.id) {
    case "palace-of-perfection":
      return {
        heading: "The facade is cracking",
        body: `When you name "${cleaned}," the palace reveals the cost of keeping everything polished. The pattern is not your identity. It is a shelter that may have once kept you safe but now keeps your deeper life waiting outside.`,
        bullets: [
          "Notice where perfection still substitutes for honest feeling.",
          "Tell one smaller truth before you attempt the whole story.",
          "Ask what becomes possible if dignity no longer depends on performance.",
        ],
      };
    case "mothers-tide":
      return {
        heading: "The tide begins to thaw",
        body: `The phrase "${cleaned}" carries grief that wants movement, not management. The tide does not ask you to drown in it. It asks you to stop freezing the parts of yourself that still need to be felt.`,
        bullets: [
          "Give the feeling a location in the body before you analyze it.",
          "Let grief be evidence of love, not proof that you are failing to cope.",
          "Choose one ritual of remembrance that keeps you in contact with what matters.",
        ],
      };
    case "black-belt-storm":
      return {
        heading: "Ferocity becomes signal",
        body: `At ${Math.round(gestureProgress * 100)}% release, the storm answers clearly: your anger is not automatically violence. It can become clean force when it is given direction, boundary, and responsibility.`,
        bullets: [
          "Differentiate suppressed anger from grounded power.",
          "Move the body before you demand perfect language from it.",
          "Ask what boundary the storm has been trying to defend.",
        ],
      };
    case "initiatory-crucible":
      return {
        heading: "The crucible names the real threshold",
        body: `The prompt "${cleaned}" is not asking for a villain. It is asking for more truth than the current relational structure has been able to hold. Initiation begins where honesty replaces the wish to stay untriggered.`,
        bullets: [
          "Name the pattern without making the other person the whole problem.",
          "Bring jealousy, fear, or grief into language before they become distortion.",
          "Build the next agreement around integrity instead of emotional weather.",
        ],
      };
    case "reself-codex": {
      const downloadableText = [
        "The Luminous Shadowbreaker's Re-Self Blueprint",
        "",
        `Source fragment: ${cleaned}`,
        "",
        "Re-Self Blueprint",
        "1. Name the fragment, memory, or pattern that still feels split off.",
        "2. Identify the survival strategy that once protected it.",
        "3. Write the truth that returns the fragment to your living story.",
        "4. Choose one embodied act that proves the new story can hold under pressure.",
      ].join("\n");

      return {
        heading: "A re-selfing map emerges",
        body: `The codex takes "${cleaned}" and turns it into a sovereignty draft. The point is not to invent a prettier identity. It is to build a truer story that your body, relationships, and choices can actually inhabit.`,
        bullets: [
          "Fragment: the part of your story that still feels exiled.",
          "Armor: the move that helped you survive but now narrows your life.",
          "Return: the practice that brings truth back into embodiment.",
        ],
        downloadableText,
        downloadableFileName: "diana-reself-blueprint.pdf",
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
