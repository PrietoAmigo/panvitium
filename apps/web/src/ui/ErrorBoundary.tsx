import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const SAVE_KEY = 'panvitium:save';

/**
 * Catches render/lifecycle errors anywhere below it and shows a readable fallback instead of a
 * blank white screen. The message is also logged to the console (with the component stack). Offers
 * a plain reload and a "reset save" reload, since a bad save is the most common recoverable cause.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Panvitium crashed:', error, info.componentStack);
  }

  private readonly reload = (): void => {
    window.location.reload();
  };

  private readonly resetSave = (): void => {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore — reloading is still worth attempting
    }
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="error-boundary" role="alert">
        <div className="error-card">
          <h1 className="error-title">The rite collapsed</h1>
          <p className="error-blurb">
            Something failed while drawing the lair. The detail below is also in the browser console
            (open the developer tools to see the full stack).
          </p>
          <pre className="error-detail">{error.message}</pre>
          <div className="error-actions">
            <button type="button" className="opera-btn" onClick={this.reload}>
              Reload
            </button>
            <button type="button" className="opera-btn error-reset" onClick={this.resetSave}>
              Reset save &amp; reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
