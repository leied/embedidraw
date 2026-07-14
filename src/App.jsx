import { useState, useEffect, useCallback, useRef, Component } from "react";
import * as ExcalidrawAll from "@excalidraw/excalidraw";
import MuiLinearProgress from "@mui/material/LinearProgress";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Link from "@mui/material/Link";
import "./App.css";

const muiDarkTheme = createTheme({
  palette: { mode: "dark", primary: { main: "#c9c3ff" } },
});

const EMBEDIDRAW_REPO_URL = "https://github.com/leied/embedidraw";

const CREDITS = [
  {
    name: "Excalidraw",
    license: "MIT",
    url: "https://github.com/excalidraw/excalidraw",
  },
  {
    name: "Excalifont",
    license: "MIT",
    url: "https://github.com/excalidraw/excalidraw",
  },
  {
    name: "Assistant typeface",
    license: "SIL Open Font License 1.1",
    url: "https://github.com/OmnibusType/Assistant",
  },
  {
    name: "Cascadia Code",
    license: "SIL Open Font License 1.1",
    url: "https://github.com/microsoft/cascadia-code",
  },
  { name: "React", license: "MIT", url: "https://react.dev" },
  { name: "MUI (Material UI)", license: "MIT", url: "https://mui.com" },
  { name: "Emotion", license: "MIT", url: "https://emotion.sh" },
];

// CJS interop: the pre-bundle may expose named exports, a default, or both
const _pkg = ExcalidrawAll?.default ?? ExcalidrawAll;
const Excalidraw = _pkg?.Excalidraw ?? null;
const MainMenu = _pkg?.MainMenu ?? null;

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
  const [showCredits, setShowCredits] = useState(false);
  const excalidrawAPI = useRef(null);

  const centerContent = useCallback((animate = false) => {
    const api = excalidrawAPI.current;
    if (!api) return;
    api.scrollToContent(api.getSceneElements(), {
      fitToViewport: true,
      animate,
    });
  }, []);

  const handleAPI = useCallback(
    (api) => {
      excalidrawAPI.current = api;
      // Deferred a frame: calling this synchronously in the ref callback
      // races with Excalidraw's own initialData scroll/zoom application and
      // gets silently overwritten (same issue we hit with activeTool).
      requestAnimationFrame(() => centerContent(false));
    },
    [centerContent],
  );

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

  // Re-fit whenever the embed container is resized (e.g. a responsive
  // iframe), so the diagram stays centered instead of drifting off-frame.
  useEffect(() => {
    let raf = null;
    const handler = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => centerContent(false));
    };
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("resize", handler);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [centerContent]);

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
      <ThemeProvider theme={muiDarkTheme}>
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
            >
              {MainMenu && (
                <MainMenu>
                  <MainMenu.Group title="Excalidraw">
                    {/* SaveToActiveFile intentionally omitted: it requires a
                        native file handle, which we never have since files
                        load via fetch(), not the File System Access API — it
                        would render but silently do nothing when clicked. */}
                    <MainMenu.DefaultItems.LoadScene />
                    <MainMenu.DefaultItems.Export />
                    <MainMenu.DefaultItems.SaveAsImage />
                    <MainMenu.DefaultItems.Help />
                    <MainMenu.DefaultItems.ClearCanvas />
                    <MainMenu.DefaultItems.ToggleTheme />
                    <MainMenu.DefaultItems.ChangeCanvasBackground />
                  </MainMenu.Group>
                  {/* Excalidraw's own social links (MainMenu.DefaultItems.Socials),
                      reproduced minus Twitter — that component bundles all three
                      links as one unit with no way to omit just one. */}
                  <MainMenu.Group title="Excalidraw links">
                    <MainMenu.ItemLink
                      href="https://github.com/excalidraw/excalidraw"
                      icon={<GithubIcon />}
                    >
                      GitHub
                    </MainMenu.ItemLink>
                    <MainMenu.ItemLink
                      href="https://discord.gg/UexuTaE"
                      icon={<DiscordIcon />}
                    >
                      Discord
                    </MainMenu.ItemLink>
                  </MainMenu.Group>
                  <MainMenu.Group title="Embedidraw links">
                    <MainMenu.ItemLink
                      href={EMBEDIDRAW_REPO_URL}
                      icon={<GithubIcon />}
                    >
                      GitHub
                    </MainMenu.ItemLink>
                    <MainMenu.Item
                      icon={<InfoIcon />}
                      onSelect={() => setShowCredits(true)}
                    >
                      Credits
                    </MainMenu.Item>
                  </MainMenu.Group>
                </MainMenu>
              )}
            </Excalidraw>
          </div>

          <ModeFab mode={mode} onToggle={toggleMode} />
        </div>

        <CreditsDialog
          open={showCredits}
          onClose={() => setShowCredits(false)}
        />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function CreditsDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Credits</DialogTitle>
      <DialogContent dividers>
        <List dense disablePadding>
          {CREDITS.map((c) => (
            <ListItem key={c.name} disableGutters>
              <ListItemText
                primary={
                  <Link href={c.url} target="_blank" rel="noreferrer">
                    {c.name}
                  </Link>
                }
                secondary={c.license}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
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

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.26a18.3 18.3 0 0 0-5.48 0 12.6 12.6 0 0 0-.62-1.26.08.08 0 0 0-.08-.04c-1.71.29-3.35.8-4.89 1.52a.07.07 0 0 0-.03.03C.86 8.5.13 12.5.48 16.44a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.28a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.24.19.37.28a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.37 1.23 2a.08.08 0 0 0 .08.03 19.85 19.85 0 0 0 6.01-3.03.08.08 0 0 0 .03-.06c.42-4.55-.7-8.51-2.96-12.04a.06.06 0 0 0-.03-.03ZM8.02 14.05c-1.18 0-2.16-1.08-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.08-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="11" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
