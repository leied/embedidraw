import { useState, useEffect, useCallback, useRef, Component } from "react";
import * as ExcalidrawAll from "@excalidraw/excalidraw";
import MuiLinearProgress from "@mui/material/LinearProgress";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import "./App.css";

const muiDarkTheme = createTheme({
  palette: { mode: "dark", primary: { main: "#c9c3ff" } },
});

// CJS interop: the pre-bundle may expose named exports, a default, or both
const _pkg = ExcalidrawAll?.default ?? ExcalidrawAll;
const Excalidraw = _pkg?.Excalidraw ?? null;

// Font family IDs our pinned Excalidraw version (0.17.6) actually knows how
// to render: 1=Virgil (served as Excalifont, see fonts/), 2=Helvetica,
// 3=Cascadia, 4=Assistant. Newer Excalidraw versions added more IDs (5 =
// Excalifont as its own family, 6+ = Nunito/Comic Shanns/etc) that this
// version doesn't recognize — getFontFamilyString() silently falls back to
// a generic system font for anything outside {1,2,3,4}. Remap those to 1
// so unrecognized-but-intentional fonts still land on our default look
// instead of an ugly fallback.
const KNOWN_FONT_FAMILIES = new Set([1, 2, 3, 4]);

function normalizeFontFamilies(elements) {
  return elements.map((el) =>
    el.fontFamily != null && !KNOWN_FONT_FAMILIES.has(el.fontFamily)
      ? { ...el, fontFamily: 1 }
      : el,
  );
}

