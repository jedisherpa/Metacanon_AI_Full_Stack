import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import StageHeader from '../components/StageHeader';
import { Button } from '../components/Field';
import { adminGetGame, adminSession } from '../lib/api';
import { getAdminWsToken } from '../lib/session';
import { connectWs } from '../lib/ws';

type SeatState = {
  seatNumber: number;
  joined: boolean;
  name?: string;
  avatarName?: string;
};

function buildSeats(groupSize: number, players: any[]): SeatState[] {
  const bySeat = new Map(players.map((player) => [player.seatNumber, player]));
  const seats: SeatState[] = [];

  for (let seat = 1; seat <= groupSize; seat += 1) {
    const player = bySeat.get(seat);
    seats.push({
      seatNumber: seat,
      joined: Boolean(player),
      name: player?.name,
      avatarName: player?.avatarName
    });
  }

  return seats;
}

export default function AdminDeliberationJoinView(props: { gameId: string }) {
  const [state, setState] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<string>('');

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const joinUrl = `${baseUrl}/play/${props.gameId}/join`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=700x700&margin=20&data=${encodeURIComponent(joinUrl)}`;

  const seats = useMemo(() => {
    const game = state?.game;
    const players = state?.players || [];
    if (!game?.groupSize) return [];
    return buildSeats(game.groupSize, players);
  }, [state]);

  const joinedCount = seats.filter((seat) => seat.joined).length;
  const totalSpots = seats.length || state?.game?.groupSize || 0;

  async function load() {
    try {
      const data = await adminGetGame(props.gameId);
      setState(data);
      setLastUpdateAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
    } catch {
      setError('Could not copy link. You can copy it manually from the URL panel.');
    }
  }

  useEffect(() => {
    adminSession()
      .then((result) => {
        if (!result.ok) {
          window.location.assign('/admin/unlock');
        }
      })
      .catch(() => window.location.assign('/admin/unlock'));

    void load();

    const ws = connectWs({
      channel: 'admin',
      gameId: props.gameId,
      token: getAdminWsToken(),
      onMessage: (message) => {
        if (message.type === 'state.refresh' || message.type === 'lobby.player_joined') {
          void load();
        }
      }
    });

    const timer = window.setInterval(() => {
      void load();
    }, 5000);

    return () => {
      ws.close();
      window.clearInterval(timer);
    };
  }, [props.gameId]);

  return (
    <div className="page">
      <StageHeader
        title="Deliberation Join View"
        subtitle="Screenshare this page so participants can scan the QR code and join quickly."
      />

      <section className="panel">
        <div className="button-row">
          <Link href={`/admin/game/${props.gameId}`}>
            <a className="btn btn--ghost">Back to Game Console</a>
          </Link>
          <Button variant="ghost" onClick={copyLink}>
            Copy Join Link
          </Button>
        </div>
        <p className="muted">Question: {state?.game?.question || 'Loading question...'}</p>
        <p className="muted">Latest update: {lastUpdateAt || 'Waiting for updates...'}</p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="panel join-view-layout">
        <div className="qr-wrap">
          <div className="qr-frame">
            <img src={qrUrl} alt="Join session QR code" className="qr-image" />
          </div>
          <code className="code-block">{joinUrl}</code>
        </div>

        <div className="join-summary">
          <p className="join-count">
            <strong>{joinedCount}</strong> / {totalSpots} joined
          </p>
          <div className="lobby-grid">
            {seats.map((seat) => (
              <article
                key={seat.seatNumber}
                className={`seat ${seat.joined ? 'seat--ready' : 'seat--waiting'}`}
              >
                <strong>Seat {seat.seatNumber}</strong>
                {seat.joined ? (
                  <>
                    <span>{seat.name}</span>
                    <span className="muted">{seat.avatarName}</span>
                  </>
                ) : (
                  <span className="muted">Waiting to join...</span>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
