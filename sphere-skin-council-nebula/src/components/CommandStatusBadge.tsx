export default function CommandStatusBadge(props: { status?: string }) {
  const status = props.status || 'unknown';
  return <span className={`pill pill--${status}`}>{status}</span>;
}
