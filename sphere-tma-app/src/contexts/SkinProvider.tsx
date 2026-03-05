/**
 * LensForge Skin Runtime — SkinProvider + useSkin hook
 *
 * Architecture: SkinProvider applies data-skin to the root div.
 * All lf-* component classes resolve from this single ancestor.
 * No per-component data-skin wrappers needed.
 *
 * Toggle: setSkin() changes the data-skin attribute only.
 * All three skins' CSS is loaded at startup (your index.css imports them).
 * No JavaScript token injection. No dynamic stylesheet loading.
 *
 * URL: ?skin=aethel|cypher|obsidian — persisted to localStorage.
 *
 * Mobile: setSkin() also dispatches a 'lf:skin-switched' CustomEvent on window
 * so layout components (e.g. a mobile sidebar) can react without prop drilling.
 *
 * SKINS constant and SkinMeta type live in ../skins/index.ts.
 * This file only exports the React provider and hook to satisfy
 * Vite Fast Refresh (context files must only export components/hooks).
 *
 * Usage:
 *   // 1. Import all three skin CSS files in your app entry point:
 *   //    import './skins/base/components.css';
 *   //    import './skins/aethel/aethel.css';
 *   //    import './skins/cypher/cypher.css';
 *   //    import './skins/obsidian/obsidian.css';
 *
 *   // 2. Wrap your app:
 *   //    <SkinProvider><App /></SkinProvider>
 *
 *   // 3. Use the hook anywhere inside:
 *   //    const { activeSkin, setSkin } = useSkin();
 */

import React, { createContext, useContext, useState } from 'react';
import { type SkinId, type SkinMeta, SKINS, VALID_SKINS } from '../skins/index';

interface SkinContextValue {
  /** The currently active skin identifier. */
  activeSkin: SkinId;
  /** Full metadata object for the active skin. */
  activeMeta: SkinMeta;
  /** Switch to a different skin. Updates URL param and localStorage. */
  setSkin: (id: SkinId) => void;
}

const SkinContext = createContext<SkinContextValue | null>(null);

function resolveInitialSkin(): SkinId {
  const url = new URLSearchParams(window.location.search).get('skin') as SkinId | null;
  if (url && VALID_SKINS.includes(url)) return url;
  const stored = localStorage.getItem('lf-active-skin') as SkinId | null;
  if (stored && VALID_SKINS.includes(stored)) return stored;
  return 'aethel';
}

export function SkinProvider({ children }: { children: React.ReactNode }) {
  const [activeSkin, setActiveSkin] = useState<SkinId>(resolveInitialSkin);

  const setSkin = (id: SkinId) => {
    setActiveSkin(id);
    localStorage.setItem('lf-active-skin', id);
    // Sync URL param so the skin is shareable / bookmarkable
    const url = new URL(window.location.href);
    url.searchParams.set('skin', id);
    window.history.replaceState({}, '', url.toString());
    // Notify layout components (e.g. mobile sidebar) without prop drilling
    window.dispatchEvent(new CustomEvent('lf:skin-switched', { detail: { skin: id } }));
  };

  const activeMeta = SKINS.find(s => s.id === activeSkin)!;

  return (
    <SkinContext.Provider value={{ activeSkin, activeMeta, setSkin }}>
      {/*
        data-skin on root div — all lf-* classes resolve from this single ancestor.
        Do NOT add data-skin to individual components; this is the only place it lives.
      */}
      <div data-skin={activeSkin} className="lf-skin-root" style={{ minHeight: '100vh' }}>
        {children}
      </div>
    </SkinContext.Provider>
  );
}

export function useSkin() {
  const ctx = useContext(SkinContext);
  if (!ctx) throw new Error('useSkin must be used within <SkinProvider>');
  return ctx;
}
