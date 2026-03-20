import { DIANA_MEMBER_CONFIG } from "../config/member";

export function ForgeBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(201,168,76,0.2),_transparent_34%),radial-gradient(circle_at_22%_24%,_rgba(75,0,130,0.28),_transparent_36%),radial-gradient(circle_at_78%_18%,_rgba(139,0,0,0.12),_transparent_28%),linear-gradient(180deg,_rgba(44,0,62,0.98),_rgba(26,0,51,1))]" />
      <div
        className="absolute inset-0 bg-cover bg-center opacity-45"
        style={{ backgroundImage: `url(${DIANA_MEMBER_CONFIG.assets.staticScene})` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(26,0,51,0.1),_rgba(26,0,51,0.62)_55%,_rgba(19,0,33,0.94))]" />
      <div className="absolute inset-x-0 bottom-0 h-80 bg-[radial-gradient(circle_at_center,_rgba(201,168,76,0.18),_transparent_60%)] blur-3xl" />
    </div>
  );
}
