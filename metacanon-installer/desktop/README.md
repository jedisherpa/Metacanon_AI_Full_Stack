# MetaCanon Installer Desktop (Tauri + React)

This is a real desktop installer shell wired to the Rust runtime command surface in `src/ui.rs`.
The visual system is the **MetaCanon Fractal UI** handover (Light/Void themes).

## What is implemented

- 8-step installer wizard UI matching the MetaCanon Fractal handover flow.
- Runtime theme toggle (`light` / `void`) persisted with `localStorage`.
- Native Tauri command bridge in `src-tauri/src/main.rs`.
- Direct calls into `metacanon_ai::ui` runtime commands for:
  - system check
  - compute selection
  - provider config
  - security + persistence
  - observability
  - review + install smoke test
- Provider config forms for all providers:
  - `qwen_local`, `ollama`, `morpheus`
  - `openai`, `anthropic`, `moonshot_kimi`, `grok`

## Prerequisites (macOS)

1. Rust toolchain (`cargo`, `rustc`) and Xcode Command Line Tools.
2. Node.js 20+ and npm.
3. Internet access for first dependency install (`npm install`, crate index fetch).

## Run

```bash
cd "/Users/paulcooper/Documents/Codex Master Folder/installer-ui/desktop"
npm install
npm run tauri:dev
```

## Project layout

- Frontend app: `/Users/paulcooper/Documents/Codex Master Folder/installer-ui/desktop/src`
- Tauri backend: `/Users/paulcooper/Documents/Codex Master Folder/installer-ui/desktop/src-tauri`
- Runtime library it calls: `/Users/paulcooper/Documents/Codex Master Folder/src/ui.rs`
- Fractal handover assets: `/Users/paulcooper/Documents/Codex Master Folder/installer-ui/metacanon-fractal-handover`

## Notes

- The desktop app auto-loads/saves runtime snapshot at `~/.metacanon_ai/runtime_snapshot.json`.
- Default fallback chain remains active -> qwen_local -> ollama -> cloud priority.
- For production bundle output, run:

```bash
/Users/paulcooper/Documents/Codex Master Folder/scripts/build_installer_desktop.sh
```