function useFileParam() {
  const [state, setState] = useState({
    status: "loading",
    data: null,
    error: null,
    url: null,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let url = params.get("file");

    if (!url) {
      setState({ status: "no-file", data: null, error: null, url: null });
      return;
    }

    // Convert GitHub blob URLs to raw content URLs
    // https://github.com/user/repo/blob/branch/path  →
    // https://raw.githubusercontent.com/user/repo/branch/path
    const ghBlob = url.match(
      /^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)$/,
    );
    if (ghBlob)
      url = `https://raw.githubusercontent.com/${ghBlob[1]}/${ghBlob[2]}`;

    setState((s) => ({ ...s, url }));

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — could not fetch`);
        const ct = r.headers.get("content-type") ?? "";
        if (ct.includes("text/html"))
          throw new Error(
            "Got an HTML page instead of JSON — is the URL a raw file link?",
          );
        return r.json();
      })
      .then((raw) => {
        if (!raw || typeof raw !== "object")
          throw new Error("File did not parse as a valid JSON object");
        if (!Array.isArray(raw.elements))
          throw new Error(
            'Not a valid .excalidraw file (missing "elements" array)',
          );

        const {
          editingElement: _ee,
          selectedElementIds: _sel,
          selectedGroupIds: _sg,
          editingGroupId: _eg,
          activeEmbeddable: _ae,
          collaborators: _co,
          ...safeAppState
        } = raw.appState ?? {};

        setState({
          status: "ready",
          url,
          data: {
            elements: normalizeFontFamilies(raw.elements),
            appState: {
              ...safeAppState,
              viewBackgroundColor:
                safeAppState.viewBackgroundColor ?? "#ffffff",
              // Baked into initialData (rather than set imperatively after
              // mount) so it's correct on the very first paint — calling
              // excalidrawAPI.setActiveTool() in the ref callback races with
              // Excalidraw's own initialData application and loses.
              activeTool: {
                type: "hand",
                customType: null,
                locked: false,
                lastActiveTool: null,
              },
            },
            files: raw.files ?? {},
          },
          error: null,
        });
      })
      .catch((e) =>
        setState({ status: "error", data: null, error: e.message, url }),
      );
  }, []);

  return state;
}

export default function App() {
  const { status, data, error, url } = useFileParam();
  const [mode, setMode] = useState("interact"); // 'interact' | 'edit'
  const excalidrawAPI = useRef(null);

  const handleAPI = useCallback((api) => {
    excalidrawAPI.current = api;
  }, []);

  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next = m === "interact" ? "edit" : "interact";
      // Returning to interact mode should always land back on pan, regardless
      // of whatever tool was active while editing
      if (next === "interact") {
        excalidrawAPI.current?.setActiveTool({ type: "hand" });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.key === "e") toggleMode();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleMode]);

  if (status === "loading")
    return (
      <ThemeProvider theme={muiDarkTheme}>
        <StatusScreen>
          <p>Loading diagram…</p>
          <MuiLinearProgress
            className="linear-progress"
            color="primary"
            sx={{ width: 240, maxWidth: "60vw" }}
          />
        </StatusScreen>
      </ThemeProvider>
    );

  if (status === "no-file")
    return (
      <StatusScreen className="info">
        <h2>Embedidraw</h2>
        <p>
          Load a <code>.excalidraw</code> file via the <code>?file=</code> URL
          parameter:
        </p>
        <code className="example">
          {window.location.origin}
          /?file=https://raw.githubusercontent.com/user/repo/main/diagram.excalidraw
        </code>
        <p className="hint">
          Embed on your site with an <code>&lt;iframe&gt;</code> pointing to
          that URL.
        </p>
      </StatusScreen>
    );

  if (status === "error")
    return (
      <StatusScreen className="error">
        <p>⚠ {error}</p>
        {url && <code className="example">{url}</code>}
      </StatusScreen>
    );

  if (!Excalidraw)
    return (
      <StatusScreen className="error">
        <p>
          ⚠ Excalidraw failed to load — check the browser console for details.
        </p>
      </StatusScreen>
    );

  return (
    <ErrorBoundary>
      <div className="app-root">
        <div className={`canvas-wrap ${mode}`}>
          <Excalidraw
            excalidrawAPI={handleAPI}
            initialData={data}
            theme="dark"
            // Not using Excalidraw's built-in zen mode: it slides the zoom
            // controls off-screen too, which we want to keep visible. The
            // toolbar/hamburger are hidden explicitly via CSS instead.
            zenModeEnabled={false}
            viewModeEnabled={false}
            UIOptions={{
              canvasActions: {
                saveToActiveFile: false,
                loadScene: false,
                export: false,
                toggleTheme: false,
              },
              welcomeScreen: false,
            }}
          />
        </div>

        <ModeFab mode={mode} onToggle={toggleMode} />
      </div>
    </ErrorBoundary>
  );
}

// Material Design 3 extended FAB — https://m3.material.io/components/extended-fab/specs
function ModeFab({ mode, onToggle }) {
  const handleClick = useCallback(
    (e) => {
      spawnRipple(e);
      onToggle();
    },
    [onToggle],
  );

  return (
    <button
      className={`mode-fab ${mode}`}
      onClick={handleClick}
      title={
        mode === "interact"
          ? "Switch to edit mode (Alt+E)"
          : "Switch to interact mode (Alt+E)"
      }
    >
      <span className="mode-fab-content">
        <span className="mode-fab-icon">
          {mode === "interact" ? <PencilIcon /> : <EyeIcon />}
        </span>
        <span className="mode-fab-label">
          {mode === "interact" ? "Edit" : "View"}
        </span>
      </span>
    </button>
  );
}

function spawnRipple(e) {
  const button = e.currentTarget;
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.6;
  // Keyboard-triggered clicks report clientX/Y as 0 — center the ripple then
  const isKeyboard = e.detail === 0;
  const originX = isKeyboard ? rect.width / 2 : e.clientX - rect.left;
  const originY = isKeyboard ? rect.height / 2 : e.clientY - rect.top;

  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${originX - size / 2}px`;
  ripple.style.top = `${originY - size / 2}px`;
  button.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), {
    once: true,
  });
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e) {
    return { error: e };
  }
  render() {
    if (this.state.error)
      return (
        <div className="status-screen error">
          <p>⚠ Render error: {this.state.error.message}</p>
          <code
            className="example"
            style={{ whiteSpace: "pre-wrap", textAlign: "left" }}
          >
            {this.state.error.stack}
          </code>
        </div>
      );
    return this.props.children;
  }
}

function StatusScreen({ children, className = "" }) {
  return <div className={`status-screen ${className}`}>{children}</div>;
}

function PencilIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
