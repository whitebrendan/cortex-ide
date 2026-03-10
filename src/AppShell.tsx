/**
 * AppShell.tsx - Minimal Shell for Fast First Paint
 * 
 * This component loads INSTANTLY because it has NO heavy dependencies.
 * It provides:
 * - Basic error boundary
 * - Minimal theme (dark background to avoid flash)
 * - Suspense wrapper for lazy-loaded AppCore
 * 
 * The heavy lifting (OptimizedProviders, 68 contexts) is deferred to AppCore
 * which loads lazily after first paint.
 */

import { ParentProps, ErrorBoundary, Suspense, lazy, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DeepLinkAction } from "@/utils/deepLink";
import { createAsyncCleanupRegistrar } from "@/utils/asyncCleanup";
import { dispatchDeepLinkAction, registerAsyncCleanup } from "@/utils/appStartup";
import App from "./App";
import { SplashScreen } from "./components/startup/SplashScreen";

// Startup timing
const SHELL_LOAD_TIME = performance.now();
if (import.meta.env.DEV) console.log(`[STARTUP] AppShell.tsx module loading @ ${SHELL_LOAD_TIME.toFixed(1)}ms`);

// ============================================================================
// LAZY LOAD: The actual app with all providers
// ============================================================================
// This is the key optimization - AppCore (with OptimizedProviders) loads
// AFTER first paint, not during initial bundle evaluation
const AppCore = lazy(() => {
  if (import.meta.env.DEV) console.log(`[STARTUP] AppCore lazy import starting @ ${performance.now().toFixed(1)}ms`);
  return import("./AppCore").then(m => {
    if (import.meta.env.DEV) console.log(`[STARTUP] AppCore lazy import complete @ ${performance.now().toFixed(1)}ms`);
    return m;
  });
});

// ============================================================================
// SPLASH SCREEN (replaces minimal LoadingIndicator)
// ============================================================================
// SplashScreen provides branded loading experience with logo animation,
// progress bar, and rotating status messages during lazy AppCore load.

// ============================================================================
// ERROR FALLBACK
// ============================================================================
// Minimal error display - no external dependencies
function ErrorFallback(props: { error: Error; reset?: () => void }) {
  return (
    <div style={{
      "min-height": "100vh",
      "min-width": "100vw",
      background: "var(--cortex-bg-primary, #141415)",
      display: "flex",
      "flex-direction": "column",
      "align-items": "center",
      "justify-content": "center",
      color: "white",
      padding: "32px",
      "font-family": "system-ui, -apple-system, sans-serif",
    }}>
      <h1 style={{
        "font-size": "20px",
        "font-weight": "bold",
        "margin-bottom": "16px",
        color: "#ef4444",
      }}>
        Application Error
      </h1>
      <pre style={{
        background: "rgba(0,0,0,0.5)",
        padding: "16px",
        "border-radius": "8px",
        "font-size": "12px",
        "max-width": "600px",
        overflow: "auto",
        border: "1px solid rgba(255,255,255,0.1)",
        "white-space": "pre-wrap",
        "word-break": "break-word",
      }}>
        {props.error.toString()}
        {"\n\n"}
        {props.error.stack}
      </pre>
      <div style={{
        display: "flex",
        gap: "12px",
        "margin-top": "24px",
      }}>
        {props.reset && (
          <button
            onClick={props.reset}
            style={{
              padding: "8px 16px",
              background: "#22c55e",
              color: "white",
              border: "none",
              "border-radius": "6px",
              cursor: "pointer",
              "font-size": "14px",
            }}
          >
            Try Again
          </button>
        )}
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 16px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            "border-radius": "6px",
            cursor: "pointer",
            "font-size": "14px",
          }}
        >
          Reload Application
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// APP SHELL - Root component for Router
// ============================================================================
export default function AppShell(props: ParentProps) {
  if (import.meta.env.DEV) console.log(`[STARTUP] AppShell rendering @ ${performance.now().toFixed(1)}ms`);

  const asyncCleanup = createAsyncCleanupRegistrar();

  // Early global error handlers — safety net before AppCore's full handler initializes.
  // These log to console and do NOT prevent propagation (errors still reach error boundaries).
  const earlyErrorHandler = (event: ErrorEvent) => {
    console.error("[AppShell] Uncaught error:", event.message, event.error);
  };
  const earlyRejectionHandler = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error("[AppShell] Unhandled rejection:", message);
  };

  let showMainWindowFrame = 0;

  onMount(() => {
    window.addEventListener("error", earlyErrorHandler);
    window.addEventListener("unhandledrejection", earlyRejectionHandler);

    registerAsyncCleanup(
      asyncCleanup,
      listen<DeepLinkAction>("deep:link", ({ payload }) => {
        dispatchDeepLinkAction(payload);
      }),
      (error) => {
        console.error("[AppShell] Failed to register deep-link listener:", error);
      },
    );

    showMainWindowFrame = requestAnimationFrame(() => {
      invoke("show_main_window").catch(() => {});
    });
  });

  onCleanup(() => {
    window.removeEventListener("error", earlyErrorHandler);
    window.removeEventListener("unhandledrejection", earlyRejectionHandler);
    if (showMainWindowFrame !== 0) {
      cancelAnimationFrame(showMainWindowFrame);
    }
    asyncCleanup.dispose();
  });

  return (
    <App testId="app-shell-root">
      <ErrorBoundary fallback={(err, reset) => <ErrorFallback error={err} reset={reset} />}>
        <Suspense fallback={<SplashScreen />}>
          <AppCore {...props}>{props.children}</AppCore>
        </Suspense>
      </ErrorBoundary>
    </App>
  );
}
