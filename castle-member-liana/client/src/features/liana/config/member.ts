import type { MemberConfig } from "../types";

// Flip this to false to restore the previous live imagery without deleting the new drop.
const USE_IMAGES_28_DROP = true;

const LEGACY_HERO_PORTRAIT_OPTIONS: MemberConfig["heroPortraitOptions"] = [
  {
    id: "festival-fire",
    label: "Festival Fire",
    path: "/liana/converted/IMG_1105.jpg",
    objectPosition: "0% 33%",
    scale: 1.43,
    rotation: 0,
  },
  {
    id: "summit-sky",
    label: "Summit Sky",
    path: "/liana/summit-sky-hero-flat-v3.png",
    objectPosition: "26% 100%",
    scale: 1.8,
    rotation: 270,
  },
  {
    id: "sunlit-stillness",
    label: "Sunlit Stillness",
    path: "/liana/converted/IMG_5706.jpg",
    objectPosition: "0% 58%",
    scale: 1.26,
    rotation: 0,
  },
  {
    id: "hedra-lunar-terrace",
    label: "Hedra Lunar Terrace",
    path: "/liana/generated/hedra-lunar-terrace.png",
    objectPosition: "38% 42%",
    scale: 1.08,
    rotation: 0,
  },
  {
    id: "hedra-eclipse-forge",
    label: "Hedra Eclipse Forge",
    path: "/liana/generated/hedra-eclipse-forge.png",
    objectPosition: "50% 42%",
    scale: 1.06,
    rotation: 0,
  },
  {
    id: "hedra-sun-covenant",
    label: "Hedra Sun Covenant",
    path: "/liana/generated/hedra-sun-covenant.png",
    objectPosition: "31% 35%",
    scale: 1.08,
    rotation: 0,
  },
];

const IMAGES_28_HERO_PORTRAIT_OPTIONS: MemberConfig["heroPortraitOptions"] = [
  {
    id: "eclipse-mystic",
    label: "Eclipse Mystic",
    path: "/liana/images-28-drop/01_eclipse_mystic_v2.jpg",
    objectPosition: "50% 18%",
    scale: 1.18,
    rotation: 0,
  },
  {
    id: "mountain-sovereign",
    label: "Mountain Sovereign",
    path: "/liana/images-28-drop/02_mountain_sovereign.jpg",
    objectPosition: "50% 20%",
    scale: 1.22,
    rotation: 0,
  },
  {
    id: "lunar-forge",
    label: "Lunar Forge",
    path: "/liana/images-28-drop/09_lunar_forge.jpg",
    objectPosition: "50% 18%",
    scale: 1.18,
    rotation: 0,
  },
  {
    id: "eclipse-portal",
    label: "Eclipse Portal",
    path: "/liana/images-28-drop/12_eclipse_portal.jpg",
    objectPosition: "50% 20%",
    scale: 1.2,
    rotation: 0,
  },
  {
    id: "joyful-wild",
    label: "Joyful Wild",
    path: "/liana/images-28-drop/05_joyful_wild.jpg",
    objectPosition: "50% 28%",
    scale: 1.18,
    rotation: 0,
  },
];

const LEGACY_ASSETS: MemberConfig["assets"] = {
  heroPortrait: "/liana/hero-portrait.jpg",
  originPortrait: "/liana/origin-portrait.jpg",
  ascensionPortrait: "/liana/ascension-portrait.jpg",
  staticScene: "/liana/forge-static.svg",
};

const IMAGES_28_ASSETS: MemberConfig["assets"] = {
  heroPortrait: "/liana/images-28-drop/01_eclipse_mystic_v2.jpg",
  originPortrait: "/liana/images-28-drop/07_warrior_mystic.jpg",
  ascensionPortrait: "/liana/images-28-drop/05_joyful_wild.jpg",
  staticScene: "/liana/images-28-drop/09_lunar_forge.jpg",
};

