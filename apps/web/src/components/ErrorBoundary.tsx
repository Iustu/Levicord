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
            backgroundColor: '#1e1f22',
            color: '#dcddde',
            fontFamily: 'system-ui, sans-serif',
            padding: '32px',
          }}
        >
          <div
            style={{
              backgroundColor: '#2b2d31',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '32px',
              maxWidth: '480px',
              width: '100%',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            }}
          >
            <h2 style={{ color: '#ed4245', margin: 0, fontSize: '20px', fontWeight: 700, textAlign: 'left' }}>Algo correu mal</h2>
            <p style={{ color: '#b9bbbe', margin: 0, fontSize: '14px', lineHeight: '1.5', textAlign: 'left' }}>
              Um erro inesperado ocorreu. Pode tentar recarregar a página ou clicar em{' '}
              <strong style={{ color: '#f2f3f5' }}>Tentar novamente</strong> abaixo.
            </p>
            {this.state.error && (
              <details style={{ color: '#72767d', fontSize: '12px', textAlign: 'left' }}>
                <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Detalhes do erro</summary>
                <pre style={{ textAlign: 'left', whiteSpace: 'pre-wrap', backgroundColor: '#1e1f22', padding: '12px', borderRadius: '4px', overflowX: 'auto' }}>{this.state.error.message}</pre>
              </details>
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#5865f2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Tentar novamente
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  color: '#f2f3f5',
                  border: '1px solid #4e5058',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Recarregar página
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
