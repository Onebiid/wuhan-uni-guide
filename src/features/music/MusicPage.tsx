import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Music2, Pause, Play, Plus, SkipBack, SkipForward, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { createId, isSafeRemoteUrl, type PlaylistItem } from '../../domain/models';

export function MusicPage() {
  const { snapshot, updatePlaylist } = useWorkspace();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const current = snapshot.playlist[index] ?? null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || current?.source.kind !== 'remote') return;
    audio.src = current.source.url;
    audio.load();
    setPlaying(false);
  }, [current]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || current?.source.kind !== 'remote') return;
    if (playing) audio.pause(); else await audio.play();
  }

  async function addRemote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!isSafeRemoteUrl(url)) { setError('只支持 HTTPS 音频地址'); return; }
    const item: PlaylistItem = { id: createId('track'), title: title.trim(), source: { kind: 'remote', url }, order: snapshot.playlist.length, updatedAt: Date.now() };
    await updatePlaylist([...snapshot.playlist, item]);
    setTitle(''); setUrl('');
  }

  async function remove(id: string) {
    const next = snapshot.playlist.filter((item) => item.id !== id).map((item, order) => ({ ...item, order }));
    await updatePlaylist(next);
    setIndex((value) => Math.min(value, Math.max(0, next.length - 1)));
  }

  function move(delta: number) {
    if (snapshot.playlist.length === 0) return;
    setIndex((value) => (value + delta + snapshot.playlist.length) % snapshot.playlist.length);
  }

  return (
    <section className="utility-page music-page">
      <header className="utility-header soundtrack-header">
        <p className="eyebrow">OUR SOUNDTRACK · SIDE A</p>
        <h1>一起听</h1>
        <div className="utility-counter">
          <span>{String(snapshot.playlist.length).padStart(2, '0')} TRACKS</span>
          <i />
          <span>PRIVATE PLAYLIST</span>
        </div>
      </header>

      <div className="now-playing">
        <div className="record-disc"><Music2 aria-hidden="true" /></div>
        <p>NOW PLAYING</p>
        <h2>{current?.title ?? '还没有歌曲'}</h2>
        <div className="player-controls">
          <button type="button" onClick={() => move(-1)} aria-label="上一首"><SkipBack aria-hidden="true" /></button>
          <button className="play" type="button" onClick={() => void togglePlay()} aria-label={playing ? '暂停' : '播放'}>
            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => move(1)} aria-label="下一首"><SkipForward aria-hidden="true" /></button>
        </div>
        <audio
          ref={audioRef}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => move(1)}
          onError={() => setError('当前音频无法播放，请检查地址。')}
        />
      </div>

      <form className="playlist-add" onSubmit={(event) => void addRemote(event)}>
        <h2>添加外部歌曲</h2>
        <label className="field"><span>歌名</span><input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} /></label>
        <label className="field"><span>HTTPS 音频地址</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} required placeholder="https://..." /></label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit"><Plus aria-hidden="true" />添加到歌单</button>
      </form>

      <div className="playlist-list">
        {snapshot.playlist.map((item, itemIndex) => {
          const trackNumber = String(itemIndex + 1).padStart(2, '0');
          return (
            <div className={itemIndex === index ? 'track active' : 'track'} key={item.id}>
              <span>{trackNumber}</span>
              <strong>{item.title}</strong>
              <small>SIDE A / TRACK {trackNumber} · {item.source.kind === 'remote' ? 'CLOUD URL' : 'THIS DEVICE'}</small>
              <button type="button" onClick={() => void remove(item.id)} aria-label={'删除' + item.title}><Trash2 aria-hidden="true" /></button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
