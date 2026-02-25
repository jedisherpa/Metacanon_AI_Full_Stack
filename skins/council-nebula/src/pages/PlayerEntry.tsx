import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import StageHeader from '../components/StageHeader';
import { Button, Field } from '../components/Field';
import { playerAccess, playerJoin } from '../lib/api';
import { savePlayerSession } from '../lib/session';

export default function PlayerEntry(props: { gameId: string; accessToken?: string }) {
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.accessToken) return;

    setLoading(true);
    playerAccess(props.gameId, props.accessToken)
      .then((result) => {
        savePlayerSession(props.gameId, {
          playerId: result.player.id,
          playerToken: result.playerToken,
          seatNumber: result.player.seatNumber,
          avatarName: result.player.avatarName,
          epistemology: result.player.epistemology,
          hint: result.player.hint
        });
        navigate(`/play/${props.gameId}/lobby`);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [props.gameId, props.accessToken]);

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await playerJoin(props.gameId, {
        name,
        email: email || undefined
      });

      savePlayerSession(props.gameId, {
        playerId: result.player.id,
        playerToken: result.playerToken,
        seatNumber: result.player.seatNumber,
        avatarName: result.player.avatarName,
        epistemology: result.player.epistemology,
        hint: result.player.hint
      });

      navigate(`/play/${props.gameId}/lobby`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (props.accessToken) {
    return (
      <div className="page">
        <StageHeader title="Loading Player Access" subtitle="Validating your direct player link..." />
        {error ? <p className="error">{error}</p> : <p>{loading ? 'Loading...' : 'Redirecting...'}</p>}
      </div>
    );
  }

  return (
    <div className="page">
      <StageHeader
        title="Join Synchronous Session"
        subtitle="Enter your details to claim your seat and perspective."
      />

      <form className="panel" onSubmit={handleJoin}>
        <Field label="Name">
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>

        <Field label="Email (optional)">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
          />
        </Field>

        {error ? <p className="error">{error}</p> : null}

        <Button type="submit" disabled={loading}>
          {loading ? 'Joining...' : 'Join Game'}
        </Button>
      </form>
    </div>
  );
}
