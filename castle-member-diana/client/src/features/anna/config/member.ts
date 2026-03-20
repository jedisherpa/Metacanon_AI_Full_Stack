import type { MemberConfig } from "../types";

export const ANNA_MEMBER_CONFIG: MemberConfig = {
  realmId: "castle-anna",
  realmName: "Anna's Phoenix Covenant",
  pageTitle: "Anna's Phoenix Covenant",
  pageDescription:
    "An immersive sovereignty world for Anna grounded in AI-era sovereignty, trustworthy signal, relational architecture, and initiatory authorship.",
  primaryHeadline:
    "You've built a life through competence, intelligence, and control. The next era requires a different and deeper kind of power.",
  subheadline:
    "Anna's Phoenix Covenant translates complexity into trustworthy clarity through story, signal, surrender, and structures that can hold under pressure.",
  activationMessage:
    "What can still be trusted when scale, speed, and AI intensify everything? Not more noise. Signal, structure, surrender, and authorship deep enough to remain human inside acceleration.",
  arrivalBody:
    "You have entered a living threshold built from Anna's actual story: from old-world polish and over-control, through legal and relational collapse, into a practice of reselfing, trustworthy interpretation, and coherent participation in what is coming.",
  originHeadline:
    "From polished control to living signal.",
  originBody:
    "Anna grew up inside beauty, composure, and emotional suppression in Northwest London, sensing early that appearances and truth were not the same thing. After 2008 placed her inside the machinery of mass layoffs, and repeated relationship collapses exposed the cost of control, she fell to her knees and asked God to use her for the highest good. The years since have been a lived experiment in initiation, governance, chosen family, ceremony, and telling the truth strongly enough to become structurally different.",
  originMoments: [
    {
      id: "old-soul-arrival",
      label: "Old Soul Arrival",
      detail:
        "Anna's earliest memory is coming to in her mother's arms already sensing the mismatch between outer polish and inner truth."
    },
    {
      id: "crisis-of-structure",
      label: "2008 Rupture",
      detail:
        "Working as a labor lawyer during the financial collapse made the violence of dead systems undeniable and irreversible."
    },
    {
      id: "cosmic-treasure-hunt",
      label: "Cosmic Treasure Hunt",
      detail:
        "A surrender prayer in Los Angeles opened the trail of retreats, coaching, visions, and callings that rearranged her life."
    },
    {
      id: "reselfing",
      label: "Re-Selfing",
      detail:
        "Reselfing became the practice of telling the whole truth about control, rupture, initiation, and the architecture required for a freer future."
    }
  ],
  artifacts: [
    {
      id: "cosmic-scroll",
      title: "The Cosmic Treasure Hunt Scroll",
      headline: "Unroll the Scroll: Your Cosmic Treasure Hunt Awaits.",
      body:
        "Describe the control pattern that still keeps you braced, and the scroll will answer with the treasure hidden inside it.",
      promptLabel: "Name the control pattern",
      promptPlaceholder:
        "Where do you over-manage, over-explain, or grip to stay safe?",
      ctaLabel: "Reveal Your Treasure",
      interactionType: "input",
      outputType: "text",
      realmToken: "Treasure"
    },
    {
      id: "authority-mirror",
      title: "The Authority Drift Mirror",
      headline: "Gaze into the Mirror: Confront Authority Drift.",
      body:
        "Offer the mirror a current tension with AI, power, or relationship, and it will show you where presence has slipped.",
      promptLabel: "Mirror prompt",
      promptPlaceholder:
        "What situation is making you feel authored by forces outside yourself?",
      ctaLabel: "Reflect Your State",
      interactionType: "input",
      outputType: "text",
      realmToken: "Mirror"
    },
    {
      id: "chosen-crucible",
      title: "The Chosen Family Crucible",
      headline: "Enter the Crucible: Forge Relational Gold.",
      body:
        "Bring a rupture, betrayal, or recurring conflict into the crucible and receive a repair path grounded in truth instead of performance.",
      promptLabel: "Describe the rupture",
      promptPlaceholder:
        "What relational pattern keeps replaying when trust is tested?",
      ctaLabel: "Ignite the Fire",
      interactionType: "input",
      outputType: "text",
      realmToken: "Covenant"
    },
    {
      id: "phoenix-wing",
      title: "The Phoenix Wing",
      headline: "Unfold the Wing: Activate Your Vision.",
      body:
        "Trace the wing open to reveal the next edge of your mandate. This artifact responds to gesture first and certainty second.",
      promptLabel: "Gesture to reveal",
      promptPlaceholder: "Drag across the wing or use the reveal button.",
      ctaLabel: "Spread Your Wings",
      interactionType: "gesture",
      outputType: "text",
      realmToken: "Vision"
    },
    {
      id: "reselfing-codex",
      title: "The Re-Selfing Codex",
      headline: "Open the Codex: Re-Self Your Story.",
      body:
        "Write the fragments of a story you are ready to reclaim, and the codex will assemble them into a sovereignty blueprint you can keep.",
      promptLabel: "Draft your myth fragment",
      promptPlaceholder:
        "What wound, threshold, and emerging responsibility belong in your next chapter?",
      ctaLabel: "Inscribe Your Map",
      interactionType: "input",
      outputType: "pdf",
      realmToken: "Blueprint"
    }
  ],
  influences: [
    {
      id: "haich",
      title: "Initiation",
      author: "Elisabeth Haich",
      body:
        "Transformation is not a mood. It is a lawful path of preparation, ordeal, revelation, and embodiment.",
      reflection:
        "Haich names why this realm is sequenced like a temple path. Change has to be earned, metabolized, and lived."
    },
    {
      id: "magdalene",
      title: "The Magdalene Manuscript",
      author: "Mary Magdalene / Tom Kenyon",
      body:
        "Experiential truth carries more authority than polished doctrine when what people need is witness, not performance.",
      reflection:
        "This lens keeps Anna's authority rooted in what has been lived, not in borrowed abstraction."
    },
    {
      id: "hubbard",
      title: "Conscious Evolution",
      author: "Barbara Marx Hubbard",
      body:
        "Civilizational pressure is not only collapse. It is emergence asking humanity to participate consciously in what comes next.",
      reflection:
        "Hubbard helps frame AI and cultural instability as evolutionary thresholds rather than panic cycles."
    },
    {
      id: "campbell",
      title: "The Hero With A Thousand Faces",
      author: "Joseph Campbell",
      body:
        "People metabolize truth through journeys, not isolated facts. Myth gives structure to transformation.",
      reflection:
        "Campbell is why the site moves like a rite of passage instead of reading like a brochure."
    },
    {
      id: "urbaniak",
      title: "Unbound",
      author: "Kasia Urbaniak",
      body:
        "Power becomes real when desire, boundaries, and truth can still be spoken under pressure.",
      reflection:
        "Urbaniak sharpens the relational layer here: clarity, voice, and embodied agency over performance or appeasement."
    },
    {
      id: "laloux",
      title: "Reinventing Organizations",
      author: "Frederic Laloux",
      body:
        "Institutions do not have to function like domination machines. They can become living systems shaped by wholeness and purpose.",
      reflection:
        "Laloux anchors the governance imagination underneath the mythology: structure matters because it shapes what human beings can become together."
    }
  ],
  prismPairs: [
    {
      prompt: "What can still be trusted when AI intensifies everything?",
      response:
        "Anna lens: trust what remains coherent under pressure. Look for signal over noise, witness over performance, and structures that let truth survive scale."
    },
    {
      prompt: "I've built my life through competence and control. What now?",
      response:
        "Anna lens: competence got you here, but it cannot carry the next threshold alone. The deeper power is surrender without collapse and authority without control."
    },
    {
      prompt: "How do I distinguish signal from noise?",
      response:
        "Anna lens: ask what is real, relevant, and trustworthy. Ignore what is merely loud. Signal leaves you steadier, clearer, and more able to act."
    },
    {
      prompt: "Why does relationship matter in a civilizational transition?",
      response:
        "Anna lens: because rapid change reveals the quality of our agreements. Relationship is where truth, boundaries, authorship, and governance stop being theory."
    },
    {
      prompt: "How do I stay human inside rapid change?",
      response:
        "Anna lens: stay close to reality, let go of what is performative, strengthen your structures, and choose the kind of power that deepens humanity rather than replacing it."
    }
  ],
  ascensionQuote:
    "Re-selfing is part of my own integration process: to tell the truth about it all, be revealed by it, and let surrender build what control never could.",
  wallSeeds: [
    "Aletheia North",
    "Mira Sol",
    "Jonah Vale",
    "Diana Ash",
    "Paul Covenant",
    "Lena Vale",
    "Micah Stone",
    "Iris Ember"
  ],
  realmNames: {
    "castle-anna": "Anna's Phoenix Covenant",
    "castle-paul": "Architect's Forge",
    "cosmic-hub": "Cosmic Hub",
    "governance-citadel": "Governance Citadel",
    godsminddreaming: "Cosmic Hub",
    metacanonai: "Governance Citadel",
    iampaulcooper: "Architect's Forge"
  },
  assets: {
    heroPortrait: "/anna/hero-portrait.jpg",
    originPortrait: "/anna/origin-portrait.jpg",
    ascensionPortrait: "/anna/ascension-portrait.jpg",
    staticScene: "/anna/forge-static.svg"
  }
};
