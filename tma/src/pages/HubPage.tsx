import { useState, useEffect } from 'react';
import { Radio, AlertTriangle, Users, Send, CheckCircle2, Clock3 } from 'lucide-react';
import { api, type UserProfile } from '../lib/api';
import { triggerHaptic } from '../lib/telegram';

type Props = { profile: UserProfile };
type Tab = 'broadcast' | 'escalations' | 'members';

export default function HubPage({ profile }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('broadcast');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [escalations, setEscalations] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'escalations') {
      setLoading(true);
      api.getEscalations().then((r: any) => {
        setEscalations(r.escalations ?? []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
    if (activeTab === 'members') {
      setLoading(true);
      api.getEveryone().then((r: any) => {
        setMembers(r.players ?? []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [activeTab]);

  async function handleBroadcast() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const r = await api.broadcast({ sphereId: 'global', message }) as any;
      triggerHaptic(r.hapticTrigger);
      setMessage('');
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  }

  const tabs: { id: Tab; icon: typeof Radio; label: string }[] = [
    { id: 'broadcast', icon: Send, label: 'Broadcast' },
    { id: 'escalations', icon: AlertTriangle, label: 'Escalations' },
    { id: 'members', icon: Users, label: 'Members' }
  ];

  return (
    <div className="flex flex-col h-full scroll-area px-4 pb-6">
      <div className="pt-5 pb-3">
        <p className="text-hub text-xs font-mono uppercase tracking-[0.18em]">Territory</p>
        <h2 className="text-white text-2xl font-semibold mt-1 leading-none">The Hub</h2>
        <p className="text-white/65 text-sm mt-2">
          Transmission and coordination layer for {profile.firstName}.
        </p>
      </div>

      <div className="flex rounded-xl border border-white/18 bg-white/[0.06] p-1.5">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => {
              triggerHaptic('selection');
              setActiveTab(id);
            }}
            className={`
              lf-button lf-button--secondary
              flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono transition-colors rounded-lg
              ${activeTab === id
                ? 'text-hub bg-hub/20 border border-hub/45'
                : 'text-white/55 hover:text-white/80 border border-transparent'}
            `}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3.5 space-y-3.5">
        {activeTab === 'broadcast' && (
          <div className="territory-card lf-card p-3.5 border-hub/35 bg-hub/10">
            <p className="text-hub text-xs font-mono uppercase tracking-[0.16em] mb-2">Global Broadcast</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write a short transmission to all sphere members..."
              rows={5}
              className="lf-input w-full bg-void-light/70 border border-white/20 text-white text-sm px-3 py-2.5 rounded-lg outline-none focus:border-hub/60 resize-none"
            />
            <button
              onClick={handleBroadcast}
              disabled={sending || !message.trim()}
              className="lf-button lf-button--primary w-full mt-2 bg-hub/90 text-white font-mono text-sm py-2.5 rounded-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Broadcasting...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Send Broadcast
                </>
              )}
            </button>
            {sent && (
              <div className="mt-2 border border-hub/40 bg-hub/20 rounded-lg p-2.5 text-center flex items-center justify-center gap-1.5">
                <CheckCircle2 size={14} className="text-hub" />
                <p className="text-hub text-sm">Message broadcast successfully</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'escalations' && (
          <div className="space-y-3">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-7 h-7 border-2 border-hub/45 border-t-hub rounded-full animate-spin" />
              </div>
            )}
            {!loading && escalations.length === 0 && (
              <div className="territory-card lf-card p-6 flex flex-col items-center justify-center gap-3 border-hub/30">
                <AlertTriangle size={32} className="text-white/20" />
                <p className="text-white/70 text-sm font-medium">No escalations</p>
                <p className="text-white/45 text-xs">Channel is stable.</p>
              </div>
            )}
            {escalations.map((e) => (
              <div key={e.id} className="territory-card lf-card border-red-500/40 bg-red-500/8 p-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={12} className="text-red-300" />
                  <p className="text-red-300 text-xs font-mono uppercase tracking-wide">{e.eventType}</p>
                </div>
                <p className="text-white/80 text-xs">{e.sphereId}</p>
                <p className="text-white/50 text-[11px] mt-1 flex items-center gap-1.5">
                  <Clock3 size={11} />
                  {new Date(e.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-2.5">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-7 h-7 border-2 border-hub/45 border-t-hub rounded-full animate-spin" />
              </div>
            )}
            {!loading && members.length === 0 && (
              <div className="territory-card lf-card p-6 flex flex-col items-center justify-center gap-3 border-hub/30">
                <Users size={32} className="text-white/20" />
                <p className="text-white/70 text-sm font-medium">No active game</p>
                <p className="text-white/45 text-xs">Join a cycle to view members.</p>
              </div>
            )}
            {members.map((m: any) => (
              <div key={m.id} className="territory-card lf-card flex items-center gap-3 p-3 border-white/15">
                <div className="w-9 h-9 rounded-lg bg-hub/20 border border-hub/35 flex items-center justify-center text-xs font-mono text-hub">
                  {m.seatNumber ?? '?'}
                </div>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{m.name ?? m.avatarName}</p>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-[10px] font-mono ${m.round1Complete ? 'text-green-400' : 'text-white/30'}`}>
                      R1{m.round1Complete ? '✓' : '○'}
                    </span>
                    <span className={`text-[10px] font-mono ${m.round2Complete ? 'text-green-400' : 'text-white/30'}`}>
                      R2{m.round2Complete ? '✓' : '○'}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] text-white/45 font-mono uppercase tracking-wide">Seat</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
