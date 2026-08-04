import { useState, type FormEvent } from 'react';
import { Cloud, Download, Lock, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';

export function SettingsPage() {
  const { snapshot, pendingCount, migration, lock, updateRelationship, syncStatus, syncNow, importLegacyJson } = useWorkspace();
  const [metOn, setMetOn] = useState(snapshot.relationship.metOn ?? '');
  const [togetherOn, setTogetherOn] = useState(snapshot.relationship.togetherOn ?? '');
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await updateRelationship({ ...snapshot.relationship, metOn: metOn || null, togetherOn: togetherOn || null });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2_000);
  }

  function exportData() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), places: snapshot.places, memories: snapshot.memories, relationship: snapshot.relationship, playlist: snapshot.playlist }, null, 2);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    link.download = `whu-couple-map-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function chooseImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then(importLegacyJson).catch(() => window.alert('导入失败：文件不是有效的旧版地点备份。'));
    }, { once: true });
    input.click();
  }

  return (
    <section className="utility-page settings-page">
      <header className="utility-header archive-header">
        <p className="eyebrow">PRIVATE ARCHIVE · INDEX</p>
        <h1>档案设置</h1>
        <p>隐私、同步与本机数据集中管理。</p>
      </header>

      <h2 className="archive-index-title"><span>01 / RELATIONSHIP</span><i /></h2>
      <form className="settings-section relationship-section" onSubmit={(event) => void save(event)}>
        <h2>纪念日期</h2>
        <div className="date-grid">
          <label className="field"><span>初见</span><input type="date" value={metOn} onChange={(event) => setMetOn(event.target.value)} /></label>
          <label className="field"><span>在一起</span><input type="date" value={togetherOn} onChange={(event) => setTogetherOn(event.target.value)} /></label>
        </div>
        <button className="secondary-command" type="submit">{saved ? '已保存' : '保存日期'}</button>
      </form>

      <h2 className="archive-index-title"><span>02 / DATA</span><i /></h2>
      <div className="settings-status">
        <Cloud aria-hidden="true" />
        <div>
          <strong>{syncLabel(syncStatus, pendingCount)}</strong>
          <span>{import.meta.env.VITE_SYNC_API ? 'Cloudflare 同步服务已配置' : '尚未配置同步服务，数据仅保存在本机'}</span>
        </div>
        {syncStatus !== 'disabled' && <button className="sync-command" type="button" onClick={() => void syncNow()} disabled={syncStatus === 'syncing'} aria-label="立即同步"><RefreshCw aria-hidden="true" /></button>}
      </div>
      {migration && (
        <section className="settings-section">
          <h2>旧数据迁移</h2>
          <p>导入 {migration.places.length} 个地点、{migration.memories.length} 段回忆；修复 {migration.repaired} 项，跳过 {migration.skipped} 项。</p>
        </section>
      )}
      <section className="settings-section data-section">
        <h2>数据备份</h2>
        <button className="settings-command" type="button" onClick={chooseImport}><Upload aria-hidden="true" /><span><strong>导入旧版 JSON</strong><small>导入后立即转为加密记录</small></span></button>
        <button className="settings-command" type="button" onClick={exportData}><Download aria-hidden="true" /><span><strong>导出可读备份</strong><small>照片不包含在此快速备份中</small></span></button>
      </section>

      <h2 className="archive-index-title"><span>03 / SECURITY</span><i /></h2>
      <div className="settings-status">
        <ShieldCheck aria-hidden="true" />
        <div><strong>端侧加密已启用</strong><span>地点与回忆只在解锁后进入内存</span></div>
      </div>
      <section className="settings-section security-section">
        <h2>会话安全</h2>
        <button className="settings-command danger" type="button" onClick={lock}><Lock aria-hidden="true" /><span><strong>立即锁定</strong><small>清除当前会话中的解密密钥</small></span></button>
      </section>
    </section>
  );
}

function syncLabel(status: ReturnType<typeof useWorkspace>['syncStatus'], pending: number): string {
  if (status === 'disabled') return '仅保存在本机';
  if (status === 'syncing') return '正在安全同步';
  if (status === 'conflict') return '有同步冲突需要处理';
  if (status === 'error') return `${pending} 项等待网络恢复`;
  if (status === 'pending') return `${pending} 项等待同步`;
  return '已安全同步';
}
