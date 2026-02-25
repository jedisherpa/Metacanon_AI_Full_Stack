export default function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-void gap-4">
      <div className="relative w-16 h-16">
        {/* Voxel spinner */}
        <div className="absolute inset-0 border-2 border-forge rounded-sm animate-spin" style={{ animationDuration: '1.5s' }} />
        <div className="absolute inset-2 border border-citadel rounded-sm animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
        <div className="absolute inset-4 bg-forge/20 rounded-sm animate-pulse" />
      </div>
      <div className="text-center">
        <p className="text-forge font-mono text-sm tracking-widest uppercase">Initializing</p>
        <p className="text-white/40 text-xs mt-1">Living Atlas</p>
      </div>
    </div>
  );
}
