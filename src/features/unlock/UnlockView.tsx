import { useState, type FormEvent } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck, UsersRound } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';

export function UnlockView() {
  const { bootState, error, join, setup, unlock } = useWorkspace();
  const isSetup = bootState === 'setup';
  const [mode, setMode] = useState<'create' | 'join'>('join');
  const isJoin = isSetup && mode === 'join';
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [metOn, setMetOn] = useState('');
  const [togetherOn, setTogetherOn] = useState('');
  const [trustedDevice, setTrustedDevice] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (isSetup && !isJoin && passphrase !== confirmation) {
      setLocalError('两次输入的共同口令不一致');
      return;
    }
    setSubmitting(true);
    try {
      if (isJoin) {
        await join(passphrase, trustedDevice);
      } else if (isSetup) {
        await setup(passphrase, { metOn: metOn || null, togetherOn: togetherOn || null, autoLockMinutes: 15 }, trustedDevice);
      } else {
        await unlock(passphrase, trustedDevice);
      }
    } catch {
      // The provider exposes a user-safe error.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="unlock-view">
      <section className="unlock-intro" aria-labelledby="unlock-title">
        <div className="seal" aria-hidden="true">WHU<br />US</div>
        <p className="roll-line">ROLL 01 · TWO PEOPLE ONLY</p>
        <p className="eyebrow">LUOJIA / PRIVATE ARCHIVE</p>
        <h1 id="unlock-title">我们的武大</h1>
        <p>{isSetup ? '建立只属于两个人的加密地图' : '共同口令解锁地图与回忆'}</p>
      </section>

      <form className="unlock-form" onSubmit={(event) => void handleSubmit(event)}>
        {isSetup && (
          <div className="workspace-mode" role="group" aria-label="空间操作">
            <button aria-pressed={!isJoin} className={!isJoin ? 'is-active' : undefined} type="button" onClick={() => setMode('create')}>
              创建新空间
            </button>
            <button aria-pressed={isJoin} className={isJoin ? 'is-active' : undefined} type="button" onClick={() => setMode('join')}>
              加入已有空间
            </button>
          </div>
        )}
        <div className="form-heading">
          {isJoin ? <UsersRound aria-hidden="true" /> : isSetup ? <ShieldCheck aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
          <div>
            <h2>{isJoin ? '加入共享空间' : isSetup ? '创建安全空间' : '欢迎回来'}</h2>
            <p>{isJoin ? '输入对方提供的共同口令，即可同步你们的地图与回忆。' : isSetup ? '口令无法由服务器找回，请妥善保存。' : '使用共同口令解锁这张地图与回忆。'}</p>
          </div>
        </div>

        <label className="field">
          <span>共同口令</span>
          <div className="input-with-icon">
            <KeyRound aria-hidden="true" size={18} />
            <input
              type="password"
              autoComplete={isJoin ? 'current-password' : isSetup ? 'new-password' : 'current-password'}
              minLength={10}
              required
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="至少 10 个字符"
            />
          </div>
        </label>

        {isSetup && !isJoin && (
          <>
            <label className="field">
              <span>再次输入</span>
              <input type="password" autoComplete="new-password" minLength={10} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </label>
            <div className="date-grid">
              <label className="field"><span>初见日期</span><input type="date" value={metOn} onChange={(event) => setMetOn(event.target.value)} /></label>
              <label className="field"><span>在一起日期</span><input type="date" value={togetherOn} onChange={(event) => setTogetherOn(event.target.value)} /></label>
            </div>
          </>
        )}

        <label className="trusted-device">
          <input type="checkbox" checked={trustedDevice} onChange={(event) => setTrustedDevice(event.target.checked)} aria-label="信任此设备" />
          <span><strong>信任此设备</strong><small>保留加密密钥，下次可直接进入；取消后关闭页面即需重新输入口令。</small></span>
        </label>
        {(localError || error) && <p className="form-error" role="alert">{localError ?? error}</p>}
        <button className="primary-command" type="submit" disabled={submitting}>
          {submitting ? '正在建立密钥...' : isJoin ? '加入共享空间' : isSetup ? '创建并进入' : '解锁地图'}
        </button>
        <p className="unlock-privacy"><ShieldCheck aria-hidden="true" size={18} />{trustedDevice ? '解锁密钥会安全保存在当前设备，手动或自动锁定后清除。' : '本次仅在当前会话保留密钥，关闭页面后需要再次输入口令。'}</p>
      </form>
    </main>
  );
}
