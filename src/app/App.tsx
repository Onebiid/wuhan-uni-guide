import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Map, Music2, Plus, Settings } from 'lucide-react';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
import { UnlockView } from '../features/unlock/UnlockView';
import { MapPage } from '../features/map/MapPage';
import { MemoryPage } from '../features/memories/MemoryPage';
import { MusicPage } from '../features/music/MusicPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { PwaUpdateNotice } from './PwaUpdateNotice';

type AppSection = 'map' | 'memories' | 'music' | 'settings';

const items: Array<{ id: AppSection; label: string; icon: typeof Map }> = [
  { id: 'map', label: '地图', icon: Map },
  { id: 'memories', label: '胶片', icon: BookOpen },
  { id: 'music', label: '声音', icon: Music2 },
  { id: 'settings', label: '档案', icon: Settings },
];

export function App() {
  return <WorkspaceProvider><AppContent /></WorkspaceProvider>;
}

function AppContent() {
  const { bootState, snapshot, lock } = useWorkspace();
  const [section, setSection] = useState<AppSection>('map');
  const [mapKey, setMapKey] = useState(0);
  const [startAdding, setStartAdding] = useState(false);
  const [focusPlaceId, setFocusPlaceId] = useState<string | null>(null);
  const consumeAdd = useCallback(() => setStartAdding(false), []);
  const consumeFocus = useCallback(() => setFocusPlaceId(null), []);

  useEffect(() => {
    if (bootState !== 'unlocked') return;
    const timeoutMs = snapshot.relationship.autoLockMinutes * 60_000;
    let timer = window.setTimeout(lock, timeoutMs);
    let lastActivity = Date.now();
    const reset = () => {
      lastActivity = Date.now();
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, timeoutMs);
    };
    const visible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastActivity >= timeoutMs) lock();
    };
    window.addEventListener('pointerdown', reset, { passive: true });
    window.addEventListener('keydown', reset);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [bootState, lock, snapshot.relationship.autoLockMinutes]);

  if (bootState === 'loading') return <main className="boot-screen"><div className="seal">WHU<br />US</div><p>正在打开安全空间...</p></main>;
  if (bootState !== 'unlocked') return <UnlockView />;

  function requestAdd() {
    setSection('map');
    setStartAdding(true);
    setMapKey((value) => value + 1);
  }

  function openMap(placeId?: string) {
    setSection('map');
    if (placeId) {
      setFocusPlaceId(placeId);
      setMapKey((value) => value + 1);
    }
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        {section === 'map' && <MapPage key={mapKey} startAdding={startAdding} onAddConsumed={consumeAdd} initialSelectedId={focusPlaceId} onInitialSelectionConsumed={consumeFocus} />}
        {section === 'memories' && <MemoryPage onOpenMap={openMap} />}
        {section === 'music' && <MusicPage />}
        {section === 'settings' && <SettingsPage />}
      </main>
      <nav className="bottom-nav" aria-label="主要导航">
        {items.slice(0, 2).map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? 'nav-item active' : 'nav-item'} onClick={() => setSection(id)} type="button"><Icon aria-hidden="true" size={21} strokeWidth={1.8} /><span>{label}</span></button>)}
        <button className="add-button" type="button" aria-label="添加地点" onClick={requestAdd}><Plus aria-hidden="true" size={25} /></button>
        {items.slice(2).map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? 'nav-item active' : 'nav-item'} onClick={() => setSection(id)} type="button"><Icon aria-hidden="true" size={21} strokeWidth={1.8} /><span>{label}</span></button>)}
      </nav>
      <PwaUpdateNotice />
    </div>
  );
}
