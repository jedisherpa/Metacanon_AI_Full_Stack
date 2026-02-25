import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import StageHeader from '../components/StageHeader';
import { Button, Field } from '../components/Field';
import { adminSession, adminUnlock } from '../lib/api';
import { setAdminWsToken } from '../lib/session';

export default function AdminUnlock() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminSession()
      .then((result) => {
        if (result.ok) {
          navigate('/admin');
        }
      })
      .catch(() => null);
  }, []);

  async function handleUnlock(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await adminUnlock(password);
      if (result.wsToken) {
        setAdminWsToken(result.wsToken);
      }
      navigate('/admin');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <StageHeader
        title="Admin Panel Unlock"
        subtitle="Enter the admin password to access host controls for synchronous sessions."
      />

      <form className="panel" onSubmit={handleUnlock}>
        <Field label="Admin Password">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter admin password"
            required
          />
        </Field>

        {error ? <p className="error">{error}</p> : null}

        <Button type="submit" disabled={loading}>
          {loading ? 'Unlocking...' : 'Unlock Admin Panel'}
        </Button>
      </form>
    </div>
  );
}
