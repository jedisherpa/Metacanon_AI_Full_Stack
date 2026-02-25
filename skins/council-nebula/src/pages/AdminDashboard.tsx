import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import StageHeader from '../components/StageHeader';
import { Button, Field } from '../components/Field';
import { adminCreateGame, adminListGames, adminLock, adminSession } from '../lib/api';
import { clearAdminWsToken } from '../lib/session';

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [games, setGames] = useState<any[]>([]);
  const [question, setQuestion] = useState('');
  const [groupSize, setGroupSize] = useState(6);
  const [provider, setProvider] = useState<'morpheus' | 'groq' | 'auto'>('morpheus');
  const [entryMode, setEntryMode] = useState<'self_join' | 'pre_registered'>('self_join');
  const [positionRevealSeconds, setPositionRevealSeconds] = useState(15);
  const [inviteUrl, setInviteUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminSession()
      .then((result) => {
        if (!result.ok) navigate('/admin/unlock');
      })
      .catch(() => navigate('/admin/unlock'));

    void load();
  }, []);

  async function load() {
    const data = await adminListGames();
    setGames(data.games);
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await adminCreateGame({
        question,
        groupSize,
        provider,
        entryMode,
        positionRevealSeconds
      });
      setInviteUrl(response.inviteUrl);
      setQuestion('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function lockPanel() {
    await adminLock();
    clearAdminWsToken();
    navigate('/admin/unlock');
  }

  return (
    <div className="page">
      <StageHeader
        title="Admin Dashboard"
        subtitle="Create and run synchronous deliberation games from this host console."
      />

      <form className="panel" onSubmit={create}>
        <Field label="Decision Question">
          <textarea
            rows={4}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What are we deciding?"
            required
          />
        </Field>

        <div className="grid">
          <Field label="Group Size">
            <input
              type="number"
              min={3}
              max={12}
              value={groupSize}
              onChange={(event) => setGroupSize(Number(event.target.value))}
            />
          </Field>

          <Field label="Provider">
            <select value={provider} onChange={(event) => setProvider(event.target.value as any)}>
              <option value="morpheus">Morpheus</option>
              <option value="groq">Groq</option>
              <option value="auto">Auto</option>
            </select>
          </Field>

          <Field label="Entry Mode">
            <select value={entryMode} onChange={(event) => setEntryMode(event.target.value as any)}>
              <option value="self_join">Self Join</option>
              <option value="pre_registered">Pre-Registered</option>
            </select>
          </Field>

          <Field label="Position Reveal Seconds">
            <input
              type="number"
              min={5}
              max={120}
              value={positionRevealSeconds}
              onChange={(event) => setPositionRevealSeconds(Number(event.target.value))}
            />
          </Field>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="button-row">
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create Game'}
          </Button>
          <Button variant="ghost" onClick={lockPanel}>
            Lock Admin Panel
          </Button>
        </div>

        {inviteUrl ? <code className="code-block">Invite URL: {inviteUrl}</code> : null}
      </form>

      <section className="panel">
        <h3>Games</h3>
        <div className="admin-list">
          {games.map((game) => (
            <Link key={game.id} href={`/admin/game/${game.id}`}>
              <a className="admin-row">
                <div>
                  <strong>{game.question}</strong>
                  <div className="muted">{game.id}</div>
                </div>
                <div className="admin-row__meta">
                  <span className={`pill pill--${game.status}`}>{game.status}</span>
                  <span>{game.playerCount} players</span>
                </div>
              </a>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
