import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ViewErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error("[ViewErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 space-y-2 text-xs">
          <p className="font-semibold text-destructive">
            Erreur de rendu : {e.name} — {e.message}
          </p>
          {e.stack && (
            <pre className="overflow-auto text-[11px] whitespace-pre-wrap text-destructive/80">
              {e.stack.split("\n").slice(0, 8).join("\n")}
            </pre>
          )}
          <button
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 ring-1 ring-border hover:bg-accent transition"
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
