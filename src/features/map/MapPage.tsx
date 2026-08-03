import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, LocateFixed, Navigation, Pencil, Plus, Search, Trash2, Undo2, X } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { loadPhotoObjectUrl, type UnlockedWorkspace } from '../../data/repository';
import { categories, categoryMeta, type Category, type Memory, type Place } from '../../domain/models';
import { toAmapNavigationUrl } from '../../services/coordinates';
import { FilmFrame } from '../../shared/FilmFrame';
import { MemoryForm } from '../memories/MemoryForm';
import { PlaceForm } from '../places/PlaceForm';
import { MapCanvas } from './MapCanvas';
import { deriveMapPresentation } from './presentation';

type Filter = 'all' | Category;
type PositionMode = { kind: 'add' } | { kind: 'edit'; place: Place };

interface MapPageProps {
  startAdding: boolean;
  onAddConsumed: () => void;
  initialSelectedId: string | null;
  onInitialSelectionConsumed: () => void;
}

export function MapPage({ startAdding, onAddConsumed, initialSelectedId, onInitialSelectionConsumed }: MapPageProps) {
  const { session, snapshot, upsertPlace, deletePlace, undoDeletePlace, upsertMemory, addPhotos } = useWorkspace();
  const pageRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [expanded, setExpanded] = useState(false);
  const [positionMode, setPositionMode] = useState<PositionMode | null>(startAdding ? { kind: 'add' } : null);
  const [position, setPosition] = useState({ lat: 30.5404, lng: 114.3634 });
  const [formPlace, setFormPlace] = useState<Place | null | undefined>(undefined);
  const [memoryPlace, setMemoryPlace] = useState<Place | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [undoPlace, setUndoPlace] = useState<Place | null>(null);
  const [locateRequest, setLocateRequest] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { if (startAdding) onAddConsumed(); }, [onAddConsumed, startAdding]);
  useEffect(() => { if (initialSelectedId) onInitialSelectionConsumed(); }, [initialSelectedId, onInitialSelectionConsumed]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const denied = () => setNotice('定位权限不可用，可以拖动地图并使用准星选点。');
    page.addEventListener('location-denied', denied);
    return () => page.removeEventListener('location-denied', denied);
  }, []);

  useEffect(() => {
    if (!undoPlace) return;
    const timer = window.setTimeout(() => setUndoPlace(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [undoPlace]);

  const visiblePlaces = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    return snapshot.places.filter((place) => {
      const categoryMatch = filter === 'all' || place.category === filter;
      const queryMatch = !normalized || `${place.name} ${place.note} ${categoryMeta[place.category].label}`.toLocaleLowerCase('zh-CN').includes(normalized);
      return categoryMatch && queryMatch;
    });
  }, [filter, query, snapshot.places]);

  const presentations = useMemo(
    () => deriveMapPresentation(snapshot.places, snapshot.memories),
    [snapshot.memories, snapshot.places],
  );
  const selected = snapshot.places.find((place) => place.id === selectedId) ?? null;
  const selectedMemories = selected ? snapshot.memories.filter((memory) => memory.placeId === selected.id) : [];
  const latestMemoryId = selected ? presentations.get(selected.id)?.latestMemoryId ?? null : null;
  const latestMemory = latestMemoryId ? snapshot.memories.find((memory) => memory.id === latestMemoryId) ?? null : null;
  const latestFrameLabel = latestMemory ? `FRAME ${String(latestMemory.frameNumber).padStart(3, '0')}` : 'NEW PLACE';
  const latestDate = latestMemory?.occurredOn?.replaceAll('-', ' / ') ?? 'DATE UNRECORDED';
  const dayCount = calculateDayCount(snapshot.relationship.togetherOn);

  function beginEdit(place: Place) {
    setPosition({ lat: place.lat, lng: place.lng });
    setPositionMode({ kind: 'edit', place });
    setExpanded(false);
  }

  function confirmPosition() {
    if (!positionMode) return;
    setFormPlace(positionMode.kind === 'edit' ? positionMode.place : null);
    setPositionMode(null);
  }

  async function saveForm(place: Place) {
    const saved = await upsertPlace(place);
    setSelectedId(saved.id);
    setFormPlace(undefined);
    setNotice('地点已加密保存');
  }

  async function removeSelected() {
    if (!selected) return;
    const deleted = await deletePlace(selected);
    setUndoPlace(deleted);
    setSelectedId(null);
    setExpanded(false);
    setConfirmDelete(false);
  }

  function navigate(place: Place) {
    const opened = window.open(toAmapNavigationUrl(place), '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
  }

  return (
    <div ref={pageRef} className="map-page">
      <MapCanvas
        places={visiblePlaces}
        selectedId={selectedId}
        presentations={presentations}
        positioning={positionMode !== null}
        onSelect={(id) => { setSelectedId(id); setExpanded(false); setConfirmDelete(false); }}
        onPositionChange={(lat, lng) => { if (positionMode) setPosition({ lat, lng }); }}
        locateRequest={locateRequest}
      />

      <header className="map-header">
        <div className="film-map-heading">
          <span className="roll-stamp">ROLL 01</span>
          <div><p className="eyebrow">LUOJIA / PRIVATE ARCHIVE</p><h1>我们的武大</h1></div>
          <div className="day-stamp"><span>TOGETHER</span><strong>{dayCount === null ? '未设置' : `DAY ${dayCount.toLocaleString('zh-CN')}`}</strong></div>
        </div>
        <div className="map-search-row">
          <label className="map-search"><Search aria-hidden="true" size={17} /><span className="sr-only">搜索地点</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索地点与备注" /></label>
          <button className="map-icon-command" type="button" onClick={() => setLocateRequest((value) => value + 1)} aria-label="定位到当前位置"><LocateFixed aria-hidden="true" size={19} /></button>
        </div>
        <div className="filter-strip" aria-label="地点分类">
          <button className={filter === 'all' ? 'active' : ''} type="button" onClick={() => setFilter('all')}>全部 <span>{snapshot.places.length}</span></button>
          {categories.map((category) => (
            <button key={category} className={filter === category ? 'active' : ''} type="button" onClick={() => setFilter(category)}>
              {categoryMeta[category].label} <span>{snapshot.places.filter((place) => place.category === category).length}</span>
            </button>
          ))}
        </div>
      </header>

      {query && visiblePlaces.length === 0 && <div className="map-empty">没有匹配的地点</div>}

      {positionMode && (
        <div className="position-toolbar" role="status">
          <div><Crosshair aria-hidden="true" /><span>{positionMode.kind === 'edit' ? '移动地图调整地点' : '移动地图让准星对准位置'}</span></div>
          <div className="position-actions"><button type="button" onClick={() => setPositionMode(null)}><X aria-hidden="true" size={18} />取消</button><button className="confirm" type="button" onClick={confirmPosition}>确认位置</button></div>
        </div>
      )}

      {selected && !positionMode && (
        <aside className={expanded ? 'place-summary expanded' : 'place-summary'} aria-label={`${selected.name}详情`}>
          <button className="summary-main" type="button" onClick={() => setExpanded((value) => !value)} aria-label={`${selected.name}，${latestFrameLabel}，${latestDate}，${expanded ? '收起' : '详情'}`}>
            <MapTicketFrame memory={latestMemory} session={session} color={categoryMeta[selected.category].color} />
            <span className="summary-copy"><strong>{selected.name}</strong><small>{categoryMeta[selected.category].label}{latestMemory?.occurredOn ? ` · ${latestMemory.occurredOn}` : ''}</small></span>
            <span className="summary-hint">{expanded ? '收起' : '详情'}</span>
          </button>
          {expanded && (
            <div className="summary-detail">
              <p>{selected.note || '还没有备注'}</p>
              <div className="summary-stats"><span>{selectedMemories.length} 段回忆</span><span>WGS {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}</span></div>
              <div className="summary-actions">
                <button type="button" onClick={() => navigate(selected)}><Navigation aria-hidden="true" />导航</button>
                <button type="button" onClick={() => setMemoryPlace(selected)}><Plus aria-hidden="true" />回忆</button>
                <button type="button" onClick={() => beginEdit(selected)}><Pencil aria-hidden="true" />编辑</button>
                <button className="danger" type="button" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" />删除</button>
              </div>
              {confirmDelete && <div className="delete-confirm"><p>删除后 30 天内可以恢复。</p><button type="button" onClick={() => setConfirmDelete(false)}>保留</button><button className="danger-solid" type="button" onClick={() => void removeSelected()}>确认删除</button></div>}
            </div>
          )}
          {!expanded && <button className="summary-nav" type="button" onClick={() => navigate(selected)} aria-label={`导航到${selected.name}`}><Navigation aria-hidden="true" size={18} /></button>}
        </aside>
      )}

      {formPlace !== undefined && session && <PlaceForm value={formPlace} lat={position.lat} lng={position.lng} deviceId={session.deviceId} onClose={() => setFormPlace(undefined)} onSave={saveForm} />}
      {memoryPlace && session && <MemoryForm place={memoryPlace} frameNumber={snapshot.memories.length + 1} deviceId={session.deviceId} onClose={() => setMemoryPlace(null)} onSave={async (memory, files) => { const saved = await upsertMemory(memory); if (files.length > 0) await addPhotos(saved, files); setMemoryPlace(null); setNotice('回忆已存入胶片册'); }} />}

      {undoPlace && <div className="undo-toast" role="status"><span>地点已删除</span><button type="button" onClick={() => void undoDeletePlace(undoPlace).then(() => setUndoPlace(null))}><Undo2 aria-hidden="true" />撤销</button></div>}
      {notice && <button className="notice-toast" type="button" onClick={() => setNotice(null)}>{notice}</button>}
    </div>
  );
}

function MapTicketFrame({ memory, session, color }: { memory: Memory | null; session: UnlockedWorkspace | null; color: string }) {
  const memoryId = memory?.id ?? null;
  const photoId = memory?.photoIds[0] ?? null;
  const photoKey = session && memoryId && photoId ? `${session.workspace.id}:${memoryId}:${photoId}` : null;
  const [photo, setPhoto] = useState<{ key: string; url: string } | null>(null);
  const photoUrl = photo?.key === photoKey ? photo.url : null;

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (session && memoryId && photoId && photoKey) {
      void loadPhotoObjectUrl(session, photoId, memoryId).then((url) => {
        if (!url) return;
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPhoto({ key: photoKey, url });
      }).catch(() => {
        // FilmFrame keeps the frame metadata visible as an unexposed fallback.
      });
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [memoryId, photoId, photoKey, session]);

  const isNewPlace = memory === null;
  return (
    <FilmFrame
      frameNumber={memory?.frameNumber ?? 0}
      {...(isNewPlace ? { frameLabel: 'NEW PLACE' } : {})}
      date={memory?.occurredOn?.replaceAll('-', ' / ') ?? 'DATE UNRECORDED'}
      media={isNewPlace
        ? <span className="film-thumb" style={{ '--category-color': color } as React.CSSProperties} aria-hidden="true" />
        : photoUrl
          ? <img src={photoUrl} alt="" />
          : undefined}
      hasMedia={isNewPlace || photoUrl !== null}
      children={null}
      variant="thumbnail"
    />
  );
}

function calculateDayCount(value: string | null): number | null {
  if (!value) return null;
  const start = new Date(`${value}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(1, Math.floor((Date.now() - start.getTime()) / 86_400_000) + 1);
}
