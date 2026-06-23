import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in child component:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          padding: "24px",
          textAlign: "center",
          color: "#c00",
          background: "#fff",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px"
        }}>
          <span className="codicon codicon-error" style={{ fontSize: 32, color: "#c00" }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Failed to render component</span>
          <span style={{ fontSize: 12, color: "#666", maxWidth: 400 }}>{this.state.error?.message || "Unknown error"}</span>
        </div>
      );
    }

    return this.props.children;
  }
}
