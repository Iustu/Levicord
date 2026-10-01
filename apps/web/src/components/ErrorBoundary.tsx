import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** Optional custom fallback. Defaults to a generic recovery card. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global Error Boundary — catches render-time exceptions thrown by any
 * descendant and renders a graceful recovery UI instead of a blank screen.
 *
 * Usage: wrap top-level routes or complex subtrees.
 *   <ErrorBoundary>
 *     <MainApp />
 *   </ErrorBoundary>
 *
 * (ESM Cap.4 Robustness \u2014 DMMT Cap.11 Goodwill: users should always have a
 * next step, even when something goes catastrophically wrong.)
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production, forward to your error tracking service (e.g. Sentry).
    console.error('[ErrorBoundary] Uncaught render error:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: '16px',
            backgroundColor: '#36393f',
            color: '#dcddde',
            fontFamily: 'system-ui, sans-serif',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ color: '#ed4245', margin: 0 }}>Algo correu mal</h2>
          <p style={{ maxWidth: '400px', color: '#b9bbbe', margin: 0 }}>
            Um erro inesperado ocorreu. Pode tentar recarregar a p\xe1gina ou clicar em{' '}
            <strong>Tentar novamente</strong> abaixo.
          </p>
          {this.state.error && (
            <details style={{ color: '#72767d', fontSize: '12px' }}>
              <summary>Detalhes do erro</summary>
              <pre style={{ textAlign: 'left', whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 20px',
                backgroundColor: '#5865f2',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Tentar novamente
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 20px',
                backgroundColor: '#4f545c',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Recarregar p\xe1gina
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
