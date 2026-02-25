import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import StageHeader from '../components/StageHeader';
import { Button, Field } from '../components/Field';
import { inviteLookup } from '../lib/api';

export default function Home() {
  const [, navigate] = useLocation();
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function joinWithCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const result = await inviteLookup(inviteCode.trim());
      navigate(`/play/${result.gameId}/join`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="page">
      <StageHeader
        title="Synchronous Deliberation Engine"
        subtitle="Host-led two-round deliberation with live synthesis controls."
      />

      <section className="panel">
        <div className="button-row">
          <Link href="/admin/unlock">
            <a className="btn btn--primary">Open Admin Panel</a>
          </Link>
        </div>
      </section>

      <form className="panel" onSubmit={joinWithCode}>
        <Field label="Join via Invite Code">
          <input
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="Enter invite code"
          />
        </Field>
        {error ? <p className="error">{error}</p> : null}
        <Button type="submit">Resolve Invite</Button>
      </form>
    </div>
  );
}
