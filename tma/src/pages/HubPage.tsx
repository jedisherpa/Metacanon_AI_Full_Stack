import { useState, useEffect } from 'react';
import { Radio, AlertTriangle, Users, Send } from 'lucide-react';
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-4 pb-3 border-b border-hub/30">
        <Radio size={18} className="text-hub" />
        <h2 className="text-hub font-mono font-semibold tracking-wide">THE HUB</h2>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-white/10">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => { triggerHaptic('selection'); setActiveTab(id); }}
            className={`
              flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono transition-colors
              ${activeTab === id ? 'text-hub border-b-2 border-hub' : 'text-white/40 hover:text-white/70'}
            `}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 scroll-area p-4">

        {/* Broadcast tab */}
        {activeTab === 'broadcast' && (
          <div className="space-y-4">
            <p className="text-white/60 text-xs">
              Send a message to all members of the global sphere.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your broadcast message..."
              rows={5}
              className="w-full bg-void-light border border-white/20 text-white text-sm px-3 py-2 rounded-sm outline-none focus:border-hub/60 resize-none"
            />
            <button
              onClick={handleBroadcast}
              disabled={sending || !message.trim()}
              className="w-full bg-hub text-white font-mono text-sm py-3 rounded-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  BROADCASTING...
                </>
              ) : (
                <>
                  <Send size={16} />
                  BROADCAST
                </>
              )}
            </button>
            {sent && (
              <div className="border border-hub/40 bg-hub/10 rounded-sm p-3 text-center">
                <p className="text-hub text-sm font-mono">Message broadcast successfully</p>
              </div>
            )}
          </div>
        )}

        {/* Escalations tab */}
        {activeTab === 'escalations' && (
          <div className="space-y-3">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border border-hub rounded-sm animate-spin" />
              </div>
            )}
            {!loading && escalations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <AlertTriangle size={32} className="text-white/20" />
                <p className="text-white/40 text-sm font-mono">No escalations</p>
                <p className="text-white/30 text-xs">All clear</p>
              </div>
            )}
            {escalations.map((e) => (
              <div key={e.id} className="border border-red-500/40 bg-red-500/5 rounded-sm p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={12} className="text-red-400" />
                  <p className="text-red-400 text-xs font-mono uppercase">{e.eventType}</p>
                </div>
                <p className="text-white/70 text-xs">{e.sphereId}</p>
                <p className="text-white/40 text-[10px] mt-1">
                  {new Date(e.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Members tab */}
        {activeTab === 'members' && (
          <div className="space-y-2">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border border-hub rounded-sm animate-spin" />
              </div>
            )}
            {!loading && members.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Users size={32} className="text-white/20" />
                <p className="text-white/40 text-sm font-mono">No active game</p>
                <p className="text-white/30 text-xs">Join a game to see members</p>
              </div>
            )}
            {members.map((m: any) => (
              <div key={m.id} className="flex items-center gap-3 border border-white/10 rounded-sm p-3">
                <div className="w-8 h-8 rounded-sm bg-hub/20 flex items-center justify-center text-xs font-mono text-hub">
                  {m.seatNumber ?? '?'}
                </div>
                <div>
                  <p className="text-white text-sm">{m.name ?? m.avatarName}</p>
                  <div className="flex gap-2 mt-0.5">
                    <span className={`text-[10px] font-mono ${m.round1Complete ? 'text-green-400' : 'text-white/30'}`}>
                      R1{m.round1Complete ? '✓' : '○'}
                    </span>
                    <span className={`text-[10px] font-mono ${m.round2Complete ? 'text-green-400' : 'text-white/30'}`}>
                      R2{m.round2Complete ? '✓' : '○'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
