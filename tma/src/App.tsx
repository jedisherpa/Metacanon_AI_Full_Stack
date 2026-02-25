import { useState, useEffect } from 'react';
import { Route, Switch } from 'wouter';
import { api, type AtlasState } from './lib/api';
import AtlasHome from './pages/AtlasHome';
import CitadelPage from './pages/CitadelPage';
import ForgePage from './pages/ForgePage';
import HubPage from './pages/HubPage';
import EngineRoomPage from './pages/EngineRoomPage';
import BottomNav from './components/BottomNav';
import LoadingScreen from './components/LoadingScreen';
import ErrorScreen from './components/ErrorScreen';

export default function App() {
  const [atlasState, setAtlasState] = useState<AtlasState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAtlasState()
      .then((state) => {
        setAtlasState(state);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message ?? 'Failed to load Atlas');
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingScreen />;
  if (error || !atlasState) return <ErrorScreen message={error ?? 'Unknown error'} />;

  return (
    <div className="flex flex-col h-full bg-void">
      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        <Switch>
          <Route path="/" component={() => <AtlasHome state={atlasState} onStateUpdate={setAtlasState} />} />
          <Route path="/citadel" component={() => <CitadelPage profile={atlasState.profile} />} />
          <Route path="/forge" component={() => <ForgePage profile={atlasState.profile} />} />
          <Route path="/hub" component={() => <HubPage profile={atlasState.profile} />} />
          <Route path="/engine-room" component={() => <EngineRoomPage />} />
          {/* Default redirect */}
          <Route component={() => <AtlasHome state={atlasState} onStateUpdate={setAtlasState} />} />
        </Switch>
      </div>

      {/* Bottom navigation */}
      <BottomNav territories={atlasState.territories} />
    </div>
  );
}
