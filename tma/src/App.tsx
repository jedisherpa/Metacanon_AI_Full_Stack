import { useState, useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { api, type AtlasState } from './lib/api';
import { getOpenClawCommandId } from './lib/commands';
import { getTelegramStartParam } from './lib/telegram';
import {
  parseCycleInviteCodeFromStartParam,
  parseCycleThreadIdFromStartParam
} from './lib/cycleInvite';
import AtlasHome from './pages/AtlasHome';
import CitadelPage from './pages/CitadelPage';
import ForgePage from './pages/ForgePage';
import HubPage from './pages/HubPage';
import EngineRoomPage from './pages/EngineRoomPage';
import BottomNav from './components/BottomNav';
import LoadingScreen from './components/LoadingScreen';
import ErrorScreen from './components/ErrorScreen';
import { SkinSwitcher } from './components/SkinSwitcher';
import { useSkin } from './contexts/SkinProvider';

export default function App() {
  const [location, navigate] = useLocation();
  const { activeMeta } = useSkin();
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

  useEffect(() => {
    const startParam = getTelegramStartParam();
    const commandId = getOpenClawCommandId(startParam);
    if (commandId) {
      if (location !== '/') return;
      navigate(`/open-claw?command=${encodeURIComponent(commandId)}`);
      return;
    }

    const cycleInviteCode = parseCycleInviteCodeFromStartParam(startParam);
    if (cycleInviteCode) {
      if (location !== '/') return;
      navigate(`/forge?cycleInviteCode=${encodeURIComponent(cycleInviteCode)}`);
      return;
    }

    const cycleThreadId = parseCycleThreadIdFromStartParam(startParam);
    if (!cycleThreadId) return;
    if (location !== '/') return;
    navigate(`/forge?cycleThreadId=${encodeURIComponent(cycleThreadId)}`);
  }, [location, navigate]);

  if (loading) return <LoadingScreen />;
  if (error || !atlasState) return <ErrorScreen message={error ?? 'Unknown error'} />;

  const showMobileSkinSwitcher = location === '/forge' || location === '/engine-room' || location === '/open-claw';

  return (
    <div className="h-full min-h-0">
      <div className="app-ambient" />
      <div className="app-shell flex flex-col h-full min-h-0">
        <header className="lf-top-bar">
          <span className="lf-top-bar__title">
            <span className="lf-top-bar__accent" />
            MetaCanon Lens Forge · {activeMeta.name}
          </span>
          <div className="lf-top-bar__right">
            <SkinSwitcher />
          </div>
        </header>
        {/* Main content area */}
        <div className={`flex-1 min-h-0 overflow-hidden ${showMobileSkinSwitcher ? 'pb-16' : ''}`}>
          <Switch>
            <Route path="/" component={() => <AtlasHome state={atlasState} onStateUpdate={setAtlasState} />} />
            <Route path="/citadel" component={() => <CitadelPage profile={atlasState.profile} />} />
            <Route path="/forge" component={() => <ForgePage profile={atlasState.profile} />} />
            <Route path="/hub" component={() => <HubPage profile={atlasState.profile} />} />
            <Route path="/engine-room" component={() => <EngineRoomPage />} />
            <Route path="/open-claw" component={() => <EngineRoomPage defaultTab="commands" />} />
            {/* Default redirect */}
            <Route component={() => <AtlasHome state={atlasState} onStateUpdate={setAtlasState} />} />
          </Switch>
        </div>
        {showMobileSkinSwitcher && (
          <div className="sm:hidden">
            <SkinSwitcher variant="bottom" />
          </div>
        )}

        {/* Bottom navigation */}
        <BottomNav territories={atlasState.territories} />
      </div>
    </div>
  );
}
