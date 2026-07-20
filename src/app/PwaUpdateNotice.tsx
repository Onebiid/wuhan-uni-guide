import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaUpdateNotice() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return <aside className="update-notice" role="status"><div><strong>新版本已准备好</strong><span>待同步内容会先保存在本机。</span></div><button className="update-command" type="button" onClick={() => void updateServiceWorker(true)}><RefreshCw aria-hidden="true" />更新</button><button className="icon-button" type="button" onClick={() => setNeedRefresh(false)} aria-label="稍后更新"><X aria-hidden="true" /></button></aside>;
}
