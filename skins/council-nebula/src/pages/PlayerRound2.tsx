import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import StageHeader from '../components/StageHeader';
import { Button, Field } from '../components/Field';
import { getRound2Assignments, playerMe, submitRound2 } from '../lib/api';
import { loadPlayerSession } from '../lib/session';
import { connectWs } from '../lib/ws';
import { resolvePlayerRoute } from '../lib/playerFlow';
import { queueStageTransition } from '../lib/stageTransition';

export default function PlayerRound2(props: { gameId: string }) {
  const [location, navigate] = useLocation();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = loadPlayerSession(props.gameId);

  async function load() {
    if (!session) return;

    const me = await playerMe(props.gameId, session.playerToken);

    const target = resolvePlayerRoute(props.gameId, me.game, me.player);
    if (target !== location) {
      queueStageTransition({
        gameId: props.gameId,
        status: me.game.status,
        targetPath: target
      });
      navigate(`/play/${props.gameId}/transition`);
      return;
    }

    const assignmentData = await getRound2Assignments(props.gameId, session.playerToken);

    setAssignments(assignmentData.assignments);
    setResponses((prev) => {
      const next: Record<string, string> = {};
      for (const assignment of assignmentData.assignments) {
        next[assignment.id] = prev[assignment.id] || '';
      }
      return next;
    });
  }

  useEffect(() => {
    if (!session) {
      navigate(`/play/${props.gameId}/join`);
      return;
    }

    void load().catch((err) => setError((err as Error).message));

    const ws = connectWs({
      channel: 'player',
      gameId: props.gameId,
      token: session.playerToken,
      onMessage: () => {
        void load().catch((err) => setError((err as Error).message));
      }
    });

    return () => ws.close();
  }, [props.gameId, location]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;

    setLoading(true);
    setError(null);

    try {
      await submitRound2(
        props.gameId,
        session.playerToken,
        assignments.map((assignment) => ({
          assignmentId: assignment.id,
          content: responses[assignment.id] || ''
        }))
      );

      navigate(`/play/${props.gameId}/lobby`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <StageHeader
        title="Round 2"
        subtitle="Respond to each assigned perspective while maintaining your own lens."
      />

      <form className="panel" onSubmit={handleSubmit}>
        {assignments.map((assignment) => (
          <div key={assignment.id} className="question-row">
            <strong>
              Respond to: {assignment.targetAvatarName} ({assignment.targetEpistemology})
            </strong>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
              {assignment.promptText}
            </p>
            <Field label="Your Response">
              <textarea
                rows={6}
                value={responses[assignment.id] || ''}
                onChange={(event) =>
                  setResponses((prev) => ({
                    ...prev,
                    [assignment.id]: event.target.value
                  }))
                }
                required
              />
            </Field>
          </div>
        ))}

        {error ? <p className="error">{error}</p> : null}

        <Button type="submit" disabled={loading}>
          {loading ? 'Submitting...' : 'Submit Round 2'}
        </Button>
      </form>
    </div>
  );
}
