import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  captureGlobalErrors?: boolean;
};

type State = {
  error: Error | null;
};

/** Minimal error boundary stub — original AiroErrorBoundary not present in this checkout. */
export default class AiroErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AiroErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h1>Something went wrong</h1>
          <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
