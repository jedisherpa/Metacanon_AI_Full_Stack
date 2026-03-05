# MetaCanon Sovereign AI Installer — User Flow

This document describes the user journey through the installer, from launch to completion. Each step corresponds to a specific mockup frame.

## 1. Welcome Screen (`s01_welcome`)

- **Entry Point:** User launches the installer application.
- **Objective:** Present the application and offer two distinct setup paths.
- **User Actions:**
    - **Choose "Quick Setup"**: Proceeds directly to the **Review & Install** screen (Step 7) with all settings pre-configured based on system analysis and recommended defaults.
    - **Choose "Advanced Setup"**: Proceeds sequentially to the **System Check** screen (Step 2).

## 2. System Check (`s02_system_check`)

- **Entry Point:** User selects "Advanced Setup".
- **Objective:** Verify that the user's machine meets the necessary hardware and software requirements.
- **Logic:**
    - The system performs a series of checks (OS, CPU, RAM, Disk, Network, etc.).
    - Each check results in a `PASS`, `WARN`, or `FAIL` state.
    - A `FAIL` state on a critical check (e.g., insufficient RAM) should disable the "Continue" button and provide a clear error message.
    - A `WARN` state (e.g., empty model directory) should display a notification banner but allow the user to proceed.
- **User Actions:**
    - Click "Continue" to proceed to **Compute Selection** (Step 3).

## 3. Compute Selection (`s03_compute`)

- **Objective:** Allow the user to select which AI compute providers they want to enable.
- **Logic:**
    - User can toggle multiple providers ON or OFF.
    - User must select at least one provider to continue.
    - The first provider selected becomes the `Global Default`.
    - The user can change the `Global Default` via the dropdown.
    - The `Fallback Chain` visualization updates in real-time based on the selected providers and their order.
- **User Actions:**
    - Toggle providers.
    - Select a Global Default.
    - Click "Continue" to proceed to **Provider Config** (Step 4).

## 4. Provider Configuration (`s04_provider_cfg`)

- **Objective:** Configure API keys, endpoints, and other settings for each selected provider.
- **Logic:**
    - A tab is displayed for each provider selected in the previous step.
    - Each tab contains a form for the provider's specific settings.
    - Input fields should have validation (e.g., for API key format).
    - The "Test" action should make a lightweight API call to verify credentials and endpoint health, updating the health chip accordingly.
    - A provider with missing or invalid configuration should be marked with an "Unhealthy" or "Config Error" chip.
- **User Actions:**
    - Enter credentials and settings for each provider.
    - Use the "Test" button to verify connections.
    - Click "Save & Continue" to proceed to **Security & Persistence** (Step 5).

## 5. Security & Persistence (`s05_security`)

- **Objective:** Configure how the installer's configuration is saved and secured.
- **Logic:**
    - User selects a local file path for storing configuration snapshots.
    - User can enable/disable snapshot encryption.
    - If encryption is enabled, a passphrase is required.
    - Auto-save options provide convenience.
- **User Actions:**
    - Choose a snapshot path.
    - Configure encryption and auto-save settings.
    - Manually save or load snapshots.
    - Click "Continue" to proceed to **Observability** (Step 6).

## 6. Observability (`s06_observability`)

- **Objective:** Configure logging levels and retention policies.
- **Logic:**
    - The dual-tier logging system is presented.
    - The user can adjust the log retention period using a slider.
    - The user can select the desired log level (e.g., INFO, DEBUG).
- **User Actions:**
    - Adjust retention and log level settings.
    - Click "Continue" to proceed to **Review & Install** (Step 7).

## 7. Review & Install (`s07_review`)

- **Objective:** Present a final summary of all configured settings and initiate the installation.
- **Logic:**
    - The summary panel displays all key decisions made in the previous steps.
    - The system performs a final validation check. If any errors exist (e.g., an unhealthy provider that wasn't fixed), the "Install Now" button should be disabled, and an error message should guide the user to fix the issues.
    - Upon clicking "Install Now", the button becomes disabled, and the install log begins populating in real-time.
- **User Actions:**
    - Review the configuration summary.
    - Click "Install Now" to start the installation.

## 8. Installation Complete (`s08_done`)

- **Entry Point:** The installation process from Step 7 finishes successfully.
- **Objective:** Confirm success and provide next steps.
- **User Actions:**
    - **"Open MetaCanon Dashboard"**: Closes the installer and launches the main application.
    - **"Export Config Snapshot"**: Allows the user to save their setup for backup or sharing.
    - **"View Install Log"**: Opens a detailed, scrollable view of the full installation log.
