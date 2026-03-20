import { ANNA_MEMBER_CONFIG } from "../config/member";

export function ForgeBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(201,168,76,0.18),_transparent_36%),radial-gradient(circle_at_22%_24%,_rgba(139,30,63,0.22),_transparent_34%),linear-gradient(180deg,_rgba(10,46,54,0.97),_rgba(4,16,20,1))]" />
      <div
        className="absolute inset-0 bg-cover bg-center opacity-45"
        style={{ backgroundImage: `url(${ANNA_MEMBER_CONFIG.assets.staticScene})` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(7,25,32,0.12),_rgba(7,25,32,0.58)_55%,_rgba(4,12,16,0.92))]" />
      <div className="absolute inset-x-0 bottom-0 h-80 bg-[radial-gradient(circle_at_center,_rgba(201,168,76,0.18),_transparent_60%)] blur-3xl" />
    </div>
  );
}
