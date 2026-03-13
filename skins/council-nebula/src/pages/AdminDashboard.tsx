import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import StageHeader from '../components/StageHeader';
import { Button, Field } from '../components/Field';
import {
  adminCreateGame,
  adminGetRedTeamReport,
  adminListGames,
  adminLock,
  adminSession,
  type AdminRedTeamReportResponse,
  type AdminRedTeamScenario,
  type AdminRedTeamTrendPoint
} from '../lib/api';
import { clearAdminWsToken } from '../lib/session';

function formatTimestamp(value?: string | null) {
  if (!value) return 'Unavailable';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatAttackClass(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(' ');
}

function buildTrendPoints(values: number[], width: number, height: number, padding = 10) {
  if (values.length === 0) {
    return '';
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return values
    .map((value, index) => {
      const x = padding + (values.length === 1 ? usableWidth / 2 : (index / (values.length - 1)) * usableWidth);
      const normalized = (value - minValue) / range;
      const y = height - padding - normalized * usableHeight;
      return `${x},${y}`;
    })
    .join(' ');
}

function formatChartValue(value: number | null, formatter: (value: number) => string) {
  if (value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return formatter(value);
}

function RedTeamTrendChart(props: {
  title: string;
  subtitle: string;
  series: AdminRedTeamTrendPoint[];
  valueAccessor: (point: AdminRedTeamTrendPoint) => number | null;
  formatter: (value: number) => string;
  stroke: string;
}) {
  const values = props.series
    .map((point) => props.valueAccessor(point))
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return (
      <div className="redteam-chart">
        <div className="redteam-chart__header">
          <div>
            <strong>{props.title}</strong>
            <div className="muted">{props.subtitle}</div>
          </div>
        </div>
        <p className="muted">No chartable history yet.</p>
      </div>
    );
  }

  const points = buildTrendPoints(values, 320, 96);
  const latestValue = values.length > 0 ? values[values.length - 1] : null;
  const peakValue = Math.max(...values);

  return (
    <div className="redteam-chart">
      <div className="redteam-chart__header">
        <div>
          <strong>{props.title}</strong>
          <div className="muted">{props.subtitle}</div>
        </div>
        <div className="redteam-chart__stats">
          <span>{formatChartValue(latestValue, props.formatter)}</span>
          <span className="muted">peak {formatChartValue(peakValue, props.formatter)}</span>
        </div>
      </div>
      <svg viewBox="0 0 320 96" className="redteam-chart__svg" aria-hidden="true">
        <polyline
          fill="none"
          stroke={props.stroke}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
}

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
  const [redTeamReport, setRedTeamReport] = useState<AdminRedTeamReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    adminSession()
      .then((result) => {
        if (!result.ok) {
          navigate('/admin/unlock');
          return;
        }

        void loadGames();
        void loadRedTeamReport();
      })
      .catch(() => navigate('/admin/unlock'));
  }, []);

  async function loadGames() {
    const data = await adminListGames();
    setGames(data.games);
  }

  async function loadRedTeamReport() {
    setReportLoading(true);
    setReportError(null);

    try {
      const response = await adminGetRedTeamReport();
      setRedTeamReport(response);
    } catch (err) {
      setReportError((err as Error).message);
    } finally {
      setReportLoading(false);
    }
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
      await loadGames();
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

  const report = redTeamReport?.report;
  const trend = redTeamReport?.trend;
  const trendSeries = trend?.series ?? [];
  const recentRuns = redTeamReport?.history?.runs.slice(0, 5) ?? [];
  const recentScenarios = [...(report?.scenarios ?? [])]
    .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
    .slice(0, 6);

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

      <section className="panel panel--glow">
        <div className="redteam-report__header">
          <div>
            <h3>Governance Red-Team</h3>
            <p className="muted">
              Latest PG-backed adversarial run artifact for signature, quorum, replay, rotation, and
              degraded-mode defenses.
            </p>
          </div>
          <div className="button-row">
            <Button variant="ghost" onClick={() => void loadRedTeamReport()} disabled={reportLoading}>
              {reportLoading ? 'Refreshing...' : 'Refresh Report'}
            </Button>
          </div>
        </div>

        {reportError ? <p className="error">{reportError}</p> : null}

        {report ? (
          <>
            <div className="redteam-metrics">
              <div className="redteam-metric">
                <span className="redteam-metric__label">Scenarios</span>
                <strong>{report.metrics.totalScenarios}</strong>
              </div>
              <div className="redteam-metric">
                <span className="redteam-metric__label">Passed</span>
                <strong>{report.metrics.passedScenarios}</strong>
              </div>
              <div className="redteam-metric">
                <span className="redteam-metric__label">Blocked Probes</span>
                <strong>{report.metrics.blockedProbeScenarios}</strong>
              </div>
              <div className="redteam-metric">
                <span className="redteam-metric__label">Last Run</span>
                <strong>{formatTimestamp(redTeamReport?.updatedAt ?? report.generatedAt)}</strong>
              </div>
            </div>

            <div className="redteam-report__meta">
              <span className="muted">
                Runner status: {report.runner?.status ?? 'unknown'} | Suite: {report.suite} | Source:{' '}
                {redTeamReport?.storageSource ?? 'unavailable'}
              </span>
              <code className="redteam-report__path">{redTeamReport?.reportPath}</code>
            </div>

            {trend ? (
              <div className="redteam-metrics">
                <div className="redteam-metric">
                  <span className="redteam-metric__label">History Window</span>
                  <strong>{trend.runCount} runs</strong>
                </div>
                <div className="redteam-metric">
                  <span className="redteam-metric__label">Pass Rate</span>
                  <strong>{trend.passRate !== null ? `${Math.round(trend.passRate * 100)}%` : 'n/a'}</strong>
                </div>
                <div className="redteam-metric">
                  <span className="redteam-metric__label">Avg Duration</span>
                  <strong>
                    {trend.averageDurationMs !== null ? `${Math.round(trend.averageDurationMs)} ms` : 'n/a'}
                  </strong>
                </div>
                <div className="redteam-metric">
                  <span className="redteam-metric__label">Avg Blocked Probes</span>
                  <strong>
                    {trend.averageBlockedProbeScenarios !== null
                      ? trend.averageBlockedProbeScenarios.toFixed(1)
                      : 'n/a'}
                  </strong>
                </div>
              </div>
            ) : null}

            {trendSeries.length > 0 ? (
              <div className="redteam-chart-grid">
                <RedTeamTrendChart
                  title="Scenario Pass Rate"
                  subtitle="Per-run scenario success ratio across the retained trend window."
                  series={trendSeries}
                  valueAccessor={(point) => (point.scenarioPassRate !== null ? point.scenarioPassRate * 100 : null)}
                  formatter={(value) => `${Math.round(value)}%`}
                  stroke="var(--accent-cyan)"
                />
                <RedTeamTrendChart
                  title="Run Duration"
                  subtitle="PG-backed harness wall-clock duration, oldest to newest."
                  series={trendSeries}
                  valueAccessor={(point) => point.durationMs}
                  formatter={(value) => `${Math.round(value)} ms`}
                  stroke="var(--accent-gold)"
                />
              </div>
            ) : null}

            <div className="redteam-attack-classes">
              {Object.entries(report.metrics.attackClassCounts)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([attackClass, count]) => (
                  <span key={attackClass} className="pill pill--assignment">
                    {formatAttackClass(attackClass)}: {count}
                  </span>
                ))}
            </div>

            {recentRuns.length > 0 ? (
              <div className="redteam-scenarios">
                {recentRuns.map((run) => (
                  <article key={run.runId} className="redteam-scenario">
                    <div className="redteam-scenario__header">
                      <div>
                        <strong>{run.runId}</strong>
                        <div className="muted">
                          {formatTimestamp(run.generatedAt)} | {run.totalScenarios} scenarios |{' '}
                          {run.durationMs !== null ? `${Math.round(run.durationMs)} ms` : 'duration n/a'}
                        </div>
                      </div>
                      <span className={`pill pill--${run.status === 'passed' ? 'completed' : 'failed'}`}>
                        {run.status}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="redteam-scenarios">
              {recentScenarios.map((scenario: AdminRedTeamScenario) => (
                <article key={scenario.scenarioId} className="redteam-scenario">
                  <div className="redteam-scenario__header">
                    <div>
                      <strong>{scenario.scenarioId}</strong>
                      <div className="muted">
                        {formatAttackClass(scenario.attackClass)} | Captured {formatTimestamp(scenario.capturedAt)}
                      </div>
                    </div>
                    <span className={`pill pill--${scenario.status === 'passed' ? 'completed' : 'failed'}`}>
                      {scenario.status}
                    </span>
                  </div>
                  <pre className="redteam-scenario__payload">
                    {JSON.stringify(
                      {
                        expected: scenario.expected,
                        observed: scenario.observed
                      },
                      null,
                      2
                    )}
                  </pre>
                </article>
              ))}
            </div>
          </>
        ) : reportLoading ? (
          <p className="muted">Loading latest red-team artifact...</p>
        ) : (
          <div className="redteam-report__empty">
            <p className="muted">
              No red-team report artifact is available yet. Run the PG red-team harness to populate this
              panel.
            </p>
            <code className="redteam-report__path">
              {redTeamReport?.reportPath ?? 'artifacts/redteam/governance-redteam-report.json'}
            </code>
          </div>
        )}
      </section>

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
