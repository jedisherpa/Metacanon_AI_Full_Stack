import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="page">
      <h1>Page Not Found</h1>
      <p>The corridor ends here.</p>
      <Link href="/">
        <a className="btn btn--ghost">Return home</a>
      </Link>
    </div>
  );
}
