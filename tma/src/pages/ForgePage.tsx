import { useState, useEffect } from 'react';
import { Zap, BookOpen, Dumbbell, Eye, ChevronRight, Sparkles } from 'lucide-react';
import { api, type Passport, type Lens, type UserProfile } from '../lib/api';
import { triggerHaptic } from '../lib/telegram';

type Props = { profile: UserProfile };

type Tab = 'passport' | 'lenses' | 'drill';

export default function ForgePage({ profile }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('passport');
  const [passport, setPassport] = useState<Passport | null>(null);
  const [allLenses, setAllLenses] = useState<Lens[]>([]);
  const [loading, setLoading] = useState(true);
  const [drillQuestion, setDrillQuestion] = useState('');
  const [drillResult, setDrillResult] = useState<{ hint: string; lensName: string } | null>(null);
  const [drilling, setDrilling] = useState(false);
  const [selectedLensId, setSelectedLensId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getPassport(), api.getLenses()])
      .then(([p, l]) => {
        setPassport(p.passport);
        setAllLenses(l.lenses);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleDrill() {
    if (!drillQuestion.trim()) return;
    setDrilling(true);
    setDrillResult(null);
    try {
      const r = await api.runDrill({ question: drillQuestion, lensId: selectedLensId ?? undefined }) as any;
      triggerHaptic(r.hapticTrigger);
      setDrillResult(r.drill);
    } catch (e) {
      console.error(e);
    } finally {
      setDrilling(false);
    }
  }

  const tabs: { id: Tab; icon: typeof Zap; label: string }[] = [
    { id: 'passport', icon: BookOpen, label: 'Passport' },
    { id: 'lenses', icon: Eye, label: 'Lenses' },
    { id: 'drill', icon: Dumbbell, label: 'Drill' }
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-4 pb-3 border-b border-forge/30">
        <Zap size={18} className="text-forge" />
        <h2 className="text-forge font-mono font-semibold tracking-wide">THE FORGE</h2>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-white/10">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => { triggerHaptic('selection'); setActiveTab(id); }}
            className={`
              flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono transition-colors
              ${activeTab === id ? 'text-forge border-b-2 border-forge' : 'text-white/40 hover:text-white/70'}
            `}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 scroll-area">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border border-forge rounded-sm animate-spin" />
          </div>
        )}

        {/* Passport tab */}
        {!loading && activeTab === 'passport' && passport && (
          <div className="p-4 space-y-4">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Games Played', value: passport.stats.gamesPlayed },
                { label: 'Games Won', value: passport.stats.gamesWon },
                { label: 'CXP Total', value: passport.stats.cxpTotal.toLocaleString() },
                { label: 'Streak', value: passport.stats.currentStreak }
              ].map(({ label, value }) => (
                <div key={label} className="border border-forge/30 bg-forge/5 rounded-sm p-3">
                  <p className="text-forge text-lg font-mono font-bold">{value}</p>
                  <p className="text-white/50 text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Earned lenses */}
            <div>
              <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-2">
                Earned Lenses ({passport.earnedLenses.length})
              </p>
              {passport.earnedLenses.length === 0 ? (
                <div className="border border-white/10 rounded-sm p-4 text-center">
                  <Sparkles size={24} className="text-white/20 mx-auto mb-2" />
                  <p className="text-white/40 text-xs">Win deliberations to earn lenses</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {passport.earnedLenses.map((lens) => (
                    <div
                      key={lens.id}
                      className="flex items-center gap-3 border border-white/10 rounded-sm p-3"
                      style={{ borderColor: `${lens.color.hex}40` }}
                    >
                      <div
                        className="w-8 h-8 rounded-sm flex items-center justify-center text-xs font-mono font-bold flex-shrink-0"
                        style={{ backgroundColor: `${lens.color.hex}20`, color: lens.color.hex }}
                      >
                        {lens.id}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium">{lens.name}</p>
                        <p className="text-white/50 text-xs truncate">{lens.epistemology}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lenses tab */}
        {!loading && activeTab === 'lenses' && (
          <div className="p-4 space-y-2">
            <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-3">
              Council of Twelve — All Lenses
            </p>
            {allLenses.map((lens) => {
              const isEarned = profile.earnedLenses.includes(lens.id);
              const isActive = profile.activeLensId === lens.id;
              return (
                <div
                  key={lens.id}
                  className={`flex items-center gap-3 border rounded-sm p-3 transition-colors ${
                    isActive ? 'border-forge bg-forge/10' : 'border-white/10 bg-void-light'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-sm flex items-center justify-center text-sm font-mono font-bold flex-shrink-0"
                    style={{ backgroundColor: `${lens.color.hex}20`, color: lens.color.hex }}
                  >
                    {lens.id.padStart(2, '0')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-medium">{lens.name}</p>
                      {isEarned && (
                        <span className="text-[9px] font-mono text-forge border border-forge/50 px-1 rounded-sm">EARNED</span>
                      )}
                      {isActive && (
                        <span className="text-[9px] font-mono text-citadel border border-citadel/50 px-1 rounded-sm">ACTIVE</span>
                      )}
                    </div>
                    <p className="text-white/50 text-xs truncate">{lens.epistemology}</p>
                    <p className="text-white/30 text-[10px] capitalize">{lens.family}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Drill tab */}
        {!loading && activeTab === 'drill' && (
          <div className="p-4 space-y-4">
            <p className="text-white/60 text-xs">
              Practice deliberating on any question with a lens of your choice.
            </p>

            {/* Lens selector */}
            <div>
              <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-2">Select Lens</p>
              <div className="grid grid-cols-4 gap-2">
                {allLenses.slice(0, 12).map((lens) => (
                  <button
                    key={lens.id}
                    onClick={() => { triggerHaptic('selection'); setSelectedLensId(lens.id); }}
                    className={`
                      aspect-square rounded-sm flex items-center justify-center text-xs font-mono font-bold border transition-all
                      ${selectedLensId === lens.id ? 'border-forge scale-105' : 'border-white/20'}
                    `}
                    style={{
                      backgroundColor: selectedLensId === lens.id ? `${lens.color.hex}30` : `${lens.color.hex}10`,
                      color: lens.color.hex
                    }}
                    title={lens.name}
                  >
                    {lens.id.padStart(2, '0')}
                  </button>
                ))}
              </div>
              {selectedLensId && (
                <p className="text-white/50 text-xs mt-1">
                  {allLenses.find((l) => l.id === selectedLensId)?.name}
                </p>
              )}
            </div>

            {/* Question input */}
            <div>
              <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-2">Question</p>
              <textarea
                value={drillQuestion}
                onChange={(e) => setDrillQuestion(e.target.value)}
                placeholder="Enter a question to deliberate on..."
                rows={3}
                className="w-full bg-void-light border border-white/20 text-white text-sm px-3 py-2 rounded-sm outline-none focus:border-forge/60 resize-none"
              />
            </div>

            <button
              onClick={handleDrill}
              disabled={drilling || !drillQuestion.trim()}
              className="w-full bg-forge text-void font-mono text-sm py-3 rounded-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {drilling ? (
                <>
                  <div className="w-4 h-4 border-2 border-void/40 border-t-void rounded-full animate-spin" />
                  THINKING...
                </>
              ) : (
                <>
                  <Dumbbell size={16} />
                  RUN DRILL
                </>
              )}
            </button>

            {/* Drill result */}
            {drillResult && (
              <div className="border border-forge/40 bg-forge/5 rounded-sm p-4">
                <p className="text-forge text-xs font-mono uppercase tracking-wider mb-2">
                  {drillResult.lensName} says:
                </p>
                <p className="text-white text-sm leading-relaxed">{drillResult.hint}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
