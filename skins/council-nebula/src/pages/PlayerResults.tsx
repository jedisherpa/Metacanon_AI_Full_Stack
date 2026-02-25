import { useEffect, useState } from 'react';
import StageHeader from '../components/StageHeader';
import DeliberationText from '../components/DeliberationText';
import { deliberationFeed } from '../lib/api';
import { loadPlayerSession } from '../lib/session';

function friendlyPhase(phase: string) {
  switch (phase) {
    case 'clash':
      return 'Phase 2: Clash Analysis';
    case 'consensus':
      return 'Phase 3: Consensus';
    case 'options':
      return 'Phase 4: Options';
    case 'paradox':
      return 'Phase 5: Paradoxes';
    case 'minority':
      return 'Phase 6: Minority Reports';
    default:
      return phase;
  }
}

export default function PlayerResults(props: { gameId: string }) {
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = loadPlayerSession(props.gameId);
    if (!session) return;

    deliberationFeed(props.gameId, session.playerToken)
      .then((data) => setArtifacts(data.artifacts || []))
      .catch((err) => setError((err as Error).message));
  }, [props.gameId]);

  return (
    <div className="page">
      <StageHeader title="Final Results" subtitle="Consensus, options, paradoxes, and minority reports." />
      {error ? <p className="error">{error}</p> : null}

      <section className="panel">
        <div className="synthesis-grid">
          {artifacts.map((artifact) => (
            <div key={artifact.id} className="synthesis-card">
              <strong>{friendlyPhase(artifact.artifactType)}</strong>
              <DeliberationText content={artifact.content} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
