import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import StageHeader from '../components/StageHeader';
import ProgressBoard from '../components/ProgressBoard';
import { Button, Field } from '../components/Field';
import {
  adminAction,
  adminAddRoster,
  adminCommand,
  adminExport,
  adminGetGame,
  adminSession
} from '../lib/api';
import { getAdminWsToken } from '../lib/session';
import { connectWs } from '../lib/ws';
import { friendlyGameStage } from '../lib/playerFlow';

const ACTIONS: Array<{ label: string; path: string }> = [
  { label: 'Open Lobby', path: '/lobby/open' },
  { label: 'Lock Lobby', path: '/lobby/lock' },
  { label: 'Open Round 1', path: '/round1/open' },
  { label: 'Close Round 1', path: '/round1/close' },
  { label: 'Assign Round 2', path: '/round2/assign' },
  { label: 'Open Round 2', path: '/round2/open' },
  { label: 'Close Round 2', path: '/round2/close' },
  { label: 'Start Deliberation', path: '/deliberation/start' },
  { label: 'Pause Deliberation', path: '/deliberation/pause' },
  { label: 'Resume Deliberation', path: '/deliberation/resume' },
  { label: 'Next Deliberation Step', path: '/deliberation/next' },
  { label: 'Archive Game', path: '/archive' }
];

const ACTION_PROGRESS_LABEL_BY_PATH: Record<string, string> = {
  '/lobby/open': 'Opening Lobby...',
  '/lobby/lock': 'Locking Lobby...',
  '/round1/open': 'Opening Round 1...',
  '/round1/close': 'Closing Round 1...',
  '/round2/assign': 'Assigning Round 2...',
  '/round2/open': 'Opening Round 2...',
  '/round2/close': 'Closing Round 2...',
  '/deliberation/start': 'Starting Deliberation...',
  '/deliberation/pause': 'Pausing Deliberation...',
  '/deliberation/resume': 'Resuming Deliberation...',
  '/deliberation/next': 'Running Next Deliberation Step...',
  '/archive': 'Archiving Game...'
};

const ACTION_PROGRESS_LABEL_BY_COMMAND_TYPE: Record<string, string> = {
  lobby_open: 'Opening Lobby...',
  lobby_lock: 'Locking Lobby...',
  round1_open: 'Opening Round 1...',
  round1_close: 'Closing Round 1...',
  round2_assign: 'Assigning Round 2...',
  round2_open: 'Opening Round 2...',
  round2_close: 'Closing Round 2...',
  deliberation_start: 'Starting Deliberation...',
  deliberation_pause: 'Pausing Deliberation...',
  deliberation_resume: 'Resuming Deliberation...',
  deliberation_next: 'Running Next Deliberation Step...',
  archive: 'Archiving Game...'
};

const ALLOWED_ACTIONS_BY_STATUS: Record<string, string[]> = {
  draft: ['/lobby/open'],
  lobby_open: ['/lobby/lock'],
  lobby_locked: ['/round1/open'],
  round1_open: ['/round1/close'],
  round1_closed: ['/round2/assign', '/round2/open'],
  round2_open: ['/round2/close'],
  round2_closed: ['/deliberation/start'],
  deliberation_ready: ['/deliberation/start'],
  deliberation_running: ['/deliberation/pause', '/deliberation/next'],
  deliberation_paused: ['/deliberation/resume', '/deliberation/next'],
  deliberation_complete: ['/archive'],
  archived: []
};

const STAGE_GUIDE: Record<
  string,
  { title: string; instruction: string; nextActionPath?: string }
> = {
  draft: {
    title: 'Game Drafted',
    instruction: 'Share links, then open the lobby so participants can claim seats.',
    nextActionPath: '/lobby/open'
  },
  lobby_open: {
    title: 'Lobby Open',
    instruction: 'Watch seats fill. Lock the lobby when everyone is in.',
    nextActionPath: '/lobby/lock'
  },
  lobby_locked: {
    title: 'Lobby Locked',
    instruction: 'Start Round 1 to reveal the question and collect initial positions.',
    nextActionPath: '/round1/open'
  },
  round1_open: {
    title: 'Round 1 Active',
    instruction: 'Wait for submissions, then close Round 1 to move forward.',
    nextActionPath: '/round1/close'
  },
  round1_closed: {
    title: 'Round 1 Closed',
    instruction:
      'Generate Round 2 assignments first, then open Round 2 for participants to respond.',
    nextActionPath: '/round2/assign'
  },
  round2_open: {
    title: 'Round 2 Active',
    instruction: 'Wait for Round 2 submissions, then close Round 2.',
    nextActionPath: '/round2/close'
  },
  round2_closed: {
    title: 'Round 2 Closed',
    instruction: 'Start deliberation when ready.',
    nextActionPath: '/deliberation/start'
  },
  deliberation_ready: {
    title: 'Deliberation Ready',
    instruction: 'Start deliberation to begin phase streaming.',
    nextActionPath: '/deliberation/start'
  },
  deliberation_running: {
    title: 'Deliberation Running',
    instruction:
      'Use Next Deliberation Step to progress phases. Pause/resume any time to facilitate discussion.',
    nextActionPath: '/deliberation/next'
  },
  deliberation_paused: {
    title: 'Deliberation Paused',
    instruction: 'Resume when ready, then continue with Next Deliberation Step.',
    nextActionPath: '/deliberation/resume'
  },
  deliberation_complete: {
    title: 'Deliberation Complete',
    instruction: 'Archive the game when finished.',
    nextActionPath: '/archive'
  },
  archived: {
    title: 'Archived',
    instruction: 'Game is complete. You can export outputs anytime.'
  }
};

