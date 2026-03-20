import { LIANA_MEMBER_CONFIG } from "../config/member";

export function ForgeBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(214,179,95,0.18),_transparent_28%),radial-gradient(circle_at_18%_22%,_rgba(83,183,176,0.14),_transparent_34%),radial-gradient(circle_at_82%_16%,_rgba(83,183,176,0.12),_transparent_28%),linear-gradient(180deg,_rgba(18,24,44,0.86),_rgba(8,12,24,0.96)_44%,_rgba(7,9,19,1))]" />
      <div
        className="absolute inset-0 bg-cover bg-center opacity-24"
        style={{ backgroundImage: `url(${LIANA_MEMBER_CONFIG.assets.staticScene})` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(7,9,19,0.12),_rgba(7,9,19,0.64)_56%,_rgba(7,9,19,0.94))]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,_rgba(246,241,222,0.05)_1px,_transparent_1px),linear-gradient(180deg,_rgba(246,241,222,0.04)_1px,_transparent_1px)] bg-[size:96px_96px] opacity-12" />
      <div className="absolute inset-x-0 bottom-0 h-80 bg-[radial-gradient(circle_at_center,_rgba(214,179,95,0.14),_transparent_60%)] blur-3xl" />
    </div>
  );
}
