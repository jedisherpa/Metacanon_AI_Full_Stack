import { useLocation } from 'wouter';
import { Shield, Zap, Radio, Cpu, Map } from 'lucide-react';
import { triggerHaptic } from '../lib/telegram';

type Territory = { status: string; pendingVotes?: number; activeGames?: number; pendingEscalations?: number };

type Props = {
  territories: {
    citadel: Territory;
    forge: Territory;
    hub: Territory;
    engineRoom: Territory;
  };
};

const tabs = [
  { path: '/', icon: Map, label: 'Atlas', color: 'text-white' },
  { path: '/citadel', icon: Shield, label: 'Citadel', color: 'text-citadel' },
  { path: '/forge', icon: Zap, label: 'Forge', color: 'text-forge' },
  { path: '/hub', icon: Radio, label: 'Hub', color: 'text-hub' },
  { path: '/engine-room', icon: Cpu, label: 'Engine', color: 'text-engine' }
];

export default function BottomNav({ territories }: Props) {
  const [location, navigate] = useLocation();

  const badges: Record<string, number> = {
    '/citadel': territories.citadel.pendingVotes ?? 0,
    '/forge': territories.forge.activeGames ?? 0,
    '/hub': territories.hub.pendingEscalations ?? 0
  };

  return (
    <nav className="flex items-center justify-around bg-void-mid border-t border-white/10 safe-bottom px-2 py-1 flex-shrink-0">
      {tabs.map(({ path, icon: Icon, label, color }) => {
        const isActive = location === path;
        const badge = badges[path] ?? 0;

        return (
          <button
            key={path}
            onClick={() => {
              triggerHaptic('selection');
              navigate(path);
            }}
            className={`
              flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-all
              ${isActive ? `${color} bg-white/5` : 'text-white/40 hover:text-white/70'}
            `}
          >
            <div className="relative">
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
              {badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-medium ${isActive ? 'opacity-100' : 'opacity-60'}`}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
