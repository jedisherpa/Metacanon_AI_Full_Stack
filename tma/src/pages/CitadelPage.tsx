import { useState, useEffect } from 'react';
import { Shield, Plus, ThumbsUp, ThumbsDown, Minus, FileText, Clock3 } from 'lucide-react';
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

  const openProposals = proposals.filter((proposal) => proposal.status === 'open').length;

  return (
    <div className="flex flex-col h-full scroll-area px-4 pb-6">
      <div className="pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-citadel text-xs font-mono uppercase tracking-[0.18em]">Territory</p>
            <h2 className="text-white text-2xl font-semibold mt-1 leading-none">The Citadel</h2>
            <p className="text-white/65 text-sm mt-2">
              Governance control for {profile.firstName}. Open proposals: {openProposals}
            </p>
          </div>
          <button
            onClick={() => {
              triggerHaptic('impact_light');
              setShowNewProposal(true);
            }}
            className="lf-button lf-button--secondary rounded-xl border border-citadel/60 bg-citadel/12 px-3.5 py-2.5 text-citadel text-sm font-mono tracking-wide flex items-center gap-1.5"
          >
            <Plus size={12} />
            Propose
          </button>
        </div>
      </div>

      {showNewProposal && (
        <div className="territory-card lf-card mt-2 p-4 border-citadel/45 bg-citadel/10">
          <p className="text-citadel text-xs font-mono uppercase tracking-[0.16em] mb-2">New Proposal</p>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Proposal title"
            className="lf-input w-full bg-void-light/70 border border-white/20 text-white text-sm px-3 py-2.5 rounded-lg mb-2 outline-none focus:border-citadel/60"
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Describe the proposal and expected impact"
            rows={4}
            className="lf-input w-full bg-void-light/70 border border-white/20 text-white text-sm px-3 py-2.5 rounded-lg mb-2 outline-none focus:border-citadel/60 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handlePropose}
              disabled={submitting}
              className="lf-button lf-button--primary flex-1 bg-citadel text-void font-mono text-sm py-2.5 rounded-lg font-bold disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Proposal'}
            </button>
            <button
              onClick={() => setShowNewProposal(false)}
              className="lf-button lf-button--secondary px-4 border border-white/20 text-white/70 font-mono text-sm py-2.5 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-3.5 space-y-3.5">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-7 h-7 border-2 border-citadel/50 border-t-citadel rounded-full animate-spin" />
          </div>
        )}

        {!loading && proposals.length === 0 && (
          <div className="territory-card lf-card p-6 flex flex-col items-center justify-center gap-3 border-citadel/25">
            <FileText size={32} className="text-white/20" />
            <p className="text-white/70 text-sm font-medium">No proposals yet</p>
            <p className="text-white/45 text-xs">Start governance by opening the first proposal.</p>
          </div>
        )}

        {proposals.map((proposal) => (
          <div key={proposal.id} className="territory-card lf-card p-3.5 border-citadel/30 bg-citadel/5">
            <div className="flex items-start justify-between gap-2 mb-2.5">
              <div className="flex-1">
                <p className="text-white text-sm font-medium leading-tight">{proposal.title}</p>
                <p className="text-white/60 text-xs mt-1 line-clamp-3">{proposal.description}</p>
              </div>
              <span
                className={`
                  flex-shrink-0 text-[10px] font-mono px-2 py-1 rounded-full border uppercase tracking-wide
                  ${proposal.status === 'open' ? 'text-citadel border-citadel/50 bg-citadel/10' : 'text-white/55 border-white/20'}
                `}
              >
                {proposal.status}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-white/45 font-mono">
              <Clock3 size={11} />
              {new Date(proposal.createdAt).toLocaleString()}
            </div>

            {proposal.status === 'open' && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                <button
                  onClick={() => handleVote(proposal.id, 'yes')}
                  disabled={votingId === proposal.id}
                  className="lf-button lf-button--secondary flex items-center justify-center gap-1 text-green-300 border border-green-300/40 px-2 py-2 rounded-lg text-xs font-mono bg-green-300/5 disabled:opacity-50"
                >
                  <ThumbsUp size={12} />
                  Yes
                </button>
                <button
                  onClick={() => handleVote(proposal.id, 'no')}
                  disabled={votingId === proposal.id}
                  className="lf-button lf-button--secondary flex items-center justify-center gap-1 text-red-300 border border-red-300/40 px-2 py-2 rounded-lg text-xs font-mono bg-red-300/5 disabled:opacity-50"
                >
                  <ThumbsDown size={12} />
                  No
                </button>
                <button
                  onClick={() => handleVote(proposal.id, 'abstain')}
                  disabled={votingId === proposal.id}
                  className="lf-button lf-button--secondary flex items-center justify-center gap-1 text-white/75 border border-white/20 px-2 py-2 rounded-lg text-xs font-mono bg-white/5 disabled:opacity-50"
                >
                  <Minus size={12} />
                  Pass
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
