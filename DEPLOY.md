# StreamBox deployment

## Why streams fail on Vercel/Render alone

Jio CDN returns **HTTP 451** for many cloud servers (US/EU). Cookies in `channels.json` can be fine and still fail.

**Reliable fix:** run the proxy on your home network (Indian IP), expose with a tunnel, point Vercel at it.

---

## Option A — Home proxy + tunnel (recommended)

### 1. Run API on your PC

```bash
cd server
npm install
API_PUBLIC_URL=https://YOUR-TUNNEL-URL npm start
```

### 2. Expose with Cloudflare Tunnel (free)

Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/), then:

```bash
cloudflared tunnel --url http://localhost:3001
```

Copy the `https://....trycloudflare.com` URL.

### 3. Vercel environment variable

| Key | Value |
|-----|--------|
| `STREAMBOX_API_URL` | `https://YOUR-TUNNEL-URL` |
| `FORCE_RENDER_PROXY` | `true` |

Redeploy Vercel. Keep `cloudflared` and `npm start` running while watching.

### 4. Test API

```bash
curl https://YOUR-TUNNEL-URL/health
```

---

## Option B — Vercel Edge proxy only

1. Remove `STREAMBOX_API_URL` on Vercel (uses same-origin `/proxy`).
2. Redeploy. Works only if Jio accepts the edge region IP (often still 451 outside India).

---

## Update stream credentials

Edit `channels.json`: fresh `cookie`, `keyId`, `key` from JioTV for each channel. Commit and redeploy.

Check expiry: cookie contains `exp=UNIX_TIME` — must be in the future.

---

## Vercel frontend

- Repo: `rathod-ramraj/streamboxipl1`
- Root directory: empty
- Remove wrong `Output Directory` overrides
