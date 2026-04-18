"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional label for the section that failed — shown in the fallback UI */
  section?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary for dashboard tabs. Catches render errors in
 * children and shows a retry-able fallback UI instead of crashing
 * the entire dashboard.
 */
export class TabErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(
      `[Kebab MCP] Error in ${this.props.section ?? "tab"}:`,
      error,
      info.componentStack
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "3rem 1.5rem",
            minHeight: "200px",
            borderRadius: "0.75rem",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            backgroundColor: "rgba(239, 68, 68, 0.04)",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem",
              fontSize: "1.25rem",
              color: "#ef4444",
            }}
          >
            !
          </div>
          <p
            style={{
              margin: "0 0 0.5rem",
              fontSize: "0.95rem",
              fontWeight: 500,
              color: "#1f2937",
            }}
          >
            Something went wrong{this.props.section ? ` in ${this.props.section}` : ""}.
          </p>
          <p
            style={{
              margin: "0 0 1.25rem",
              fontSize: "0.8rem",
              color: "#6b7280",
              maxWidth: "400px",
              textAlign: "center",
            }}
          >
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              color: "#374151",
              fontSize: "0.85rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#f9fafb";
              e.currentTarget.style.borderColor = "#9ca3af";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#ffffff";
              e.currentTarget.style.borderColor = "#d1d5db";
            }}
          >
            Click to retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
