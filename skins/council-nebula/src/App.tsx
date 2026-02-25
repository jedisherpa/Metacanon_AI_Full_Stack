import { Link, Route, Switch } from 'wouter';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import AdminUnlock from './pages/AdminUnlock';
import AdminDashboard from './pages/AdminDashboard';
import AdminGameConsole from './pages/AdminGameConsole';
import AdminDeliberationJoinView from './pages/AdminDeliberationJoinView';
import PlayerEntry from './pages/PlayerEntry';
import PlayerLobby from './pages/PlayerLobby';
import PlayerRound1 from './pages/PlayerRound1';
import PlayerRound2 from './pages/PlayerRound2';
import PlayerDeliberation from './pages/PlayerDeliberation';
import PlayerResults from './pages/PlayerResults';
import PlayerStageTransition from './pages/PlayerStageTransition';

const App = () => {
  return (
    <div className="shell">
      <nav className="nav">
        <Link href="/">
          <a className="nav__brand">Council Nebula</a>
        </Link>
        <div className="nav__links">
          <Link href="/admin/unlock">
            <a>Admin Panel</a>
          </Link>
        </div>
      </nav>

      <main>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/admin/unlock" component={AdminUnlock} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/game/:id">
            {(params) => <AdminGameConsole gameId={params.id} />}
          </Route>
          <Route path="/admin/game/:id/join-view">
            {(params) => <AdminDeliberationJoinView gameId={params.id} />}
          </Route>

          <Route path="/play/:id/join">
            {(params) => <PlayerEntry gameId={params.id} />}
          </Route>
          <Route path="/play/:id/access/:token">
            {(params) => <PlayerEntry gameId={params.id} accessToken={params.token} />}
          </Route>
          <Route path="/play/:id/lobby">
            {(params) => <PlayerLobby gameId={params.id} />}
          </Route>
          <Route path="/play/:id/round1">
            {(params) => <PlayerRound1 gameId={params.id} />}
          </Route>
          <Route path="/play/:id/round2">
            {(params) => <PlayerRound2 gameId={params.id} />}
          </Route>
          <Route path="/play/:id/deliberation">
            {(params) => <PlayerDeliberation gameId={params.id} />}
          </Route>
          <Route path="/play/:id/transition">
            {(params) => <PlayerStageTransition gameId={params.id} />}
          </Route>
          <Route path="/play/:id/results">
            {(params) => <PlayerResults gameId={params.id} />}
          </Route>

          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
};

export default App;
