import { useState, useEffect } from 'react';
import { Cpu, Activity, Database, BookOpen, List } from 'lucide-react';
import { api } from '../lib/api';
import { triggerHaptic } from '../lib/telegram';

type Tab = 'status' | 'db' | 'glossary' | 'constellations';

export default function EngineRoomPage() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const [status, setStatus] = useState<any>(null);
  const [dbHealth, setDbHealth] = useState<any>(null);
  const [glossary, setGlossary] = useState<any[]>([]);
  const [constellations, setConstellations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    if (activeTab === 'status') {
      Promise.all([api.getStatusAll(), api.getDbHealth()])
        .then(([s, d]: any[]) => { setStatus(s.status); setDbHealth(d); setLoading(false); })
        .catch(() => setLoading(false));
    } else if (activeTab === 'db') {
      api.getDbHealth().then((r: any) => { setDbHealth(r); setLoading(false); }).catch(() => setLoading(false));
    } else if (activeTab === 'glossary') {
      api.getGlossary().then((r: any) => { setGlossary(r.glossary ?? []); setLoading(false); }).catch(() => setLoading(false));
    } else if (activeTab === 'constellations') {
      api.listConstellations().then((r: any) => { setConstellations(r.constellations ?? []); setLoading(false); }).catch(() => setLoading(false));
    }
  }, [activeTab]);

  const tabs: { id: Tab; icon: typeof Cpu; label: string }[] = [
    { id: 'status', icon: Activity, label: 'Status' },
    { id: 'db', icon: Database, label: 'DB' },
    { id: 'glossary', icon: BookOpen, label: 'Glossary' },
    { id: 'constellations', icon: List, label: 'Constellations' }
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-4 pb-3 border-b border-engine/30">
        <Cpu size={18} className="text-engine" />
        <h2 className="text-engine font-mono font-semibold tracking-wide">ENGINE ROOM</h2>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-white/10">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => { triggerHaptic('selection'); setActiveTab(id); }}
            className={`
              flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono transition-colors
              ${activeTab === id ? 'text-engine border-b-2 border-engine' : 'text-white/40 hover:text-white/70'}
            `}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 scroll-area p-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border border-engine rounded-sm animate-spin" />
          </div>
        )}

        {/* Status tab */}
        {!loading && activeTab === 'status' && status && (
          <div className="space-y-4">
            {/* System health */}
            <div className="border border-engine/30 bg-engine/5 rounded-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-engine text-xs font-mono uppercase tracking-wider">System</p>
                <span className="text-engine text-xs font-mono">● ONLINE</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-white/40">Provider</p>
                  <p className="text-white font-mono">{status.provider ?? 'kimi'}</p>
                </div>
                <div>
                  <p className="text-white/40">Uptime</p>
                  <p className="text-white font-mono">{Math.floor((status.uptime ?? 0) / 60)}m</p>
                </div>
                <div>
                  <p className="text-white/40">Total Users</p>
                  <p className="text-white font-mono">{status.totalUsers ?? 0}</p>
                </div>
                <div>
                  <p className="text-white/40">DB</p>
                  <p className={`font-mono ${dbHealth?.ok ? 'text-engine' : 'text-red-400'}`}>
                    {dbHealth?.ok ? 'healthy' : 'error'}
                  </p>
                </div>
              </div>
            </div>

            {/* Games by status */}
            {status.games?.length > 0 && (
              <div>
                <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-2">Games</p>
                <div className="space-y-1">
                  {status.games.map((g: any) => (
                    <div key={g.status} className="flex items-center justify-between border border-white/10 rounded-sm px-3 py-2">
                      <span className="text-white/60 text-xs font-mono">{g.status}</span>
                      <span className="text-engine text-xs font-mono font-bold">{g.cnt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Commands by status */}
            {status.commands?.length > 0 && (
              <div>
                <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-2">Commands</p>
                <div className="space-y-1">
                  {status.commands.map((c: any) => (
                    <div key={c.status} className="flex items-center justify-between border border-white/10 rounded-sm px-3 py-2">
                      <span className="text-white/60 text-xs font-mono">{c.status}</span>
                      <span className={`text-xs font-mono font-bold ${c.status === 'failed' ? 'text-red-400' : 'text-engine'}`}>
                        {c.cnt}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* DB tab */}
        {!loading && activeTab === 'db' && (
          <div className="space-y-3">
            <div className={`border rounded-sm p-4 text-center ${dbHealth?.ok ? 'border-engine/40 bg-engine/5' : 'border-red-500/40 bg-red-500/5'}`}>
              <Database size={24} className={`mx-auto mb-2 ${dbHealth?.ok ? 'text-engine' : 'text-red-400'}`} />
              <p className={`font-mono text-sm font-bold ${dbHealth?.ok ? 'text-engine' : 'text-red-400'}`}>
                {dbHealth?.ok ? 'DATABASE HEALTHY' : 'DATABASE ERROR'}
              </p>
              {!dbHealth?.ok && dbHealth?.error && (
                <p className="text-red-400/70 text-xs mt-2 font-mono break-all">{dbHealth.error}</p>
              )}
            </div>
          </div>
        )}

        {/* Glossary tab */}
        {!loading && activeTab === 'glossary' && (
          <div className="space-y-3">
            {glossary.map((item) => (
              <div key={item.term} className="border border-white/10 rounded-sm p-3">
                <p className="text-engine text-sm font-mono font-semibold">{item.term}</p>
                <p className="text-white/60 text-xs mt-1 leading-relaxed">{item.definition}</p>
              </div>
            ))}
          </div>
        )}

        {/* Constellations tab */}
        {!loading && activeTab === 'constellations' && (
          <div className="space-y-3">
            {constellations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <List size={32} className="text-white/20" />
                <p className="text-white/40 text-sm font-mono">No constellations available</p>
              </div>
            )}
            {constellations.map((c) => (
              <div key={c.id} className="border border-engine/30 bg-engine/5 rounded-sm p-3">
                <p className="text-engine text-sm font-mono font-semibold">{c.name}</p>
                <p className="text-white/60 text-xs mt-1">{c.description}</p>
                {c.seats?.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {c.seats.map((seat: number) => (
                      <span key={seat} className="text-[10px] font-mono text-engine/70 border border-engine/30 px-1 rounded-sm">
                        {String(seat).padStart(2, '0')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
