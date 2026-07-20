import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { categories, categoryMeta, createId, placeSchema, type Category, type Place } from '../../domain/models';

interface PlaceFormProps {
  value: Place | null;
  lat: number;
  lng: number;
  deviceId: string;
  onClose: () => void;
  onSave: (place: Place) => Promise<void>;
}

export function PlaceForm({ value, lat, lng, deviceId, onClose, onSave }: PlaceFormProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(value?.name ?? '');
  const [note, setNote] = useState(value?.note ?? '');
  const [category, setCategory] = useState<Category>(value?.category ?? 'memory');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => nameRef.current?.focus(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const now = Date.now();
    const parsed = placeSchema.safeParse({
      id: value?.id ?? createId('place'),
      category,
      name,
      note,
      lat,
      lng,
      createdAt: value?.createdAt ?? now,
      updatedAt: now,
      revision: value?.revision ?? 0,
      deviceId,
      deletedAt: null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查地点信息');
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch {
      setError('保存失败，数据仍保留在当前表单中');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="form-sheet" role="dialog" aria-modal="true" aria-labelledby="place-form-title">
        <div className="sheet-grabber" aria-hidden="true" />
        <header className="sheet-header">
          <div><p className="sheet-kicker">{value ? 'EDIT PLACE' : 'NEW PLACE'}</p><h2 id="place-form-title">{value ? '编辑地点' : '记录新地点'}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X aria-hidden="true" /></button>
        </header>
        <form onSubmit={(event) => void submit(event)}>
          <fieldset className="category-picker">
            <legend>类型</legend>
            {categories.map((item) => (
              <label key={item} className={category === item ? 'category-option selected' : 'category-option'} style={{ '--category-color': categoryMeta[item].color } as React.CSSProperties}>
                <input type="radio" name="category" value={item} checked={category === item} onChange={() => setCategory(item)} />
                <span>{categoryMeta[item].label}</span>
              </label>
            ))}
          </fieldset>
          <label className="field"><span>名称</span><input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="例如：樱花大道" /></label>
          <label className="field"><span>备注</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={4} placeholder="这次来这里做了什么" /></label>
          <div className="coordinate-readout"><span>WGS-84</span><strong>{lat.toFixed(5)}, {lng.toFixed(5)}</strong></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-command" type="submit" disabled={saving}>{saving ? '正在加密保存...' : value ? '保存修改' : '保存地点'}</button>
        </form>
      </section>
    </div>
  , document.body);
}
