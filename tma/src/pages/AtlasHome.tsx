import { useLocation } from 'wouter';
import { Shield, Zap, Radio, Cpu, Trophy, Flame, Star, Terminal, ArrowUpRight, Sparkles } from 'lucide-react';
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
  const stats = [
    { id: 'cxp', label: 'CXP', value: profile.stats.cxpTotal.toLocaleString(), icon: Star, tone: 'text-citadel' },
    { id: 'wins', label: 'Wins', value: String(profile.stats.gamesWon), icon: Trophy, tone: 'text-forge' },
    { id: 'streak', label: 'Streak', value: String(profile.stats.currentStreak), icon: Flame, tone: 'text-orange-300' }
  ];

  return (
    <div className="flex flex-col h-full scroll-area px-4 pb-7">
      <div className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-forge/90 text-xs font-mono tracking-[0.2em] uppercase">Lensforge Runtime</p>
            <h1 className="text-white text-3xl font-semibold tracking-tight mt-1 leading-none">Living Atlas</h1>
            <p className="text-white/70 text-sm mt-2">
              {profile.firstName}
              {profile.lastName ? ` ${profile.lastName}` : ''}
              {profile.username ? ` · @${profile.username}` : ''}
            </p>
            <p className="text-white/50 text-sm mt-1">Command center for deliberation, governance, and agent operations.</p>
          </div>
          <div className="lf-status-badge lf-status-badge--active rounded-full border border-white/25 bg-white/8 px-3.5 py-1.5 text-xs text-white/75 font-mono mt-0.5">
            Online
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="territory-card lf-card p-3.5">
              <div className={`flex items-center gap-1.5 ${item.tone} opacity-90`}>
                <Icon size={15} />
                <span className="text-xs font-mono uppercase tracking-wider">{item.label}</span>
              </div>
              <p className="text-white text-xl font-semibold leading-tight mt-1.5">{item.value}</p>
            </div>
          );
        })}
      </div>

      <div className="territory-card lf-card mt-4 p-4 border-engine/45 bg-gradient-to-r from-engine/20 via-engine/7 to-transparent">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-engine text-xs font-mono uppercase tracking-[0.2em]">Command Deck</p>
            <p className="text-white text-lg mt-1 font-semibold leading-tight">Run Open Claw + 49 shared operations</p>
            <p className="text-white/65 text-sm mt-1.5">Connect your API key and coordinate agents in one thread.</p>
          </div>
          <Terminal size={20} className="text-engine mt-0.5" />
        </div>
        <button
          onClick={() => {
            triggerHaptic('impact_medium');
            navigate('/open-claw?command=open_claw');
          }}
          className="lf-button lf-button--secondary mt-3.5 w-full rounded-xl border border-engine/55 bg-engine/15 px-3 py-2.5 text-engine text-sm font-mono tracking-wide flex items-center justify-center gap-1.5"
        >
          Open Command Console <ArrowUpRight size={13} />
        </button>
      </div>

      {state.activeGames.length > 0 && (
        <div className="territory-card lf-card mt-4 p-4 border-forge/45 bg-forge/12">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-forge text-xs font-mono uppercase tracking-[0.2em]">Active Cycle</p>
              <p className="text-white text-base mt-1.5 line-clamp-2 leading-snug">{state.activeGames[0].question}</p>
            </div>
            <Sparkles size={18} className="text-forge mt-0.5" />
          </div>
          <button
            onClick={() => {
              triggerHaptic('impact_medium');
              navigate('/forge');
            }}
            className="lf-button lf-button--secondary mt-3.5 w-full rounded-xl border border-forge/55 bg-forge/15 px-3 py-2.5 text-forge text-sm font-mono tracking-wide"
          >
            Continue In Forge
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mt-6 mb-3">
        <h2 className="text-white text-xl font-semibold tracking-wide">Sectors Station</h2>
        <p className="text-white/65 text-sm font-mono uppercase tracking-wider">Tap to enter</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {territories.map((t) => {
          const Icon = t.icon;
          const territoryData = state.territories[t.id as keyof typeof state.territories];
          const pendingVotes = 'pendingVotes' in territoryData ? territoryData.pendingVotes : undefined;
          const activeGames = 'activeGames' in territoryData ? territoryData.activeGames : undefined;
          const pendingEscalations = 'pendingEscalations' in territoryData ? territoryData.pendingEscalations : undefined;
          let metricLabel = 'Status';
          let metricValue = territoryData.status;
          if (t.id === 'citadel') {
            metricLabel = 'Pending Votes';
            metricValue = String(pendingVotes ?? 0);
          } else if (t.id === 'forge') {
            metricLabel = 'Active Games';
            metricValue = String(activeGames ?? 0);
          } else if (t.id === 'hub') {
            metricLabel = 'Escalations';
            metricValue = String(pendingEscalations ?? 0);
          }

          return (
            <button
              key={t.id}
              onClick={() => {
                triggerHaptic('impact_medium');
                navigate(t.path);
              }}
              className={`territory-card lf-card relative flex flex-col items-start p-4 lg:p-5 ${t.colorClass} ${t.bgClass} text-left border ${t.colorClass}/35`}
            >
              <div
                className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: territoryData.status === 'active' ? t.color : '#6d7b95' }}
              />

              <Icon size={28} className="mb-3.5" style={{ color: t.color }} />
              <p className="text-white font-semibold text-xl leading-tight">{t.name}</p>
              <p className="text-white/75 text-sm mt-1 uppercase tracking-wide font-mono">{t.subtitle}</p>
              <p className="text-white/68 text-sm mt-2.5 leading-relaxed">{t.description}</p>
              <div className="mt-4 w-full flex items-center justify-between border-t border-white/12 pt-2.5">
                <span className="text-xs text-white/60 uppercase tracking-[0.14em] font-mono">{metricLabel}</span>
                <span className="text-base font-mono font-semibold text-white">{metricValue}</span>
              </div>
            </button>
          );
        })}
      </div>

      {profile.earnedLenses.length > 0 && (
        <div className="mt-4">
          <p className="text-white/45 text-xs font-mono uppercase tracking-wider mb-2">
            Earned Lenses ({profile.earnedLenses.length})
          </p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {profile.earnedLenses.map((lensId) => (
              <div
                key={lensId}
                className="lf-status-badge flex-shrink-0 px-2.5 h-8 rounded-lg border border-white/20 bg-white/5 flex items-center justify-center"
              >
                <span className="text-white/75 text-[11px] font-mono">{lensId}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
