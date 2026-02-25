export default function StageHeader(props: { title: string; subtitle?: string; status?: string }) {
  return (
    <header className="page__header">
      <h1>{props.title}</h1>
      {props.subtitle ? <p>{props.subtitle}</p> : null}
      {props.status ? <div className="lens-pill">Status: {props.status}</div> : null}
    </header>
  );
}
