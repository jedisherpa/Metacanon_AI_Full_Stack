import { useState, useEffect } from 'react';
import { Shield, Plus, ThumbsUp, ThumbsDown, Minus, ChevronRight, FileText } from 'lucide-react';
import { api, type Proposal, type UserProfile } from '../lib/api';
import { triggerHaptic } from '../lib/telegram';

type Props = { profile: UserProfile };

export default function CitadelPage({ profile }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewProposal, setShowNewProposal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  useEffect(() => {
    api.getProposals().then((r) => {
      setProposals(r.proposals);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handlePropose() {
    if (!newTitle.trim() || !newDesc.trim()) return;
    setSubmitting(true);
    try {
      const r = await api.propose({ sphereId: 'global', title: newTitle, description: newDesc }) as any;
      triggerHaptic(r.hapticTrigger);
      setProposals((prev) => [r.vote, ...prev]);
      setNewTitle('');
      setNewDesc('');
      setShowNewProposal(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVote(voteId: string, choice: 'yes' | 'no' | 'abstain') {
    setVotingId(voteId);
    try {
      const r = await api.castVote({ voteId, choice }) as any;
      triggerHaptic(r.hapticTrigger);
    } catch (e) {
      console.error(e);
    } finally {
      setVotingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 pt-4 pb-3 border-b border-citadel/30">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-citadel" />
          <h2 className="text-citadel font-mono font-semibold tracking-wide">THE CITADEL</h2>
        </div>
        <button
          onClick={() => { triggerHaptic('impact_light'); setShowNewProposal(true); }}
          className="flex items-center gap-1 text-citadel text-xs font-mono border border-citadel/50 px-2 py-1 rounded-sm hover:bg-citadel/10"
        >
          <Plus size={12} />
          PROPOSE
        </button>
      </div>

      {/* New proposal form */}
      {showNewProposal && (
        <div className="flex-shrink-0 mx-4 mt-3 p-3 border border-citadel/40 bg-citadel/5 rounded-sm">
          <p className="text-citadel text-xs font-mono uppercase tracking-wider mb-2">New Proposal</p>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Proposal title..."
            className="w-full bg-void-light border border-white/20 text-white text-sm px-3 py-2 rounded-sm mb-2 outline-none focus:border-citadel/60"
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Describe the proposal..."
            rows={3}
            className="w-full bg-void-light border border-white/20 text-white text-sm px-3 py-2 rounded-sm mb-2 outline-none focus:border-citadel/60 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handlePropose}
              disabled={submitting}
              className="flex-1 bg-citadel text-void font-mono text-sm py-2 rounded-sm font-bold disabled:opacity-50"
            >
              {submitting ? 'SUBMITTING...' : 'SUBMIT'}
            </button>
            <button
              onClick={() => setShowNewProposal(false)}
              className="px-4 border border-white/20 text-white/60 font-mono text-sm py-2 rounded-sm"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Proposals list */}
      <div className="flex-1 scroll-area px-4 py-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border border-citadel rounded-sm animate-spin" />
          </div>
        )}

        {!loading && proposals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <FileText size={32} className="text-white/20" />
            <p className="text-white/40 text-sm font-mono">No proposals yet</p>
            <p className="text-white/30 text-xs">Be the first to propose</p>
          </div>
        )}

        {proposals.map((proposal) => (
          <div
            key={proposal.id}
            className="border border-citadel/30 bg-citadel/5 rounded-sm p-3"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <p className="text-white text-sm font-medium leading-tight">{proposal.title}</p>
                <p className="text-white/50 text-xs mt-1 line-clamp-2">{proposal.description}</p>
              </div>
              <span className={`
                flex-shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-sm border
                ${proposal.status === 'open' ? 'text-citadel border-citadel/50' : 'text-white/40 border-white/20'}
              `}>
                {proposal.status.toUpperCase()}
              </span>
            </div>

            {proposal.status === 'open' && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleVote(proposal.id, 'yes')}
                  disabled={votingId === proposal.id}
                  className="flex items-center gap-1 text-green-400 border border-green-400/40 px-3 py-1.5 rounded-sm text-xs font-mono hover:bg-green-400/10 disabled:opacity-50"
                >
                  <ThumbsUp size={12} />
                  YES
                </button>
                <button
                  onClick={() => handleVote(proposal.id, 'no')}
                  disabled={votingId === proposal.id}
                  className="flex items-center gap-1 text-red-400 border border-red-400/40 px-3 py-1.5 rounded-sm text-xs font-mono hover:bg-red-400/10 disabled:opacity-50"
                >
                  <ThumbsDown size={12} />
                  NO
                </button>
                <button
                  onClick={() => handleVote(proposal.id, 'abstain')}
                  disabled={votingId === proposal.id}
                  className="flex items-center gap-1 text-white/40 border border-white/20 px-3 py-1.5 rounded-sm text-xs font-mono hover:bg-white/5 disabled:opacity-50"
                >
                  <Minus size={12} />
                  ABSTAIN
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
