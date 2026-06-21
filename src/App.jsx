import { useState, useEffect, useCallback, useRef, Component } from 'react'
import * as ExcalidrawAll from '@excalidraw/excalidraw'
import './App.css'

// CJS interop: the pre-bundle may expose named exports, a default, or both
const _pkg = ExcalidrawAll?.default ?? ExcalidrawAll
const Excalidraw = _pkg?.Excalidraw ?? null
console.log('[embedidraw] ExcalidrawAll:', ExcalidrawAll)
console.log('[embedidraw] resolved Excalidraw:', Excalidraw)

function useFileParam() {
  const [state, setState] = useState({ status: 'loading', data: null, error: null, url: null })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    let url = params.get('file')

    if (!url) {
      setState({ status: 'no-file', data: null, error: null, url: null })
      return
    }

    // Convert GitHub blob URLs to raw content URLs
    // https://github.com/user/repo/blob/branch/path  →
    // https://raw.githubusercontent.com/user/repo/branch/path
    const ghBlob = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)$/)
    if (ghBlob) url = `https://raw.githubusercontent.com/${ghBlob[1]}/${ghBlob[2]}`

    setState(s => ({ ...s, url }))

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — could not fetch`)
        const ct = r.headers.get('content-type') ?? ''
        if (ct.includes('text/html')) throw new Error('Got an HTML page instead of JSON — is the URL a raw file link?')
        return r.json()
      })
      .then(raw => {
        if (!raw || typeof raw !== 'object') throw new Error('File did not parse as a valid JSON object')
        if (!Array.isArray(raw.elements)) throw new Error('Not a valid .excalidraw file (missing "elements" array)')

        const {
          editingElement: _ee,
          selectedElementIds: _sel,
          selectedGroupIds: _sg,
          editingGroupId: _eg,
          activeEmbeddable: _ae,
          collaborators: _co,
          ...safeAppState
        } = raw.appState ?? {}

        setState({
          status: 'ready',
          url,
          data: {
            elements: raw.elements,
            appState: {
              ...safeAppState,
              viewBackgroundColor: safeAppState.viewBackgroundColor ?? '#ffffff',
            },
            files: raw.files ?? {},
          },
          error: null,
        })
      })
      .catch(e => setState({ status: 'error', data: null, error: e.message, url }))
  }, [])

  return state
}

export default function App() {
  const { status, data, error, url } = useFileParam()
  const [mode, setMode] = useState('interact') // 'interact' | 'edit'
  const excalidrawAPI = useRef(null)

  const handleAPI = useCallback(api => { excalidrawAPI.current = api }, [])

  const toggleMode = useCallback(() => {
    setMode(m => m === 'interact' ? 'edit' : 'interact')
  }, [])

  useEffect(() => {
    const handler = e => { if (e.altKey && e.key === 'e') toggleMode() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleMode])

  if (status === 'loading') return <StatusScreen><Spinner />Loading…</StatusScreen>

  if (status === 'no-file') return (
    <StatusScreen className="info">
      <h2>Embedidraw</h2>
      <p>Load a <code>.excalidraw</code> file via the <code>?file=</code> URL parameter:</p>
      <code className="example">
        {window.location.origin}/?file=https://raw.githubusercontent.com/user/repo/main/diagram.excalidraw
      </code>
      <p className="hint">Embed on your site with an <code>&lt;iframe&gt;</code> pointing to that URL.</p>
    </StatusScreen>
  )

  if (status === 'error') return (
    <StatusScreen className="error">
      <p>⚠ {error}</p>
      {url && <code className="example">{url}</code>}
    </StatusScreen>
  )

  if (!Excalidraw) return (
    <StatusScreen className="error">
      <p>⚠ Excalidraw failed to load — check the browser console for details.</p>
    </StatusScreen>
  )

  return (
    <ErrorBoundary>
      <div className="app-root">
        <div className={`canvas-wrap ${mode}`}>
          <Excalidraw
            excalidrawAPI={handleAPI}
            initialData={data}
            zenModeEnabled={mode === 'interact'}
            viewModeEnabled={false}
            UIOptions={{
              canvasActions: {
                saveToActiveFile: false,
                loadScene: false,
                export: false,
                toggleTheme: null,
              },
              welcomeScreen: false,
            }}
          />
        </div>

        <button
          className={`mode-btn ${mode}`}
          onClick={toggleMode}
          title={mode === 'interact' ? 'Switch to edit mode (Alt+E)' : 'Switch to interact mode (Alt+E)'}
        >
          {mode === 'interact' ? <><PencilIcon /> Edit</> : <><EyeIcon /> View</>}
        </button>
      </div>
    </ErrorBoundary>
  )
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div className="status-screen error">
        <p>⚠ Render error: {this.state.error.message}</p>
        <code className="example" style={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>
          {this.state.error.stack}
        </code>
      </div>
    )
    return this.props.children
  }
}

function StatusScreen({ children, className = '' }) {
  return <div className={`status-screen ${className}`}>{children}</div>
}

function Spinner() {
  return <div className="spinner" aria-hidden="true" />
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
