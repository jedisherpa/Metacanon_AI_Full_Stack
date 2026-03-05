import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import StageHeader from '../components/StageHeader';
import ProgressBoard from '../components/ProgressBoard';
import { playerLobby, playerMe } from '../lib/api';
import { loadPlayerSession } from '../lib/session';
import { connectWs } from '../lib/ws';
import { friendlyGameStage, resolvePlayerRoute } from '../lib/playerFlow';
import { queueStageTransition } from '../lib/stageTransition';

function lobbySubtitle(game: any, player: any) {
  if (!game) {
    return 'Loading session...';
  }

  if (game.question) {
    if (game.status === 'round1_closed') {
      return 'Round 1 is complete. Waiting for the host to assign and open Round 2.';
    }
    if (game.status === 'round2_closed') {
      return 'Round 2 is complete. Waiting for the host to start deliberation.';
    }
    return game.question;
  }

  if (game.status === 'lobby_open') {
    return 'Lobby is open. Waiting for the host to lock seats and start Round 1.';
  }

  if (game.status === 'lobby_locked') {
    return 'Lobby is locked. Waiting for Round 1 to begin.';
  }

  if (game.status === 'deliberation_running' && !player?.deliberationEligible) {
    return 'Deliberation is in progress. Complete both rounds to participate.';
  }

  return 'Waiting for the host to advance the stage.';
}

export default function PlayerLobby(props: { gameId: string }) {
  const [location, navigate] = useLocation();
  const [game, setGame] = useState<any | null>(null);
  const [player, setPlayer] = useState<any | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [wsState, setWsState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [error, setError] = useState<string | null>(null);

  const session = loadPlayerSession(props.gameId);

  function maybeRedirect(me: { game: any; player: any }) {
    const target = resolvePlayerRoute(props.gameId, me.game, me.player);
    if (target !== location) {
      queueStageTransition({
        gameId: props.gameId,
        status: me.game.status,
        targetPath: target
      });
      navigate(`/play/${props.gameId}/transition`);
      return true;
    }
    return false;
  }

  useEffect(() => {
    if (!session) {
      navigate(`/play/${props.gameId}/join`);
      return;
    }

    void load();

    const ws = connectWs({
      channel: 'player',
      gameId: props.gameId,
      token: session.playerToken,
      onStateChange: setWsState,
      onMessage: () => {
        void load();
      }
    });

    return () => ws.close();
  }, [props.gameId]);

  async function load() {
    if (!session) return;

    try {
      const [me, lobby] = await Promise.all([
        playerMe(props.gameId, session.playerToken),
        playerLobby(props.gameId)
      ]);
      if (maybeRedirect(me)) return;
      setGame(me.game);
      setPlayer(me.player);
      setPlayers(lobby.players);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="page">
      <StageHeader
        title={`${friendlyGameStage(game?.status)} Stage`}
        subtitle={lobbySubtitle(game, player)}
      />

      {player ? (
        <section className="panel panel--glow">
          <div className="lens-card">
            <div>
              <h2>{player.avatarName}</h2>
              <p className="muted">{player.epistemology}</p>
            </div>
            <div className="lens-pill">Seat {player.seatNumber}</div>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h3>Group Progress</h3>
        <ProgressBoard players={players} mode="player" stage={game?.status} />
      </section>

      <section className="panel">
        <p className="muted">
          Realtime connection: <strong>{wsState}</strong>
        </p>
        <p className="muted">
          This page auto-advances you when the host moves to your next required step.
        </p>
        {error ? <p className="error">{error}</p> : null}
      </section>
    </div>
  );
}
