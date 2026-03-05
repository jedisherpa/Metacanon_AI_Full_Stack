export default function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-2 border-forge/70 rounded-xl animate-spin" style={{ animationDuration: '1.5s' }} />
        <div
          className="absolute inset-2 border border-citadel/70 rounded-xl animate-spin"
          style={{ animationDuration: '2s', animationDirection: 'reverse' }}
        />
        <div className="absolute inset-4 bg-forge/20 rounded-lg animate-pulse" />
      </div>
      <div className="text-center territory-card lf-card px-4 py-3 border-forge/25 bg-forge/5">
        <p className="text-forge font-mono text-xs tracking-[0.18em] uppercase">Initializing</p>
        <p className="text-white/75 text-sm mt-1">Connecting to Living Atlas</p>
      </div>
    </div>
  );
}
