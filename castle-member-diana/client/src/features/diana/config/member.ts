import type { MemberConfig } from "../types";

export const DIANA_MEMBER_CONFIG: MemberConfig = {
  realmId: "castle-diana",
  realmName: "The Luminous Shadowbreaker's Realm",
  pageTitle: "The Luminous Shadowbreaker's Realm",
  pageDescription:
    "A twilight forge of reclamation where Diana Fleishman turns fragmentation, grief, ferocity, and initiatory love into embodied sovereignty.",
  primaryHeadline:
    "Reclaim the fragments that once learned to survive by disappearing.",
  subheadline:
    "Diana's realm is a twilight forge for turning grief, exile, anger, and relational shadows into coherent selfhood.",
  activationMessage:
    "Born at the seam of two kingdoms, this world invites you to stop treating your shadows as proof of brokenness and begin using them as the material of return.",
  arrivalBody:
    "Built from Diana's own writing, this realm traces a pilgrimage from London to Minnesota, from wanderlust to grief, from the palace of perfection to the throne beneath it.",
  originHeadline:
    "From a palace of perfection to the living throne beneath it.",
  originBody:
    "Diana's story is grounded in early adaptation, image-conscious belonging, and the ache of feeling different long before she could name why. Achievement, fairy-tale longing, martial ferocity, travel, caregiving, grief, and initiatory love each became thresholds in the same deeper movement: the return of fragmented parts into a truer, more embodied life.",
  originMoments: [
    {
      id: "london-to-minnesota",
      label: "London to Minnesota",
      detail:
        "A British childhood moved into small-town Minnesota, where fitting in meant adaptation and belonging often felt more performed than natural."
    },
    {
      id: "palace-of-perfection",
      label: "Palace of Perfection",
      detail:
        "Good grades, polished behavior, and magical family rituals formed a bright outer world that helped her avoid the deeper truths her body already knew."
    },
    {
      id: "black-belt-and-exile",
      label: "Black Belt and Exile",
      detail:
        "Martial arts gave anger a body, while travel across Australia, Europe, and Asia offered freedom, aliveness, and a restless search for something unnamed."
    },
    {
      id: "mothers-tide",
      label: "Mother's Tide and Re-Selfing",
      detail:
        "Caregiving through her mother's decline and death cracked the shell, opening the long work of grief, vulnerability, myth, and the reassembly of self."
    }
  ],
  artifacts: [
    {
      id: "palace-of-perfection",
      title: "Palace of Perfection",
      headline: "Shatter the facade. Find the throne beneath it.",
      body:
        "Name the polished persona, self-erasing habit, or impossible standard that still keeps your deeper truth hidden behind immaculate walls.",
      promptLabel: "Name the facade",
      promptPlaceholder:
        "Where are you still performing calm, goodness, or perfection to avoid what is actually true?",
      ctaLabel: "Crumble the Palace",
      interactionType: "input",
      outputType: "text",
      realmToken: "Facade"
    },
    {
      id: "mothers-tide",
      title: "Mother's Tide",
      headline: "Let the frozen tide begin to move.",
      body:
        "Offer the grief, ache, or unprocessed tenderness that still floods or freezes you, and the tide will answer with a gentler form of coherence.",
      promptLabel: "Name the grief current",
      promptPlaceholder:
        "What loss, longing, or ache still returns when you finally slow down?",
      ctaLabel: "Enter the Tide",
      interactionType: "input",
      outputType: "text",
      realmToken: "Tide"
    },
    {
      id: "black-belt-storm",
      title: "Black Belt Storm",
      headline: "Move the storm until it becomes power.",
      body:
        "This relic answers to gesture first. Drag through it to turn suppressed anger into boundary, force, and embodied signal.",
      promptLabel: "Gesture to release",
      promptPlaceholder:
        "Drag across the storm or reveal it in one step.",
      ctaLabel: "Break the Storm",
      interactionType: "gesture",
      outputType: "text",
      realmToken: "Ferocity"
    },
    {
      id: "initiatory-crucible",
      title: "Initiatory Crucible",
      headline: "Bring the relational pattern into the fire.",
      body:
        "Offer the trigger, jealousy, fear, or broken agreement that keeps replaying in love, and the crucible will return a cleaner path through it.",
      promptLabel: "Describe the crucible",
      promptPlaceholder:
        "What relational pattern keeps igniting when honesty, freedom, or attachment are tested?",
      ctaLabel: "Enter the Crucible",
      interactionType: "input",
      outputType: "text",
      realmToken: "Crucible"
    },
    {
      id: "reself-codex",
      title: "Re-Self Codex",
      headline: "Write the fragment. Receive the mythic map.",
      body:
        "Bring a fragment of story, memory, or identity into the codex, and it will organize it into a blueprint for re-selfing you can keep.",
      promptLabel: "Draft the fragment",
      promptPlaceholder:
        "What wound, threshold, and returning truth belong in the story you are ready to live from now?",
      ctaLabel: "Inscribe the Codex",
      interactionType: "input",
      outputType: "pdf",
      realmToken: "Myth"
    }
  ],
  influences: [
    {
      id: "tolle",
      title: "A New Earth",
      author: "Eckhart Tolle",
      body:
        "Presence loosens the grip of identity structures that once felt unquestionable.",
      reflection:
        "Tolle underlines a core Diana theme: the self you defend most fiercely may be the very thing keeping deeper life at a distance."
    },
    {
      id: "adyashanti",
      title: "The End of Your World",
      author: "Adyashanti",
      body:
        "Awakening is not only illumination. It is also the unsettling reorganization that follows when old identity scaffolding gives way.",
      reflection:
        "This keeps the site honest: reclamation is not cosmetic. It changes what life asks you to live from."
    },
    {
      id: "haich",
      title: "Initiation",
      author: "Elisabeth Haich",
      body:
        "Transformation moves in rites, thresholds, ordeals, and revelations rather than in straight lines.",
      reflection:
        "Haich supports the architecture of this realm: the journey is designed as a pilgrimage, not a brochure."
    },
    {
      id: "urbaniak",
      title: "Unbound",
      author: "Kasia Urbaniak",
      body:
        "Voice, desire, and boundary become power when they can remain present under pressure.",
      reflection:
        "Urbaniak sharpens the relational edge of Diana's work: sovereignty is embodied, not theoretical."
    },
    {
      id: "existential-kink",
      title: "Existential Kink",
      author: "Carolyn Elliott",
      body:
        "The disowned and taboo can become material for transformation once they are consciously met.",
      reflection:
        "This is close to Diana's re-selfing frame: shadow is not erased, it is metabolized into usable life."
    },
    {
      id: "jung",
      title: "Shadow and Archetype",
      author: "Carl Jung",
      body:
        "The psyche becomes more whole as disowned material is seen, symbolized, and reintegrated.",
      reflection:
        "Jung names the mythic grammar beneath the whole site: fragments, symbols, shadow, and the return of disowned life."
    }
  ],
  prismPairs: [
    {
      prompt: "I keep performing the polished version of myself. How do I come back?",
      response:
        "Diana lens: start with the part that is trying hardest to seem okay. Performance softens when one honest feeling is allowed back into the room."
    },
    {
      prompt: "Grief freezes me right when I want to be present.",
      response:
        "Diana lens: frozen grief is still movement waiting for safety. Slow down, locate it in the body, and let it become contact instead of collapse."
    },
    {
      prompt: "My anger either disappears or explodes.",
      response:
        "Diana lens: anger becomes usable when it is treated as boundary information rather than shame. Move it, name it, then decide what it is protecting."
    },
    {
      prompt: "I am trapped in a relational pattern that feels older than this moment.",
      response:
        "Diana lens: older patterns surface in present love because relationship is one of the places fragmentation asks to be made conscious. Stay with the pattern long enough to name the original split."
    },
    {
      prompt: "I feel fragmented and want a story that is actually mine.",
      response:
        "Diana lens: coherence returns when the fragment is welcomed back without being forced into a cleaner past. Build a story your body recognizes as true."
    }
  ],
  ascensionQuote:
    "The palace only had to crumble so I could find the throne beneath it. Sovereignty begins when truth becomes more intimate than survival.",
  wallSeeds: [
    "Aurelia North",
    "Juniper Vale",
    "Mira Sol",
    "Orion Ash",
    "Selene Hart",
    "Talia Rowan",
    "Ember Reed",
    "Jonah Vale"
  ],
  realmNames: {
    "castle-diana": "The Luminous Shadowbreaker's Realm",
    "castle-paul": "Architect's Forge",
    "cosmic-hub": "Cosmic Hub",
    "governance-citadel": "Governance Citadel",
    godsminddreaming: "Cosmic Hub",
    metacanonai: "Governance Citadel",
    iampaulcooper: "Architect's Forge"
  },
  heroPortraitOptions: [
    {
      id: "noir",
      label: "Noir",
      path: "/diana/Diana%203.png",
      objectPosition: "82% 13%",
      scale: 1.8,
    },
    {
      id: "forest",
      label: "Forest",
      path: "/diana/Diana%201.png",
      objectPosition: "50% 18%",
      scale: 1.22,
    },
    {
      id: "shore",
      label: "Shore",
      path: "/diana/Diana%2014.jpg",
      objectPosition: "72% 26%",
      scale: 1.18,
    },
  ],
  assets: {
    heroPortrait: "/diana/Diana%203.png",
    originPortrait: "/diana/Diana%201.png",
    ascensionPortrait: "/diana/Diana%2014.jpg",
    staticScene: "/diana/forge-static.svg"
  }
};
