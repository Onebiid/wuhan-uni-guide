import { useEffect, useMemo, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useWorkspace } from '../../app/WorkspaceContext';
import { loadPhotoObjectUrl } from '../../data/repository';
import type { Memory } from '../../domain/models';

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
        <div className="memory-title-row"><div><p className="eyebrow">OUR SHARED FILM</p><h1>我们的武大</h1></div><div className="day-stamp"><span>TOGETHER</span><strong>{togetherDays ? `DAY ${togetherDays.toLocaleString('zh-CN')}` : '未设置日期'}</strong></div></div>
        <div className="mode-switch"><button type="button" onClick={() => onOpenMap()}>地图</button><button className="active" type="button">回忆册</button></div>
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
              return <button className="memory-card" type="button" key={memory.id} onClick={() => setSelected(memory)}>
                <div className="film-perforation"><span>▪ ▪ ▪ ▪</span><b>FRAME {String(memory.frameNumber).padStart(3, '0')}</b><span>▪ ▪ ▪ ▪</span></div>
                <MemoryCover memory={memory} />
                <div className="memory-card-body"><div><h2>{memory.title}</h2><p>{place?.name ?? '未关联地点'}{memory.text ? ` · ${memory.text}` : ''}</p></div><time>{formatDate(memory.occurredOn)}</time></div>
              </button>;
            })}
          </section>
        ))}
      </div>

      {selected && <MemoryDetail memory={selected} placeName={snapshot.places.find((place) => place.id === selected.placeId)?.name ?? '未关联地点'} onClose={() => setSelected(null)} onMap={() => onOpenMap(selected.placeId)} />}
    </section>
  );
}

function MemoryCover({ memory }: { memory: Memory }) {
  const { session } = useWorkspace();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (session && memory.photoIds[0]) {
      void loadPhotoObjectUrl(session, memory.photoIds[0], memory.id).then((value) => {
        objectUrl = value;
        if (active) setUrl(value);
      });
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [memory.id, memory.photoIds, session]);
  return url ? <img className="memory-cover" src={url} alt="" /> : <div className="memory-cover placeholder"><span>WHU</span><small>{memory.occurredOn?.replaceAll('-', ' / ') ?? 'UNDATED'}</small></div>;
}

function MemoryDetail({ memory, placeName, onClose, onMap }: { memory: Memory; placeName: string; onClose: () => void; onMap: () => void }) {
  const { session } = useWorkspace();
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    const created: string[] = [];
    if (session) void Promise.all(memory.photoIds.map((id) => loadPhotoObjectUrl(session, id, memory.id))).then((values) => {
      created.push(...values.filter((value): value is string => value !== null));
      if (active) setUrls(created);
    });
    return () => { active = false; created.forEach((url) => URL.revokeObjectURL(url)); };
  }, [memory.id, memory.photoIds, session]);
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
