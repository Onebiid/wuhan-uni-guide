import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryState { failed: boolean }

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application error boundary', { name: error.name, componentStack: info.componentStack });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="fatal-screen"><div className="seal">WHU<br />US</div><h1>应用需要重新打开</h1><p>本机加密数据没有被删除。重新载入后可继续解锁。</p><button type="button" onClick={() => window.location.reload()}>重新载入</button></main>;
  }
}
