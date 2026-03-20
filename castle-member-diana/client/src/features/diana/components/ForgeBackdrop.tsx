import { DIANA_MEMBER_CONFIG } from "../config/member";

export function ForgeBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,_rgba(218,165,32,0.12),_transparent_26%),radial-gradient(circle_at_82%_20%,_rgba(64,224,208,0.05),_transparent_22%),radial-gradient(circle_at_50%_78%,_rgba(218,165,32,0.04),_transparent_36%),linear-gradient(180deg,_rgba(12,12,20,0.98),_rgba(8,8,14,1))]" />
      <div
        className="absolute inset-0 bg-cover bg-center opacity-28 saturate-[0.55] contrast-[1.02]"
        style={{ backgroundImage: `url(${DIANA_MEMBER_CONFIG.assets.staticScene})` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(8,8,14,0.14),_rgba(8,8,14,0.58)_52%,_rgba(8,8,14,0.95))]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,_rgba(8,8,14,0.2),_transparent_38%,_rgba(8,8,14,0.28))]" />
      <div className="absolute inset-x-0 bottom-0 h-80 bg-[radial-gradient(circle_at_center,_rgba(218,165,32,0.12),_transparent_60%)] blur-3xl" />
    </div>
  );
}
