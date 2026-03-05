import { AlertTriangle } from 'lucide-react';

type Props = { message: string };

export default function ErrorScreen({ message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
      <div className="territory-card lf-card p-6 border-red-400/40 bg-red-500/10 w-full max-w-sm flex flex-col items-center">
        <AlertTriangle size={36} className="text-red-300" />
        <div className="text-center mt-3">
          <p className="text-red-300 font-mono text-xs tracking-[0.18em] uppercase">Connection Failed</p>
          <p className="text-white/70 text-xs mt-2 max-w-xs">{message}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="lf-button lf-button--primary mt-4 px-6 py-2.5 border border-forge/60 bg-forge/10 text-forge text-sm font-mono rounded-lg hover:bg-forge/15 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
