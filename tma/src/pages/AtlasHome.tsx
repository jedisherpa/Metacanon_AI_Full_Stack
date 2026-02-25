import { useLocation } from 'wouter';
import { Shield, Zap, Radio, Cpu, Trophy, Flame, Star } from 'lucide-react';
import { triggerHaptic } from '../lib/telegram';
import type { AtlasState } from '../lib/api';

type Props = {
  state: AtlasState;
  onStateUpdate: (s: AtlasState) => void;
};

const territories = [
  {
    id: 'citadel',
    path: '/citadel',
    name: 'The Citadel',
    subtitle: 'Governance',
    icon: Shield,
    color: '#F5C842',
    colorClass: 'text-citadel border-citadel',
    glowClass: 'glow-citadel',
    bgClass: 'bg-citadel/10',
    description: 'Propose, vote, and govern the sphere'
  },
  {
    id: 'forge',
    path: '/forge',
    name: 'The Forge',
    subtitle: 'Deliberation',
    icon: Zap,
    color: '#00E5FF',
    colorClass: 'text-forge border-forge',
    glowClass: 'glow-forge',
    bgClass: 'bg-forge/10',
    description: 'Challenge the AI Council. Earn your lens.'
  },
  {
    id: 'hub',
    path: '/hub',
    name: 'The Hub',
    subtitle: 'Transmission',
    icon: Radio,
    color: '#9B59B6',
    colorClass: 'text-hub border-hub',
    glowClass: 'glow-hub',
    bgClass: 'bg-hub/10',
    description: 'Broadcast, sync, and coordinate'
  },
  {
    id: 'engineRoom',
    path: '/engine-room',
    name: 'Engine Room',
    subtitle: 'Infrastructure',
    icon: Cpu,
    color: '#39FF14',
    colorClass: 'text-engine border-engine',
    glowClass: 'glow-engine',
    bgClass: 'bg-engine/10',
    description: 'Monitor systems and deploy constellations'
  }
];

export default function AtlasHome({ state }: Props) {
  const [, navigate] = useLocation();
  const { profile } = state;

  return (
    <div className="flex flex-col h-full scroll-area">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white font-mono text-lg font-semibold tracking-wide">
              LIVING ATLAS
            </h1>
            <p className="text-white/40 text-xs font-mono mt-0.5">
              {profile.firstName} {profile.lastName ?? ''}
              {profile.username ? ` · @${profile.username}` : ''}
            </p>
          </div>
          {/* CXP badge */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 text-citadel">
              <Star size={12} />
              <span className="font-mono text-sm font-bold">{profile.stats.cxpTotal.toLocaleString()}</span>
              <span className="text-white/40 text-xs">CXP</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-white/60 text-xs">
                <Trophy size={10} />
                <span>{profile.stats.gamesWon}W</span>
              </div>
              <div className="flex items-center gap-1 text-orange-400 text-xs">
                <Flame size={10} />
                <span>{profile.stats.currentStreak}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active games banner */}
      {state.activeGames.length > 0 && (
        <div className="flex-shrink-0 mx-4 mt-3 p-3 border border-forge/40 bg-forge/5 rounded-sm">
          <p className="text-forge text-xs font-mono uppercase tracking-wider mb-1">Active Game</p>
          <p className="text-white text-sm truncate">{state.activeGames[0].question}</p>
          <button
            onClick={() => {
              triggerHaptic('impact_medium');
              navigate('/forge');
            }}
            className="mt-2 text-forge text-xs font-mono underline"
          >
            ENTER FORGE →
          </button>
        </div>
      )}

      {/* Territory grid */}
      <div className="flex-1 p-4 grid grid-cols-2 gap-3">
        {territories.map((t) => {
          const Icon = t.icon;
          const territoryData = state.territories[t.id as keyof typeof state.territories];

          return (
            <button
              key={t.id}
              onClick={() => {
                triggerHaptic('impact_medium');
                navigate(t.path);
              }}
              className={`
                relative flex flex-col items-start p-4 rounded-sm border
                ${t.colorClass} ${t.bgClass}
                transition-all active:scale-95
              `}
            >
              {/* Status dot */}
              <div className={`absolute top-2 right-2 w-2 h-2 rounded-full`}
                style={{ backgroundColor: territoryData.status === 'active' ? t.color : '#666' }} />

              <Icon size={24} className="mb-2" style={{ color: t.color }} />
              <p className="text-white font-semibold text-sm leading-tight">{t.name}</p>
              <p className="text-white/50 text-xs mt-0.5">{t.subtitle}</p>
              <p className="text-white/40 text-[10px] mt-2 leading-tight">{t.description}</p>
            </button>
          );
        })}
      </div>

      {/* Earned lenses strip */}
      {profile.earnedLenses.length > 0 && (
        <div className="flex-shrink-0 px-4 pb-4">
          <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-2">
            Earned Lenses ({profile.earnedLenses.length})
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {profile.earnedLenses.map((lensId) => (
              <div
                key={lensId}
                className="flex-shrink-0 w-8 h-8 rounded-sm border border-white/20 bg-white/5 flex items-center justify-center"
              >
                <span className="text-white/60 text-xs font-mono">{lensId}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
