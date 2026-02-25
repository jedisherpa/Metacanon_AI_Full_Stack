export default function ProgressBoard(props: {
  players: Array<{
    id: string;
    seatNumber: number;
    name: string;
    avatarName?: string;
    round1Complete?: boolean;
    round2Complete?: boolean;
    deliberationEligible?: boolean;
  }>;
  mode?: 'admin' | 'player';
  stage?: string;
}) {
  const mode = props.mode ?? 'admin';

  const stageGroup =
    props.stage === 'round1_open' || props.stage === 'round1_closed'
      ? 'round1'
      : props.stage === 'round2_open' || props.stage === 'round2_closed'
        ? 'round2'
        : props.stage?.startsWith('deliberation')
          ? 'deliberation'
          : props.stage?.startsWith('lobby')
            ? 'lobby'
            : 'other';

  function playerStatus(player: {
    round1Complete?: boolean;
    round2Complete?: boolean;
    deliberationEligible?: boolean;
  }) {
    if (stageGroup === 'round1') {
      return player.round1Complete
        ? { label: 'Submitted', className: 'progress-state progress-state--submitted', seatClass: 'seat--submitted' }
        : { label: 'Waiting', className: 'progress-state progress-state--waiting', seatClass: 'seat--waiting' };
    }

    if (stageGroup === 'round2') {
      return player.round2Complete
        ? { label: 'Submitted', className: 'progress-state progress-state--submitted', seatClass: 'seat--submitted' }
        : { label: 'Waiting', className: 'progress-state progress-state--waiting', seatClass: 'seat--waiting' };
    }

    if (stageGroup === 'deliberation') {
      const ready = player.deliberationEligible ?? player.round2Complete;
      return ready
        ? { label: 'Ready', className: 'progress-state progress-state--submitted', seatClass: 'seat--submitted' }
        : { label: 'Not Ready', className: 'progress-state progress-state--waiting', seatClass: 'seat--waiting' };
    }

    return { label: 'Joined', className: 'progress-state progress-state--joined', seatClass: '' };
  }

  return (
    <div className="lobby-grid">
      {props.players.map((player) => (
        <div
          key={player.id}
          className={`seat ${mode === 'player' ? playerStatus(player).seatClass : player.round2Complete ? 'seat--ready' : ''}`}
        >
          <strong>Seat {player.seatNumber}</strong>
          <span>{player.avatarName || 'Unassigned'}</span>
          <span className="muted">{player.name}</span>
          {mode === 'player' ? (
            <span className={playerStatus(player).className}>{playerStatus(player).label}</span>
          ) : (
            <>
              <span className="muted">R1: {player.round1Complete ? 'done' : 'pending'}</span>
              <span className="muted">R2: {player.round2Complete ? 'done' : 'pending'}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