export const LIANA_MEMBER_CONFIG: MemberConfig = {
  realmId: "castle-liana",
  realmName: "The Coherence Eclipse",
  pageTitle: "The Coherence Eclipse | Liana Camaras",
  pageDescription:
    "Liana Camaras's immersive lunar forge of embodied joy, with portal-aware arrival, authored artifacts, Prism prompts, wall activity, and ascension paths.",
  primaryHeadline:
    "Enter the Coherence Eclipse: Liana's Lunar Forge of Embodied Joy.",
  subheadline:
    "In this sanctuary, shadows dance with light, revealing the joy of true alignment. Liana turns wound, ritual, and relational truth into embodied sovereignty.",
  activationMessage:
    "Sovereignty here is not domination. It is coherence: thoughts, words, body, devotion, and contribution brought back into one living field.",
  arrivalBody:
    "This realm follows Liana's passage from abandonment, betrayal, and bodily silence into playful mysticism, substance-free unity, and communities built on truth.",
  originHeadline: "From the Depths of Shadow: My Lunar Arc.",
  originBody:
    "My wound began in the eclipse of disconnection: a mother wound of abandonment, cycles of betrayal, and a body silenced for years. I lost myself inside manipulation, burnout, debt, and relationships that betrayed integrity. Through yoga, retreat work, nervous system release, and relentless truth-telling, I alchemized entropy into coherence. Now I guide others toward joy without crutches and intimacy without self-betrayal.",
  originMoments: [
    {
      id: "mother-wound",
      label: "Mother Wound",
      detail:
        "Early abandonment imprinted a life pattern of emotional incoherence, vigilance, and yearning for grounded love."
    },
    {
      id: "body-silence",
      label: "Body Silence",
      detail:
        "Five years without cycles and waves of adrenal fatigue made it undeniable that my body was carrying the cost of misalignment."
    },
    {
      id: "debt-crucible",
      label: "Debt And Betrayal",
      detail:
        "Manipulative spiritual dynamics, relational rupture, and $38,000 of debt forced shadow into the open."
    },
    {
      id: "castle-grace",
      label: "Castle Grace",
      detail:
        "The work matured into a living laboratory for coherent joy, nervous system truth, and communities built without bypass."
    }
  ],
  artifacts: [
    {
      id: "eclipse-orb",
      title: "Eclipse Orb: The Rebirth Myth",
      headline: "Rotate the orb and let shadow become illumination.",
      body:
        "Under the lunar eclipse, the mother wound, emotional tides, and grief of disconnection finally surfaced. Rotate the orb to reveal the blessing hidden inside the shadow.",
      promptLabel: "What shadow is asking to be illuminated?",
      promptPlaceholder:
        "Name the wound, pattern, or memory that keeps returning for integration.",
      ctaLabel: "Integrate The Shadow",
      interactionType: "rotate",
      outputType: "text",
      realmToken: "Myth",
      audioSrc: null
    },
    {
      id: "fire-staff",
      title: "Fire Staff: The Hiatus Fire",
      headline: "Spin the staff and ignite aliveness again.",
      body:
        "From betrayal's shell came fire dancing, synchronicity, and the reclamation of aliveness. Spin the staff to rehearse your own liberation.",
      promptLabel: "What has gone flat or numb in you?",
      promptPlaceholder:
        "Name the place where you want more life, heat, play, or courage.",
      ctaLabel: "Ignite Your Liberation",
      interactionType: "spin",
      outputType: "text",
      realmToken: "Fire",
      audioSrc: null
    },
    {
      id: "chakra-wheel",
      title: "Chakra Wheel: The Amenorrhea Vow",
      headline: "Pulse the wheel and remember the body's signal.",
      body:
        "Years of disconnection from my cycles became a vow to sustain unity without crutches. Pulse the wheel to return from bypass to embodiment.",
      promptLabel: "Where is your body asking for honesty?",
      promptPlaceholder:
        "Describe the signal, symptom, or fatigue pattern you have been overriding.",
      ctaLabel: "Reconnect Your Flow",
      interactionType: "pulse",
      outputType: "text",
      realmToken: "Vow",
      audioSrc: null
    },
    {
      id: "castle-gate",
      title: "Castle Gate: The Crucible Alchemy",
      headline: "Open the gate and step into relational truth.",
      body:
        "Inside the Castle crew's forge, shadow stopped being private theater and became material for shared reality. Open the gate to practice honesty without collapse.",
      promptLabel: "What relationship needs clearer truth?",
      promptPlaceholder:
        "Name the bond, group, or conversation that wants a more coherent agreement.",
      ctaLabel: "Enter The Relational Lab",
      interactionType: "open",
      outputType: "text",
      realmToken: "Crucible",
      audioSrc: null
    },
    {
      id: "mountain-path",
      title: "Mountain Path: The Boulder Rebirth",
      headline: "Walk the path and choose your next embodied chapter.",
      body:
        "Leaving corporate life, syncing to canyons, and learning from plant allies became a trail back to coherence. Walk the path to sketch your rebirth ritual.",
      promptLabel: "What threshold are you walking toward?",
      promptPlaceholder:
        "Describe the chapter you are leaving and the terrain you want to enter next.",
      ctaLabel: "Walk Your Rebirth Trail",
      interactionType: "walk",
      outputType: "pdf",
      realmToken: "Trail",
      audioSrc: null
    }
  ],
  influences: [
    {
      id: "suzuki",
      title: "Zen Mind, Beginner's Mind",
      author: "Shunryu Suzuki",
      body:
        "Presence is renewed through openness, not through performing enlightenment.",
      reflection:
        "Suzuki reminds me that coherence is practiced in the ordinary moment, especially when shadow wants to rush past itself."
    },
    {
      id: "haich",
      title: "Initiation",
      author: "Elisabeth Haich",
      body:
        "Transformation is not a mood. It is a lawful path of ordeal, revelation, and embodiment.",
      reflection:
        "Haich gives this realm its ritual grammar: descent, encounter, integration, and a more truthful life on the other side."
    },
    {
      id: "tolle",
      title: "The Power of Now",
      author: "Eckhart Tolle",
      body:
        "Presence is the ground that lets pain become signal instead of identity.",
      reflection:
        "Tolle helps me translate mystical states into everyday nervous system honesty rather than peak-experience addiction."
    },
    {
      id: "ruiz",
      title: "The Four Agreements",
      author: "Don Miguel Ruiz",
      body:
        "Impeccability, clean speech, and freedom from projection are spiritual technologies of coherence.",
      reflection:
        "Ruiz sharpens the relational edge here: joy only stays clean when words, agreements, and interpretations do too."
    },
    {
      id: "hubbard",
      title: "Conscious Evolution",
      author: "Barbara Marx Hubbard",
      body:
        "Civilizational pressure can be read as emergence asking humanity to participate consciously.",
      reflection:
        "Hubbard lets the realm connect personal healing to contribution. Coherence becomes a civic act, not only a private one."
    }
  ],
  prismPairs: [
    {
      prompt: "I'm burned out from leading retreats. How do I sustain joy without crashing?",
      response:
        "Lens #12 - The Coherence Mystic: Burnout signals shadow misalignment. Release suppressed emotion, re-enter presence through the body, and let joy become a disciplined nervous system practice rather than a performance."
    },
    {
      prompt: "My relationships keep betraying integrity. How do I build lasting bonds?",
      response:
        "Lens #47 - The Relational Alchemist: Betrayal echoes unintegrated wounds. Name the shadow, tell the truth without theatrics, and build agreements that protect shared reality instead of preserving appearances."
    },
    {
      prompt: "I rely on substances for unity. How do I sustain it naturally?",
      response:
        "Lens #89 - The Presence Guide: Crutches veil your innate coherence. Practice nervous system regulation, devotional embodiment, and relationship with tools as allies, not masters."
    },
    {
      prompt: "Emotional tides overwhelm me. How do I navigate them coherently?",
      response:
        "Lens #23 - The Lunar Integrator: Tides are medicine. Slow the pace, feel the signal in the body, and let shadow move through release, love, and integration rather than suppression."
    },
    {
      prompt: "How do I turn my wounds into community contribution?",
      response:
        "Lens #108 - The Retreat Weaver: Wounds alchemize into gifts when they become structure. Map the story, harvest the principle, and create spaces where others can metabolize what you have learned."
    }
  ],
  heroPortraitOptions: USE_IMAGES_28_DROP
    ? IMAGES_28_HERO_PORTRAIT_OPTIONS
    : LEGACY_HERO_PORTRAIT_OPTIONS,
  ascensionQuote:
    "Sovereignty integrated my shadows into coherent joy. Reclaim yours through Metacanon. Sign the DDOS to anchor your truth, download Prism to align your presence, and adopt the Constitution for lasting integrity.",
  wallSeeds: [
    "Sienna Vale",
    "Micah Ember",
    "Iris Sol",
    "Noah Tide",
    "Ari Rowan",
    "Diana Ash",
    "Paul Covenant",
    "Mira Stone"
  ],
  realmNames: {
    "castle-liana": "The Coherence Eclipse",
    "castle-anna": "Anna's Phoenix Covenant",
    "castle-paul": "Architect's Forge",
    "cosmic-hub": "The Cosmic Hub",
    "governance-citadel": "The Governance Citadel",
    godsminddreaming: "The Cosmic Hub",
    metacanonai: "The Governance Citadel",
    iampaulcooper: "Architect's Forge"
  },
  assets: USE_IMAGES_28_DROP ? IMAGES_28_ASSETS : LEGACY_ASSETS
};
