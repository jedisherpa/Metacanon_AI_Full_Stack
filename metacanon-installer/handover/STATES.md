# MetaCanon Sovereign AI Installer — UI States Reference

This document maps every required UI state to its corresponding mockup and specifies the exact visual treatment for each. Developers should implement all states listed below.

---

## Global States

### Fallback Notification Banner

**Trigger:** The active provider becomes unreachable and the system automatically routes to the next provider in the fallback chain.

**Visual:** A floating notification pill anchored to the bottom of the screen. Amber left border. Text: `Fallback Active: [Provider A] → [Provider B]`. Includes a `View Chain` link and a dismiss `✕` button.

**Shown in:** Observability screen (`s06_observability`).

---

## Provider Card States

| State | Trigger | Visual Treatment |
|---|---|---|
| **Selected** | User toggles provider ON. | Deep green border (`#0A3628`), green "Selected" chip, toggle ON. |
| **Unselected** | Default or user toggles OFF. | Default gray border, no chip, toggle OFF. |
| **Config Error** | Provider is selected but has invalid/missing credentials. | Red border (`#C0392B`), "Config Error" chip (red). |

---

## Input Field States

| State | Trigger | Visual Treatment |
|---|---|---|
| **Default** | Field is empty, unfocused. | Gray border (`#E5E5EA`), placeholder text in `text-muted`. |
| **Focused** | User clicks into the field. | Deep green border (`#0A3628`), standard cursor. |
| **Valid** | Input passes validation. | Deep green border, green checkmark icon on the right. |
| **Error** | Input fails validation or is left empty on submit. | Red border (`#C0392B`), red error message below the field. |

---

## System Check States

| State | Trigger | Visual Treatment |
|---|---|---|
| **Pass** | Check succeeds. | Green chip: `#D4EDDF` background, `#0A3628` text, `✓` icon. |
| **Warn** | Check passes with a non-critical issue. | Amber chip: `#FEF3C7` background, `#B45309` text, `⚠` icon. |
| **Fail** | Check fails critically. | Red chip: `#FADBD8` background, `#C0392B` text, `✕` icon. Disables "Continue" button. |

---

## Install States

### Pre-Install

The "Install Now" button is enabled (primary green). The install log panel is empty or shows a "Ready to install" message.

### In-Progress Install

**Trigger:** User clicks "Install Now".

**Visual Treatment:**
- "Install Now" button becomes disabled with a loading spinner and label "Installing…".
- "Back" button is disabled.
- The install log panel begins populating with real-time log entries.
- A progress bar below the log console fills incrementally.

**Shown in:** Review & Install screen (`s07_review`).

### Install Complete

**Trigger:** All installation steps finish successfully.

**Visual Treatment:** The wizard transitions to the Done screen (`s08_done`). A success hexagon mark is displayed. All action buttons are enabled.

---

## Validation Error State

**Trigger:** User attempts to proceed from the Review screen but one or more providers have configuration errors.

**Visual Treatment:** An error banner appears at the top of the Config Summary panel: `[N] errors found — [Provider] API key missing`. The "Install Now" button is disabled. The banner includes a "Fix Issues" link that navigates the user back to the Provider Config screen for the affected provider.

**Shown in:** Review & Install screen (`s07_review`).

---

## Health Chip States

| State | Visual |
|---|---|
| **Healthy** | Green dot + "Healthy" label. |
| **Unhealthy** | Red dot + "Unhealthy" label. |
| **Missing API Key** | Red chip "Invalid / Missing". |
| **In Progress** | Pulsing green dot + "Checking…" label. |
| **Untested** | Gray dot + "Not tested" label. |
