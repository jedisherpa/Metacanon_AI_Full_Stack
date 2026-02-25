import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import StageHeader from '../components/StageHeader';
import { Button, Field } from '../components/Field';
import { playerMe, submitRound1 } from '../lib/api';
import { loadPlayerSession } from '../lib/session';
import { connectWs } from '../lib/ws';
import { resolvePlayerRoute } from '../lib/playerFlow';
import { queueStageTransition } from '../lib/stageTransition';

export default function PlayerRound1(props: { gameId: string }) {
  const [location, navigate] = useLocation();
  const [content, setContent] = useState('');
  const [question, setQuestion] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = loadPlayerSession(props.gameId);

  async function load() {
    if (!session) return;
    const result = await playerMe(props.gameId, session.playerToken);
    const target = resolvePlayerRoute(props.gameId, result.game, result.player);
    if (target !== location) {
      queueStageTransition({
        gameId: props.gameId,
        status: result.game.status,
        targetPath: target
      });
      navigate(`/play/${props.gameId}/transition`);
      return;
    }
    setQuestion(result.game.question || '');
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
      await submitRound1(props.gameId, session.playerToken, content);
      navigate(`/play/${props.gameId}/lobby`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <StageHeader title="Round 1" subtitle={question || 'Loading question...'} />

      <form className="panel" onSubmit={handleSubmit}>
        <Field label="Your Initial Perspective Response">
          <textarea
            rows={12}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Respond through your assigned lens."
            required
          />
        </Field>

        <div className="response-meta">
          <span>Word count: {content.trim().split(/\s+/).filter(Boolean).length}</span>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <Button type="submit" disabled={loading}>
          {loading ? 'Submitting...' : 'Submit Round 1'}
        </Button>
      </form>
    </div>
  );
}
