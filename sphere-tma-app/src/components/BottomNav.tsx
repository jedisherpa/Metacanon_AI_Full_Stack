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
    <nav className="lf-bottom-nav flex items-center justify-around bg-void-mid/88 backdrop-blur-lg border-t border-white/12 safe-bottom px-2 py-2 flex-shrink-0 shadow-[0_-10px_36px_rgba(0,0,0,0.45)]">
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
              lf-bottom-nav__item ${isActive ? 'lf-bottom-nav__item--active' : ''}
              flex flex-col items-center gap-0.5 px-3.5 py-2.5 rounded-xl transition-all min-w-14
              ${isActive
                ? `${color} bg-white/12 ring-1 ring-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_6px_16px_rgba(0,0,0,0.25)]`
                : 'text-white/45 hover:text-white/75'}
            `}
          >
            <div className="relative">
              <Icon className="lf-bottom-nav__item-icon" size={20} strokeWidth={isActive ? 2.6 : 1.7} />
              {badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4.5 h-4.5 flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span className={`text-xs font-semibold tracking-[0.03em] ${isActive ? 'opacity-100' : 'opacity-70'}`}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
