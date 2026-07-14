# Embedidraw

A lightweight, embeddable Excalidraw viewer/editor — hosted on Cloudflare Pages, reads `.excalidraw` files directly from GitHub.

## Usage

### Load a file

```
https://<your-pages-domain>/?file=<raw-url-to-excalidraw-file>
```

**Example (GitHub raw URL):**

```
https://embedidraw.workers.dev/?file=https://raw.githubusercontent.com/you/repo/main/diagram.excalidraw
```

### Modes

| Mode                   | Behaviour                                                |
| ---------------------- | -------------------------------------------------------- |
| **Interact** (default) | Pan, zoom, and drag unlocked elements. No toolbar shown. |
| **Edit**               | Full Excalidraw editor with toolbar.                     |

Toggle with the **✏ Edit / 👁 View** button (bottom-right), or press **Alt+E**.

> To prevent an element from being dragged in Interact mode, lock it in Excalidraw: select it → right-click → Lock.

### Embed on your site

```html
<iframe
  src="https://embedidraw.pages.dev/?file=https://raw.githubusercontent.com/you/repo/main/diagram.excalidraw"
  style="width: 100%; height: 500px; border: none; border-radius: 8px;"
  loading="lazy"
  title="Diagram"
></iframe>
```

---

## Deploy

### Cloudflare Pages (recommended)

1. Push this repo to GitHub.
2. In the Cloudflare dashboard → Pages → Create project → Connect to Git.
3. Set **Build command**: `npm run build` and **Output directory**: `dist`.
4. Deploy. Done.

**Or via CLI:**

```bash
npm install
npm run deploy   # builds + deploys via wrangler
```

### Local dev

```bash
npm install
npm run dev      # http://localhost:5173
```
 