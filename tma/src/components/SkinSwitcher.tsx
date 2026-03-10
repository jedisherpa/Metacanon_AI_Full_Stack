/**
 * LensForge SkinSwitcher — Three-way toggle component
 *
 * Renders three buttons. Clicking any button calls setSkin() from SkinProvider.
 * The active skin gets the .lf-skin-switcher__btn--active class.
 * All styling is handled by base/components.css + the active skin's tokens.
 *
 * Two layout variants:
 *   - "header"  (default) — horizontal pill row for desktop header / top bar
 *   - "sidebar" — vertical stacked list for sidebar navigation panels
 *   - "bottom"  — fixed bottom bar for mobile (position: fixed, full-width)
 *
 * Usage:
 *   <SkinSwitcher />                        // header variant (default)
 *   <SkinSwitcher variant="sidebar" />      // sidebar variant
 *   <SkinSwitcher variant="bottom" />       // mobile bottom bar
 *
 * Place anywhere inside <SkinProvider>.
 *
 * Responsive behaviour:
 *   The "header" variant is inline and compact.
 *   Use the "bottom" variant for a fixed mobile-only switcher if needed.
 */

import { useSkin } from '../contexts/SkinProvider';
import { SKINS } from '../skins/index';
import type { SkinId } from '../skins/index';

interface SkinSwitcherProps {
  /** Layout variant. Defaults to "header". */
  variant?: 'header' | 'sidebar' | 'bottom';
}

export function SkinSwitcher({ variant = 'header' }: SkinSwitcherProps) {
  const { activeSkin, setSkin } = useSkin();

  const handleSwitch = (id: SkinId) => {
    setSkin(id);
    // Close any open mobile sidebar by dispatching a custom event.
    // The SkinProvider or layout component can listen for this.
    window.dispatchEvent(new CustomEvent('lf:skin-switched', { detail: { skin: id } }));
  };

  return (
    <div
      className={`lf-skin-switcher lf-skin-switcher--${variant}`}
      role="group"
      aria-label="Select skin"
    >
      {SKINS.map(s => (
        <button
          key={s.id}
          className={`lf-skin-switcher__btn${activeSkin === s.id ? ' lf-skin-switcher__btn--active' : ''}`}
          onClick={() => handleSwitch(s.id)}
          aria-pressed={activeSkin === s.id}
          title={s.philosophy}
        >
          <span className="lf-skin-switcher__label">{s.name}</span>
          {variant === 'sidebar' && (
            <span className="lf-skin-switcher__sub">{s.tagline}</span>
          )}
        </button>
      ))}
    </div>
  );
}
