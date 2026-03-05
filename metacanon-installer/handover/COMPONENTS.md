# MetaCanon Sovereign AI Installer — Component Reference

This document specifies every reusable UI component in the installer. Each entry covers its visual states, props, and behavioral notes.

---

## Stepper

The vertical stepper lives in the left sidebar and tracks the user's progress through the 7-step wizard.

| State | Visual |
|---|---|
| Completed | Green circle (`#0A3628`) with white checkmark icon. Label in `text-muted`. |
| Active | Filled green circle (`#0A3628`). Label in `text-primary`, `font-weight: 600`. |
| Future | Empty gray circle (`border: 2px solid #E5E5EA`). Label in `text-muted`. |

**Props:** `steps: string[]`, `currentStep: number`

---

## Provider Card

Used in the Compute Selection screen. Each card represents one AI provider.

| State | Visual |
|---|---|
| Selected | White surface, `2px solid #0A3628` border. Toggle is ON (green). "Selected" chip visible. |
| Unselected | White surface, `1px solid #E5E5EA` border. Toggle is OFF (gray). |
| Error | White surface, `2px solid #C0392B` border. "Config Error" chip (red). |

**Props:** `name: string`, `type: string`, `models: string[]`, `isSelected: boolean`, `hasError: boolean`

---

## Health Chip

A small, pill-shaped status indicator.

| Variant | Background | Text | Icon |
|---|---|---|---|
| `pass` | `#D4EDDF` | `#0A3628` | ✓ |
| `warn` | `#FEF3C7` | `#B45309` | ⚠ |
| `fail` | `#FADBD8` | `#C0392B` | ✕ |
| `healthy` | `#D4EDDF` | `#0A3628` | Green dot |
| `unhealthy` | `#FADBD8` | `#C0392B` | Red dot |
| `in-progress` | `#D4EDDF` | `#0A3628` | Pulsing green dot |

**Props:** `variant: 'pass' | 'warn' | 'fail' | 'healthy' | 'unhealthy' | 'in-progress'`, `label: string`

---

## Secret Input

A text input for sensitive values like API keys.

- **Default State:** Standard border (`#E5E5EA`), placeholder text.
- **Valid State:** Green border (`#0A3628`), eye icon to toggle visibility, lock icon on the left.
- **Error State:** Red border (`#C0392B`), error message below the field in `accent-red`.
- **Masked:** Value displayed as `••••••••` by default.

**Props:** `label: string`, `value: string`, `isValid: boolean`, `errorMessage?: string`

---

## Path Picker

A compound input for selecting a local file system path.

- Displays the current path in `IBM Plex Mono` font.
- A "Browse…" pill button on the right opens the native OS file picker.
- Below the input, shows a status line: `✓ Path writable` (green) or `✕ Path not found` (red).

**Props:** `label: string`, `path: string`, `isValid: boolean`

---

## Status Banner

A full-width notification banner for system-level messages.

| Variant | Left Border | Background | Icon |
|---|---|---|---|
| `warning` | `#B45309` | `#FEF3C7` | ⚠ |
| `error` | `#C0392B` | `#FADBD8` | ✕ |
| `info` | `#1E4A7A` | `#EBF4FF` | ℹ |
| `success` | `#0A3628` | `#D4EDDF` | ✓ |

**Props:** `variant: 'warning' | 'error' | 'info' | 'success'`, `message: string`, `action?: { label: string, onClick: () => void }`, `onDismiss?: () => void`

---

## Log Console

A dark, scrollable terminal-style panel for displaying install and system logs.

- **Background:** `#1C1C1E`
- **Text:** `IBM Plex Mono`, `13px`, `#4ADE80` (green)
- **Log Levels:** `[INFO]` (green), `[WARN]` (amber), `[ERROR]` (red), `[✓]` (green), `[⟳]` (blue)
- **Behavior:** Auto-scrolls to the latest entry. New lines appear with a 100ms fade-in.

**Props:** `logs: LogEntry[]`, `maxHeight?: string`

---

## Buttons

| Variant | Style | Use Case |
|---|---|---|
| `primary` | Deep Green fill (`#0A3628`), white text, pill shape. | Main CTAs: "Install Now", "Continue". |
| `secondary` | White fill, `1px solid #E5E5EA` border, dark text, pill shape. | Secondary actions: "Test Connection", "Browse". |
| `ghost` | No fill, no border, `text-muted`. | Tertiary actions: "Back", "View Log". |
| `destructive-ghost` | No fill, no border, `accent-red` text. | Dangerous actions: "Cancel Install". |
| `disabled` | Muted fill (`#E5E5EA`), muted text. Applied to any variant. | Any action that is not currently available. |

**Props:** `variant: 'primary' | 'secondary' | 'ghost' | 'destructive-ghost'`, `label: string`, `isDisabled?: boolean`, `isLoading?: boolean`

---

## Progress Bar

A thin, horizontal progress indicator.

- **Track:** `#E5E5EA`, `4px` height, `9999px` border-radius.
- **Fill:** `#0A3628` (Deep Forest Green).
- **Animation:** Linear fill, `300ms` per step.

**Props:** `value: number` (0–100), `label?: string`

---

## Toggle Switch

An Apple-style toggle for boolean settings.

- **ON State:** Green fill (`#0A3628`), knob slides to the right.
- **OFF State:** Gray fill (`#E5E5EA`), knob is on the left.
- **Transition:** `200ms ease-in-out`.

**Props:** `isOn: boolean`, `onChange: (value: boolean) => void`, `label: string`
