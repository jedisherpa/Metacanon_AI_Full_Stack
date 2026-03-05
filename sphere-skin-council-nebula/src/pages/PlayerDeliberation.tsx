import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import StageHeader from '../components/StageHeader';
import DeliberationText from '../components/DeliberationText';
import { deliberationFeed, playerMe } from '../lib/api';
import { loadPlayerSession } from '../lib/session';
import { connectWs } from '../lib/ws';
import { resolvePlayerRoute } from '../lib/playerFlow';
import { queueStageTransition } from '../lib/stageTransition';

type PositionCard = {
  avatarName: string;
  epistemology: string;
  content: string;
  summary?: string;
  signatureColor?: string;
};

const PHASE_ORDER: Array<'clash' | 'consensus' | 'options' | 'paradox' | 'minority'> = [
  'clash',
  'consensus',
  'options',
  'paradox',
  'minority'
];

function friendlyPhase(phase: string) {
  switch (phase) {
    case 'positions':
      return 'Phase 1: Position Mapping';
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
    case 'complete':
      return 'Deliberation Complete';
    default:
      return 'Deliberation Running';
  }
}

function serializePhasePayload(payload: unknown) {
  if (typeof payload === 'string') return payload;
  if (payload == null) return '';
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function upsertPositionCard(prev: PositionCard[], incoming: PositionCard) {
  const index = prev.findIndex((card) => card.avatarName === incoming.avatarName);
  if (index === -1) {
    return [...prev, incoming];
  }

  const next = [...prev];
  const current = next[index];
  next[index] = {
    ...current,
    ...incoming,
    summary: incoming.summary || current.summary,
    signatureColor: incoming.signatureColor || current.signatureColor,
    content: incoming.content || current.content
  };
  return next;
}

export default function PlayerDeliberation(props: { gameId: string }) {
  const [location, navigate] = useLocation();
  const [phase, setPhase] = useState('positions');
  const [positionCards, setPositionCards] = useState<PositionCard[]>([]);
  const [phaseText, setPhaseText] = useState<Record<string, string>>({});
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [wsState, setWsState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [lastUpdateAt, setLastUpdateAt] = useState<string>('');
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

    setPhase(me.game.deliberationPhase || me.game.status || 'positions');

    const data = await deliberationFeed(props.gameId, session.playerToken);
    setArtifacts(data.artifacts || []);

    const playerById = new Map((data.players || []).map((player: any) => [player.id, player]));
    const seededCards = (data.round1 || [])
      .map((response: any) => {
        const player = playerById.get(response.playerId);
        if (!player) return null;
        return {
          avatarName: player.avatarName,
          epistemology: player.epistemology,
          content: response.content
        } as PositionCard;
      })
      .filter(Boolean) as PositionCard[];

    setPositionCards((prev) => {
      let next = [...prev];
      for (const card of seededCards) {
        next = upsertPositionCard(next, card);
      }
      return next;
    });

    setPhaseText((prev) => {
      const next = { ...prev };
      for (const artifact of data.artifacts || []) {
        if (!next[artifact.artifactType]) {
          next[artifact.artifactType] = artifact.content;
        }
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

    const deliberationWs = connectWs({
      channel: 'deliberation',
      gameId: props.gameId,
      token: session.playerToken,
      onStateChange: setWsState,
      onMessage: (message) => {
        if (message.type === 'deliberation.phase_started') {
          setPhase(message.phase);
          setLastUpdateAt(new Date().toLocaleTimeString());
        }
        if (message.type === 'deliberation.phase_stream') {
          if (message.delta) {
            setPhaseText((prev) => ({
              ...prev,
              [message.phase]: (prev[message.phase] || '') + message.delta
            }));
          }
          if (message.payload) {
            if (message.phase === 'positions' && message.payload.avatarName) {
              setPositionCards((prev) =>
                upsertPositionCard(prev, {
                  avatarName: message.payload.avatarName,
                  epistemology: message.payload.epistemology || '',
                  content: message.payload.content || '',
                  summary: message.payload.summary || '',
                  signatureColor: message.payload.signatureColor || ''
                })
              );
            } else {
              const payloadText = serializePhasePayload(message.payload);
              if (payloadText) {
                setPhaseText((prev) => ({
                  ...prev,
                  [message.phase]: payloadText
                }));
              }
            }
          }
          setLastUpdateAt(new Date().toLocaleTimeString());
        }
        if (message.type === 'deliberation.completed') {
          queueStageTransition({
            gameId: props.gameId,
            status: 'deliberation_complete',
            targetPath: `/play/${props.gameId}/results`
          });
          navigate(`/play/${props.gameId}/transition`);
        }
      }
    });

    const playerWs = connectWs({
      channel: 'player',
      gameId: props.gameId,
      token: session.playerToken,
      onMessage: (message) => {
        if (message.type === 'state.refresh') {
          void load().catch((err) => setError((err as Error).message));
        }
      }
    });

    return () => {
      deliberationWs.close();
      playerWs.close();
    };
  }, [props.gameId, location]);

  return (
    <div className="page">
      <StageHeader
        title="Live Deliberation"
        subtitle={`${friendlyPhase(phase)}. View-only stream controlled by the host.`}
      />

      {error ? <p className="error">{error}</p> : null}

      <section className="panel">
        <p className="muted">
          Stream status: <strong>{wsState}</strong>
        </p>
        <p className="muted">Latest update: {lastUpdateAt || 'Waiting for host...'}</p>
      </section>

      <section className="panel">
        <h3>Lens Perspectives</h3>
        {positionCards.length === 0 ? (
          <p className="muted">No perspective cards yet. Waiting for the host to run phase 1.</p>
        ) : null}
        <div className="positions">
          {positionCards.map((card) => (
            <div
              key={card.avatarName}
              className="position-card"
              style={card.signatureColor ? { borderColor: card.signatureColor } : undefined}
            >
              <strong>{card.avatarName}</strong>
              <p className="muted">{card.epistemology}</p>
              {card.summary ? <p className="summary">{card.summary}</p> : null}
              <p className="stream">{card.content}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Deliberation Phases</h3>
        {PHASE_ORDER.every((item) => !phaseText[item]) ? (
          <p className="muted">No phase output yet. The host may still be preparing or paused.</p>
        ) : null}
        <div className="synthesis-grid">
          {PHASE_ORDER.map((item) => {
            const content = phaseText[item];
            if (!content) return null;
            return (
              <div key={item} className="synthesis-card">
                <strong>{friendlyPhase(item)}</strong>
                <DeliberationText content={content} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h3>Saved Artifacts</h3>
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
