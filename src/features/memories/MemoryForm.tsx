import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { createId, memorySchema, type Memory, type Place } from '../../domain/models';

interface MemoryFormProps {
  place: Place;
  value?: Memory;
  frameNumber: number;
  deviceId: string;
  onClose: () => void;
  onSave: (memory: Memory, files: File[]) => Promise<void>;
}

export function MemoryForm({ place, value, frameNumber, deviceId, onClose, onSave }: MemoryFormProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(value?.title ?? place.name);
  const [text, setText] = useState(value?.text ?? '');
  const [occurredOn, setOccurredOn] = useState(value?.occurredOn ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  useEffect(() => titleRef.current?.focus(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const now = Date.now();
    const parsed = memorySchema.safeParse({
      id: value?.id ?? createId('memory'), placeId: place.id, title, text,
      occurredOn: occurredOn || null, photoIds: value?.photoIds ?? [], frameNumber,
      createdAt: value?.createdAt ?? now, updatedAt: now, revision: value?.revision ?? 0,
      deviceId, deletedAt: null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查回忆内容');
      return;
    }
    setSaving(true);
    try { await onSave(parsed.data, files); } catch { setError('保存失败，请稍后重试'); } finally { setSaving(false); }
  }

  return createPortal(
    <div className="sheet-backdrop" role="presentation">
      <section className="form-sheet" role="dialog" aria-modal="true" aria-labelledby="memory-form-title">
        <div className="sheet-grabber" aria-hidden="true" />
        <header className="sheet-header"><div><p className="sheet-kicker">FRAME {String(frameNumber).padStart(3, '0')}</p><h2 id="memory-form-title">记录这次回忆</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X aria-hidden="true" /></button></header>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field"><span>标题</span><input ref={titleRef} required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="field"><span>日期</span><input type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} /></label>
          <label className="field"><span>写下这一天</span><textarea rows={6} maxLength={5000} value={text} onChange={(event) => setText(event.target.value)} placeholder="天气、同行的人、记得最清楚的瞬间..." /></label>
          <label className="photo-input"><ImagePlus aria-hidden="true" /><span>选择照片</span><small>{files.length}/9</small><input type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 9))} /></label>
          {files.length > 0 && <div className="selected-files" aria-label="已选择照片">{files.map((file) => <span key={`${file.name}-${file.lastModified}`}>{file.name}</span>)}</div>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-command" type="submit" disabled={saving}>{saving ? '正在加密保存...' : '存入回忆册'}</button>
        </form>
      </section>
    </div>
  , document.body);
}
