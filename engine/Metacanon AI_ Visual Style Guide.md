# Metacanon AI: Visual Style Guide

**Author:** Aetherion, Principal Design Architect
**Version:** 1.0 (Style-Only Edition)
**Date:** Mar 06, 2026

---

## 1.0 Core Philosophy: Hyperspace Cathedral

This document defines the pure visual style for the Metacanon AI digital presence. The aesthetic is **"Hyperspace Cathedral"**: a fusion of sacred geometry, visionary art, and precision engineering. The style must feel simultaneously profound and clear, otherworldly and functional. Every visual element is designed to evoke a sense of wonder, clarity, and empowerment.

## 2.0 The Color System: Aetheric Spectrum

The palette is foundational. No off-palette colors are permitted. The system is built on a canvas of absolute black, punctuated by living light.

| Color Name        | Hex       | Usage Role                                                            | 
| :---------------- | :-------- | :-------------------------------------------------------------------- | 
| **Void Black**      | `#000000` | **Canvas.** The primary background for all sections and components.   | 
| **Starlight White** | `#FFFFFF` | **Clarity.** Core body text and high-contrast, non-interactive elements. | 
| **Cyan Glow**       | `#00FFFF` | **Interaction.** The primary color for links, buttons, subtitles, and UI accents. | 
| **Gold Light**      | `#FFD700` | **Revelation.** The primary accent for major headlines (H1, H2) and key concepts. | 
| **Magenta Pulse**   | `#FF00FF` | **Emphasis.** A secondary accent for highlights, warnings, or energetic states. | 

## 3.0 The Typographic Hierarchy: Oracle's Voice

The system uses two primary font families to create a clear hierarchy between structural and informational text.

### 3.1 Headline & Structural Font

- **Font:** Space Grotesk
- **Weight:** Bold (700)
- **Case:** `text-transform: uppercase` is mandatory.
- **Usage:** All `<h1>`, `<h2>`, and major titles. This font builds the architecture of the page.

### 3.2 Body & Clarity Font

- **Font:** Inter
- **Weight:** Regular (400)
- **Case:** Standard sentence case.
- **Usage:** All paragraphs (`<p>`), lists, and descriptive text. This font is for readability.

### 3.3 Code & Technical Font

- **Font:** Roboto Mono
- **Weight:** Regular (400)
- **Usage:** Any code snippets or technical annotations.

## 4.0 The Signature Effect: Implementing Light

A core visual motif is that key elements emit light. This is a non-negotiable aspect of the style, achieved via the `text-shadow` CSS property. Every element using an accent color (`Cyan`, `Gold`, `Magenta`) MUST have a corresponding shadow.

### CSS Implementation Examples

**Cyan Glow (for Interactive Elements):**
```css
.cyan-glow {
    color: #00FFFF;
    text-shadow: 0 0 10px #00FFFF, 0 0 15px rgba(0, 255, 255, 0.5);
}
```

**Gold Light (for Headlines):**
```css
.gold-light {
    color: #FFD700;
    text-shadow: 0 0 20px #FFD700, 0 0 30px rgba(255, 215, 0, 0.5);
}
```

**Magenta Pulse (for Emphasis):**
```css
.magenta-pulse {
    color: #FF00FF;
    text-shadow: 0 0 15px #FF00FF, 0 0 25px rgba(255, 0, 255, 0.5);
}
```

## 5.0 Component Styling

This section defines the visual appearance of common UI components.

### 5.1 Buttons

- **Standard Button/Link:**
    - **Appearance:** Uppercase `Space Grotesk` text in `Cyan Glow`.
    - **Decoration:** A `2px` solid `border-bottom` in `Cyan Glow`. No background color.
    - **Interaction:** On hover, the `text-shadow` glow should intensify.

- **Primary Call-to-Action (CTA):**
    - **Appearance:** Uppercase `Space Grotesk` text in `Starlight White`.
    - **Decoration:** A `2px` solid border in `Veridian Green` (`#00FF7F`). A subtle inner and outer `box-shadow` in the same green creates a container glow.
    - **Interaction:** On hover, the glow effect should pulse or intensify.

### 5.2 Text Components

- **Insight Blockquote:**
    - **Appearance:** `Inter` font, `Starlight White` color.
    - **Decoration:** A `4px` solid `border-left` in `Gold Light`.
    - **Spacing:** A padding-left of `20px` separates the text from the border.

- **Jedi Sherpa Narration:**
    - **Appearance:** `Inter` font, `Cyan Glow` color, `italic` style.
    - **Purpose:** This style is reserved exclusively for text attributed to the Jedi Sherpa persona to distinguish it from standard body copy.

### 5.3 Image Frames

- **Artifact Mode:** When an image is presented as a contained "artifact" (e.g., a council member portrait), it must have the following styles:
    - **Border:** `2px solid #00FFFF` (Cyan Glow).
    - **Radius:** `border-radius: 20px`.
    - **Effect:** A `filter: drop-shadow()` effect using the `Cyan Glow` color to make the frame itself appear to emit light.