function formatCommandError(raw: string) {
  if (raw.includes('round1_closed')) {
    return 'Round 2 assignment requires Round 1 to be closed. Click "Close Round 1" first.';
  }
  return raw;
}

export default function AdminGameConsole(props: { gameId: string }) {
  const [state, setState] = useState<any | null>(null);
  const [commandStatus, setCommandStatus] = useState('idle');
  const [pendingActionPath, setPendingActionPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosterText, setRosterText] = useState('');
  const [exportJson, setExportJson] = useState('');
  const [deliberationWsState, setDeliberationWsState] =
    useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [deliberationPhase, setDeliberationPhase] = useState('idle');
  const [deliberationEvents, setDeliberationEvents] = useState<string[]>([]);
  const [deliberationStreamChars, setDeliberationStreamChars] = useState<Record<string, number>>({});
  const [deliberationLastUpdate, setDeliberationLastUpdate] = useState<string>('');

  const parsedRoster = useMemo(() => {
    return rosterText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, email] = line.split(',').map((value) => value.trim());
        return { name, email: email || undefined };
      });
  }, [rosterText]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const manualJoinUrl = baseUrl ? `${baseUrl}/play/${props.gameId}/join` : '';
  const playerLinks = (state?.players || [])
    .filter((player: any) => Boolean(player.accessToken))
    .map((player: any) => ({
      playerId: player.id,
      name: player.name,
      seatNumber: player.seatNumber,
      url: `${baseUrl}/play/${props.gameId}/access/${player.accessToken}`
    }));

  const gameStatus = state?.game?.status || 'draft';
  const allowedActions = ALLOWED_ACTIONS_BY_STATUS[gameStatus] || [];
  const guide = STAGE_GUIDE[gameStatus] || STAGE_GUIDE.draft;
  const totalPlayers = (state?.players || []).length;
  const round1Done = (state?.players || []).filter((player: any) => player.round1Complete).length;
  const round2Done = (state?.players || []).filter((player: any) => player.round2Complete).length;
  const eligibleCount = (state?.players || []).filter(
    (player: any) => player.deliberationEligible
  ).length;
  const round2AssignmentCount = (state?.round2Assignments || []).length;
  const recommendedAction = useMemo(() => {
    if (gameStatus === 'round1_closed') {
      const path = round2AssignmentCount > 0 ? '/round2/open' : '/round2/assign';
      return ACTIONS.find((action) => action.path === path) || null;
    }
    if (!guide.nextActionPath) return null;
    return ACTIONS.find((action) => action.path === guide.nextActionPath) || null;
  }, [gameStatus, guide.nextActionPath, round2AssignmentCount]);

  const pushDeliberationEvent = (line: string) => {
    setDeliberationEvents((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 10));
  };

  const activeCommand = state?.commands?.[0];
  const activeCommandStatus =
    commandStatus === 'queued' || commandStatus === 'running' ? commandStatus : activeCommand?.status || 'idle';
  const activeProgressLabel = pendingActionPath
    ? ACTION_PROGRESS_LABEL_BY_PATH[pendingActionPath]
    : ACTION_PROGRESS_LABEL_BY_COMMAND_TYPE[activeCommand?.commandType || ''] || 'Processing...';

  const smartStatus = useMemo(() => {
    if (activeCommandStatus === 'queued' || activeCommandStatus === 'running') {
      if (activeProgressLabel) {
        return activeProgressLabel;
      }
      return 'Processing host action...';
    }

    if (gameStatus === 'round1_open') {
      if (totalPlayers === 0) return 'Waiting for participants to join.';
      if (round1Done < totalPlayers) {
        return `Waiting for all players to submit Round 1 (${round1Done}/${totalPlayers}).`;
      }
      return 'Round 1 complete for all players. Ready to close Round 1.';
    }

    if (gameStatus === 'round1_closed') {
      if (round2AssignmentCount === 0) {
        return 'Round 1 closed. Ready to assign Round 2.';
      }
      return 'Round 2 assignments ready. Open Round 2 when ready.';
    }

    if (gameStatus === 'round2_open') {
      if (totalPlayers === 0) return 'Waiting for participants.';
      if (round2Done < totalPlayers) {
        return `Waiting for all players to submit Round 2 (${round2Done}/${totalPlayers}).`;
      }
      return 'Round 2 complete for all players. Ready to close Round 2.';
    }

    if (gameStatus === 'round2_closed') {
      return 'Round 2 is closed. Ready to start deliberation.';
    }

    if (gameStatus === 'deliberation_running') {
      return 'Deliberation running. Use "Next Deliberation Step" to advance phases.';
    }

    return guide.instruction;
  }, [
    activeCommandStatus,
    activeProgressLabel,
    gameStatus,
    round1Done,
    round2Done,
    totalPlayers,
    round2AssignmentCount,
    guide.instruction
  ]);

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
        if (message.type === 'command.running') {
          setCommandStatus('running');
        }
        if (message.type === 'state.refresh' || message.type === 'command.completed') {
          setPendingActionPath(null);
          setCommandStatus('completed');
          void load();
        }
        if (message.type === 'command.failed') {
          setCommandStatus('failed');
          setPendingActionPath(null);
          setError(formatCommandError(message.error || 'Command failed'));
          void load();
        }
      }
    });

    const deliberationWs = connectWs({
      channel: 'deliberation',
      gameId: props.gameId,
      token: getAdminWsToken(),
      onStateChange: setDeliberationWsState,
      onMessage: (message) => {
        if (message.type === 'state.refresh') {
          void load();
          return;
        }
        if (message.type === 'deliberation.phase_started') {
          setDeliberationPhase(message.phase);
          pushDeliberationEvent(`phase started: ${message.phase}`);
          setDeliberationLastUpdate(new Date().toLocaleTimeString());
          return;
        }
        if (message.type === 'deliberation.phase_stream') {
          if (message.delta) {
            setDeliberationStreamChars((prev) => ({
              ...prev,
              [message.phase]: (prev[message.phase] || 0) + message.delta.length
            }));
          }
          if (message.payload) {
            pushDeliberationEvent(`phase payload emitted: ${message.phase}`);
          }
          setDeliberationLastUpdate(new Date().toLocaleTimeString());
          return;
        }
        if (message.type === 'deliberation.paused') {
          pushDeliberationEvent('deliberation paused');
          return;
        }
        if (message.type === 'deliberation.resumed') {
          pushDeliberationEvent('deliberation resumed');
          return;
        }
        if (message.type === 'deliberation.completed') {
          setDeliberationPhase('complete');
          pushDeliberationEvent('deliberation complete');
          setDeliberationLastUpdate(new Date().toLocaleTimeString());
        }
      }
    });

    return () => {
      ws.close();
      deliberationWs.close();
    };
  }, [props.gameId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [props.gameId]);

  useEffect(() => {
    if (!state?.commands?.length) return;
    const latest = state.commands[0];
    setCommandStatus(latest.status);
    if (latest.status === 'completed' || latest.status === 'failed') {
      setPendingActionPath(null);
    }
  }, [state?.commands]);

  async function load() {
    try {
      const data = await adminGetGame(props.gameId);
      setState(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function fire(path: string) {
    setError(null);
    setPendingActionPath(path);
    setCommandStatus('queued');
    try {
      const response = await adminAction(props.gameId, path);
      setCommandStatus(response.status);
      setTimeout(() => void pollCommand(response.commandId), 500);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function pollCommand(id: string) {
    try {
      const result = await adminCommand(id);
      setCommandStatus(result.command.status);
      if (['queued', 'running'].includes(result.command.status)) {
        setTimeout(() => void pollCommand(id), 1000);
      } else {
        setPendingActionPath(null);
        if (result.command.status === 'failed') {
          setError(formatCommandError(result.command.error || 'Command failed'));
        }
        await load();
      }
    } catch (err) {
      // transient polling issues should not freeze UI state
      setTimeout(() => void pollCommand(id), 1500);
      setError((err as Error).message);
    }
  }

  async function applyRoster() {
    if (parsedRoster.length === 0) return;
    try {
      await adminAddRoster(props.gameId, parsedRoster);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError('Unable to copy link. You can still copy it manually.');
    }
  }

  async function exportState() {
    const payload = await adminExport(props.gameId);
    setExportJson(JSON.stringify(payload, null, 2));
  }

  return (
    <div className="page">
      <StageHeader
        title="Admin Game Console"
        subtitle={`Current phase: ${friendlyGameStage(gameStatus)}. ${guide.title}`}
        status={friendlyGameStage(gameStatus)}
      />

      <section className="panel panel--glow">
        <h3>Decision Question</h3>
        <p>{state?.game?.question || 'Loading question...'}</p>
      </section>

      <section className="panel">
        <div className="button-row">
          <Link href="/admin">
            <a className="btn btn--ghost">Back to Dashboard</a>
          </Link>
          <Button variant="ghost" onClick={load}>
            Refresh
          </Button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <p className="muted">{smartStatus}</p>
      </section>

      <section className="panel panel--glow">
        <h3>Next Step Guide</h3>
        <p>
          <strong>{guide.title}</strong>
        </p>
        <p className="muted">{guide.instruction}</p>
        <p className="muted">
          Progress: Round 1 {round1Done}/{totalPlayers}, Round 2 {round2Done}/{totalPlayers}, Deliberation
          Eligible {eligibleCount}/{totalPlayers}
        </p>
        {recommendedAction ? (
          <Button
            onClick={() => fire(recommendedAction.path)}
            disabled={
              !allowedActions.includes(recommendedAction.path) ||
              activeCommandStatus === 'queued' ||
              activeCommandStatus === 'running'
            }
          >
            {activeCommandStatus === 'queued' || activeCommandStatus === 'running'
              ? activeProgressLabel
              : `Do Next: ${recommendedAction.label}`}
          </Button>
        ) : null}
      </section>

      <section className="panel">
        <h3>Lifecycle Actions</h3>
        <div className="button-row">
          {ACTIONS.map((action) => (
            <Button
              key={action.path}
              variant={action.path === recommendedAction?.path ? 'primary' : 'ghost'}
              onClick={() => fire(action.path)}
              disabled={
                !state?.game?.status ||
                !allowedActions.includes(action.path) ||
                activeCommandStatus === 'queued' ||
                activeCommandStatus === 'running' ||
                (action.path === '/round2/open' && round2AssignmentCount === 0)
              }
            >
              {action.label}
            </Button>
          ))}
        </div>
        <p className="muted">
          Current stage: <strong>{state?.game?.status || 'unknown'}</strong>
        </p>
      </section>

      <section className="panel">
        <h3>Deliberation Monitor</h3>
        <p className="muted">
          Stream connection: <strong>{deliberationWsState}</strong>
        </p>
        <p className="muted">
          Active phase: <strong>{deliberationPhase}</strong>
        </p>
        <p className="muted">Last update: {deliberationLastUpdate || 'No updates yet'}</p>
        {Object.keys(deliberationStreamChars).length > 0 ? (
          <div className="invite-list">
            {Object.entries(deliberationStreamChars).map(([phase, count]) => (
              <div key={phase} className="invite-row">
                <span>{phase}</span>
                <span>{count} chars streamed</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">
            No phase stream output yet. If command is running, model generation may still be in progress.
          </p>
        )}

        {deliberationEvents.length > 0 ? (
          <pre className="code-block">{deliberationEvents.join('\n')}</pre>
        ) : null}
      </section>

      <section className="panel">
        <h3>Join Links</h3>
        <div className="button-row">
          <Link href={`/admin/game/${props.gameId}/join-view`}>
            <a className="btn btn--primary">Open Deliberation Join View</a>
          </Link>
        </div>
        <div className="invite-list">
          <div className="invite-row">
            <div>
              <strong>Manual Join Link</strong>
              <div className="muted">Share this link for self-join entry.</div>
            </div>
            <code>{manualJoinUrl}</code>
            <Button variant="ghost" onClick={() => void copyToClipboard(manualJoinUrl)}>
              Copy
            </Button>
          </div>
          {playerLinks.map((link: any) => (
            <div key={link.playerId} className="invite-row">
              <div>
                <strong>
                  Seat {link.seatNumber}: {link.name}
                </strong>
                <div className="muted">Re-entry link for this participant.</div>
              </div>
              <code>{link.url}</code>
              <Button variant="ghost" onClick={() => void copyToClipboard(link.url)}>
                Copy
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Pre-Registered Roster</h3>
        <Field label="Paste one player per line: name,email">
          <textarea
            rows={6}
            value={rosterText}
            onChange={(event) => setRosterText(event.target.value)}
            placeholder={'Jane Doe,jane@example.com\nJohn Smith,john@example.com'}
          />
        </Field>
        <Button onClick={applyRoster}>Apply Roster</Button>
      </section>

      <section className="panel">
        <h3>Player Progress</h3>
        <ProgressBoard players={state?.players || []} />
      </section>

      <section className="panel">
        <h3>Export</h3>
        <Button onClick={exportState}>Export JSON</Button>
        {exportJson ? <pre className="code-block">{exportJson}</pre> : null}
      </section>
    </div>
  );
}
