import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { consumeStageTransition } from '../lib/stageTransition';

export default function PlayerStageTransition(props: { gameId: string }) {
  const [, navigate] = useLocation();
  const [targetPath, setTargetPath] = useState(`/play/${props.gameId}/lobby`);
  const [title, setTitle] = useState('Stage Update');
  const [subtitle, setSubtitle] = useState('Preparing your next step...');
  const [durationMs, setDurationMs] = useState(5000);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [remainingMs, setRemainingMs] = useState(5000);

  useEffect(() => {
    const payload = consumeStageTransition(props.gameId);
    if (payload) {
      setTargetPath(payload.targetPath);
      setTitle(payload.title);
      setSubtitle(payload.subtitle);
      setDurationMs(payload.durationMs);
      setStartedAt(payload.createdAt || Date.now());
      setRemainingMs(payload.durationMs);
      return;
    }

    navigate(`/play/${props.gameId}/lobby`);
  }, [props.gameId]);

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const next = Math.max(0, durationMs - elapsed);
      setRemainingMs(next);

      if (next <= 0) {
        navigate(targetPath);
      }
    };

    const interval = window.setInterval(tick, 100);
    tick();

    return () => window.clearInterval(interval);
  }, [startedAt, durationMs, targetPath]);

  const progress = useMemo(() => {
    const elapsed = Math.max(0, durationMs - remainingMs);
    return Math.min(100, Math.round((elapsed / durationMs) * 100));
  }, [durationMs, remainingMs]);

  return (
    <div className="page transition-screen">
      <section className="panel panel--glow transition-card">
        <span className="hero__badge">Stage Shift</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <p className="muted">Continuing in {Math.ceil(remainingMs / 1000)}s...</p>
        <div className="transition-progress">
          <div className="transition-progress__bar" style={{ width: `${progress}%` }} />
        </div>
      </section>
    </div>
  );
}
