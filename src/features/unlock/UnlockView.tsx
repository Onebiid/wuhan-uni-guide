import { useState, type FormEvent } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';

export function UnlockView() {
  const { bootState, error, setup, unlock } = useWorkspace();
  const isSetup = bootState === 'setup';
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [metOn, setMetOn] = useState('');
  const [togetherOn, setTogetherOn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (isSetup && passphrase !== confirmation) {
      setLocalError('两次输入的共同口令不一致');
      return;
    }
    setSubmitting(true);
    try {
      if (isSetup) {
        await setup(passphrase, { metOn: metOn || null, togetherOn: togetherOn || null, autoLockMinutes: 15 });
      } else {
        await unlock(passphrase);
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
        <p className="eyebrow">LUOJIA / PRIVATE ARCHIVE</p>
        <h1 id="unlock-title">我们的武大</h1>
        <p>{isSetup ? '建立只属于两个人的加密地图' : '共同口令解锁地图与回忆'}</p>
      </section>

      <form className="unlock-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="form-heading">
          {isSetup ? <ShieldCheck aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
          <div>
            <h2>{isSetup ? '创建安全空间' : '欢迎回来'}</h2>
            <p>{isSetup ? '口令无法由服务器找回，请妥善保存。' : '解锁密钥只保留在这次使用期间。'}</p>
          </div>
        </div>

        <label className="field">
          <span>共同口令</span>
          <div className="input-with-icon">
            <KeyRound aria-hidden="true" size={18} />
            <input
              type="password"
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              minLength={10}
              required
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="至少 10 个字符"
            />
          </div>
        </label>

        {isSetup && (
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

        {(localError || error) && <p className="form-error" role="alert">{localError ?? error}</p>}
        <button className="primary-command" type="submit" disabled={submitting}>
          {submitting ? '正在建立密钥...' : isSetup ? '创建并进入' : '解锁地图'}
        </button>
      </form>
    </main>
  );
}
