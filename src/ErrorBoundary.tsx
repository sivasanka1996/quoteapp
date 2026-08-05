import { Component, type ErrorInfo, type ReactNode } from "react";
import "./ErrorBoundary.css";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence. Without this, any render throw hands Dad a white
 * screen with no way back — no button, no message, nothing to tell Siva.
 *
 * Must stay a class component: React has no hook equivalent of
 * getDerivedStateFromError.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept so a screenshot of the console is still useful when Dad reports it.
    console.error("Unhandled error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="eb">
        <div className="eb-card" role="alert">
          <div className="eb-mark">!</div>
          <h1 className="eb-title">Something went wrong</h1>
          <p className="eb-sub">
            Your saved quotes are safe. Going back to the home screen usually
            fixes it.
          </p>

          <div className="eb-actions">
            <button
              className="eb-btn eb-btn-primary"
              onClick={() => this.setState({ error: null })}
            >
              Back to the app
            </button>
            <button className="eb-btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>

          <details className="eb-details">
            <summary>Show details for Siva</summary>
            <pre className="eb-pre">{error.message}</pre>
          </details>
        </div>
      </div>
    );
  }
}
