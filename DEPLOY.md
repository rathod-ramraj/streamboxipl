# StreamBox deployment (Vercel + Render)

## Architecture

| Part | Platform | Folder | Purpose |
|------|----------|--------|---------|
| Frontend | Vercel | `client/` | UI, Shaka Player, `channels.json` |
| Backend | Render | `server/` | Proxy API (`/proxy`, `/health`) |

## 1. Deploy backend on Render

1. Push this repo to GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** or **Web Service**.
3. Connect the repo. Set **Root Directory** to `server`.
4. **Build command:** `npm install`
5. **Start command:** `npm start`
6. Add environment variables:

   | Key | Example |
   |-----|---------|
   | `API_PUBLIC_URL` | `https://streambox-api.onrender.com` (your Render URL, no trailing slash) |
   | `ALLOWED_ORIGINS` | `https://your-app.vercel.app` (comma-separated for multiple) |

7. Deploy. Copy the live URL (e.g. `https://streambox-api.onrender.com`).
8. Test: open `https://YOUR-RENDER-URL/health` — should return `{"ok":true}`.

Or use the included `server/render.yaml` with Render Blueprint.

## 2. Deploy frontend on Vercel

1. [Vercel Dashboard](https://vercel.com) → **Add New Project** → import the same repo.
2. **Root Directory:** leave empty (repo root). The root `vercel.json` deploys the `client/` folder.
   - Alternative: set Root Directory to `client` and leave Output Directory blank.
3. Framework: **Other** (not Next.js).
4. In **Build & Development Settings**, clear any custom Output Directory override (must not be `client/client`).
5. Add environment variable:

   | Key | Value |
   |-----|-------|
   | `STREAMBOX_API_URL` | Your Render URL, e.g. `https://streambox-api.onrender.com` |

5. Deploy. Open the Vercel URL and pick a channel.

## 3. Update channel credentials

Edit `client/channels.json` (cookies and DRM keys expire). Redeploy Vercel after changes.

## Local development

```bash
npm run install:all

# Terminal 1 — API on :3001
API_PUBLIC_URL=http://localhost:3001 npm run dev:api

# Terminal 2 — set API URL and serve client on :3000
STREAMBOX_API_URL=http://localhost:3001 npm run dev:client
```

Or edit `client/config.js` and set `window.STREAMBOX_API = 'http://localhost:3001'`, then open the client with any static server.

## Notes

- Render free tier sleeps; first request may be slow.
- `ALLOWED_ORIGINS` must include your exact Vercel URL (`https://...vercel.app`).
- Do not commit real cookies to a public repo if the repository is public.
