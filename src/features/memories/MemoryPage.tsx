import { useEffect, useMemo, useState } from 'react';
import { MapPin, RefreshCw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useWorkspace } from '../../app/WorkspaceContext';
import { loadPhotoObjectUrl } from '../../data/repository';
import type { Memory } from '../../domain/models';
import { FilmFrame } from '../../shared/FilmFrame';

interface MemoryPageProps {
  onOpenMap: (placeId?: string) => void;
}

export function MemoryPage({ onOpenMap }: MemoryPageProps) {
  const { snapshot } = useWorkspace();
  const [selected, setSelected] = useState<Memory | null>(null);
  const sorted = useMemo(() => [...snapshot.memories].sort((a, b) => {
    const left = a.occurredOn ?? String(a.createdAt);
    const right = b.occurredOn ?? String(b.createdAt);
    return right.localeCompare(left);
  }), [snapshot.memories]);
  const groups = useMemo(() => groupByYear(sorted), [sorted]);
  const togetherDays = calculateDays(snapshot.relationship.togetherOn);

  return (
    <section className="memory-page">
      <header className="memory-header">
        <p className="eyebrow">OUR SHARED FILM · ROLL 01</p>
        <div className="memory-title-row"><h1>我们的武大</h1><div className="day-stamp"><span>TOGETHER</span><strong>{togetherDays ? `DAY ${togetherDays.toLocaleString('zh-CN')}` : '未设置日期'}</strong></div></div>
        <div className="film-counter"><span>{String(sorted.length).padStart(2, '0')} FRAMES</span><i /><span>{snapshot.places.length} PLACES</span></div>
      </header>

      <div className="memory-scroll">
        {groups.length === 0 ? (
          <div className="memory-empty"><div className="empty-film"><span>FRAME 000</span></div><h2>胶片还没有曝光</h2><p>从地图选择一个地点，记录第一段回忆。</p><button type="button" onClick={() => onOpenMap()}>回到地图</button></div>
        ) : groups.map(([year, memories]) => (
          <section className="memory-year" key={year}>
            <div className="year-rule"><span>{year}</span><i /></div>
            {memories.map((memory) => {
              const place = snapshot.places.find((item) => item.id === memory.placeId);
              return <article className="memory-card" key={memory.id}>
                <FilmFrame
                  frameNumber={memory.frameNumber}
                  date={formatDate(memory.occurredOn)}
                  media={<MemoryCover memory={memory} />}
                  hasMedia={memory.photoIds.length > 0}
                >
                  <button className="memory-card-open" type="button" onClick={() => setSelected(memory)} aria-label={`打开回忆：${memory.title}`}>
                    <span className="memory-card-copy">
                      <strong role="heading" aria-level={2}>{memory.title}</strong>
                      <span>{place?.name ?? '未关联地点'}{memory.text ? ` · ${memory.text}` : ''}</span>
                    </span>
                  </button>
                </FilmFrame>
              </article>;
            })}
          </section>
        ))}
      </div>

      {selected && <MemoryDetail memory={selected} placeName={snapshot.places.find((place) => place.id === selected.placeId)?.name ?? '未关联地点'} onClose={() => setSelected(null)} onMap={() => onOpenMap(selected.placeId)} />}
    </section>
  );
}

export function MemoryCover({ memory }: { memory: Memory }) {
  const { session } = useWorkspace();
  const workspaceId = session?.workspace.id;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ settled: boolean; url: string | null }>({
    settled: false,
    url: null,
  });
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    queueMicrotask(() => {
      if (active) setState({ settled: false, url: null });
    });
    if (session && memory.photoIds[0]) {
      void loadPhotoObjectUrl(session, memory.photoIds[0], memory.id)
        .then((value) => {
          objectUrl = value;
          if (active) setState({ settled: true, url: value });
          else if (value) URL.revokeObjectURL(value);
        })
        .catch(() => {
          if (active) setState({ settled: true, url: null });
        });
    } else {
      queueMicrotask(() => {
        if (active) setState({ settled: true, url: null });
      });
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // Session keys are scoped by workspace; the provider object identity need not be stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, memory.id, memory.photoIds, workspaceId]);
  if (!state.settled) return <span>DEVELOPING</span>;
  return state.url
    ? <img src={state.url} alt={memory.title} />
    : <button className="photo-retry" type="button" onClick={() => setAttempt((value) => value + 1)}><RefreshCw aria-hidden="true" />重试照片</button>;
}

export function MemoryDetail({ memory, placeName, onClose, onMap }: { memory: Memory; placeName: string; onClose: () => void; onMap: () => void }) {
  const { session } = useWorkspace();
  const workspaceId = session?.workspace.id;
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    const created: string[] = [];
    const settledUrls: Array<string | null> = Array.from({ length: memory.photoIds.length }, () => null);
    let settledCount = 0;
    const settlePhoto = (index: number, value: string | null) => {
      if (!active) {
        if (value) URL.revokeObjectURL(value);
        return;
      }
      settledUrls[index] = value;
      settledCount += 1;
      if (value) created.push(value);
      if (settledCount === memory.photoIds.length) {
        setUrls(settledUrls.filter((url): url is string => url !== null));
      }
    };
    if (session) {
      memory.photoIds.forEach((id, index) => {
        void loadPhotoObjectUrl(session, id, memory.id)
          .then((value) => settlePhoto(index, value))
          .catch(() => settlePhoto(index, null));
      });
    }
    return () => { active = false; created.forEach((url) => URL.revokeObjectURL(url)); };
    // Session keys are scoped by workspace; the provider object identity need not be stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory.id, memory.photoIds, workspaceId]);
  return createPortal(<div className="sheet-backdrop"><article className="memory-detail" role="dialog" aria-modal="true" aria-labelledby="memory-detail-title"><header><div><p className="sheet-kicker">FRAME {String(memory.frameNumber).padStart(3, '0')}</p><h2 id="memory-detail-title">{memory.title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X aria-hidden="true" /></button></header>{urls.length > 0 && <div className="memory-gallery">{urls.map((url, index) => <img key={url} src={url} alt={`${memory.title}照片 ${index + 1}`} />)}</div>}<time className="memory-stamp">{formatDate(memory.occurredOn)}</time><p>{memory.text || '这段回忆还没有文字。'}</p><button className="map-return" type="button" onClick={onMap}><MapPin aria-hidden="true" />{placeName}</button></article></div>, document.body);
}

function groupByYear(memories: Memory[]): Array<[string, Memory[]]> {
  const groups = new Map<string, Memory[]>();
  memories.forEach((memory) => {
    const year = memory.occurredOn?.slice(0, 4) ?? new Date(memory.createdAt).getFullYear().toString();
    groups.set(year, [...(groups.get(year) ?? []), memory]);
  });
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
}

function formatDate(value: string | null): string {
  return value ? value.replaceAll('-', ' / ') : 'DATE UNRECORDED';
}

function calculateDays(value: string | null): number | null {
  if (!value) return null;
  const start = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(start) ? null : Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}
