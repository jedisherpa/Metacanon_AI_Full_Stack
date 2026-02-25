import { AlertTriangle } from 'lucide-react';

type Props = { message: string };

export default function ErrorScreen({ message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-void gap-4 p-6">
      <AlertTriangle size={40} className="text-red-400" />
      <div className="text-center">
        <p className="text-red-400 font-mono text-sm tracking-widest uppercase">Connection Failed</p>
        <p className="text-white/60 text-xs mt-2 max-w-xs">{message}</p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 px-6 py-2 border border-forge text-forge text-sm font-mono rounded-sm hover:bg-forge/10 transition-colors"
      >
        RETRY
      </button>
    </div>
  );
}
