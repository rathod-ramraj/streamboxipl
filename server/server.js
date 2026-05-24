const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const JIO_HOST = 'jiotvpllive.cdn.jio.com';
const WEB_ROOT = path.join(__dirname, '..');
const API_PUBLIC_URL = (
  process.env.API_PUBLIC_URL || `http://localhost:${PORT}`
).replace(/\/$/, '');
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';

const cookiesByPrefix = new Map();

function cors(req, res, next) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin) {
    const list = ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    if (list.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

app.use(cors);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'streambox-api' });
});

function proxyPath(relativePath) {
  const clean = relativePath.replace(/^\//, '');
  return `${API_PUBLIC_URL}/proxy/${clean}`;
}

function rememberCookie(target, cookie) {
  if (!cookie) return;
  try {
    const p = new URL(target).pathname.replace(/^\//, '');
    const prefix = p.split('/').slice(0, 3).join('/');
    cookiesByPrefix.set(prefix, cookie);
  } catch { /* ignore */ }
}

function cookieForPath(subpath) {
  let best = '';
  let bestLen = 0;
  for (const [prefix, cookie] of cookiesByPrefix) {
    if (subpath.startsWith(prefix) && prefix.length > bestLen) {
      best = cookie;
      bestLen = prefix.length;
    }
  }
  return best;
}

function jioRequestHeaders(cookie) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    Accept: '*/*',
    Referer: 'https://www.jiotv.com/',
    Origin: 'https://www.jiotv.com',
  };
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function fetchUpstream(target, cookie, res) {
  const parsed = new URL(target);
  const lib = parsed.protocol === 'https:' ? https : http;

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: jioRequestHeaders(cookie),
  };

  const upstream = lib.request(options, (up) => {
    if (up.statusCode >= 300 && up.statusCode < 400 && up.headers.location) {
      const loc = new URL(up.headers.location, target).href;
      if (loc.includes(JIO_HOST)) {
        const rel = new URL(loc).pathname.replace(/^\//, '');
        rememberCookie(loc, cookie);
        res.redirect(302, proxyPath(rel));
        return;
      }
    }

    const chunks = [];
    up.on('data', (c) => chunks.push(c));
    up.on('end', () => {
      const body = Buffer.concat(chunks);
      const ct = up.headers['content-type'] || 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      const code = up.statusCode || 200;

      if (code >= 400) {
        res
          .status(code)
          .send(
            `Upstream HTTP ${code}. ` +
              (code === 403 || code === 451
                ? 'Cookie expired or invalid — update channels.json.'
                : 'Stream unavailable.')
          );
        return;
      }

      if (ct.includes('dash+xml') || target.endsWith('.mpd')) {
        res.status(code).send(rewriteMpd(body.toString('utf8'), target));
      } else {
        res.status(code).send(body);
      }
    });
  });

  upstream.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.status(502).send('Upstream error: ' + err.message);
  });
  upstream.end();
}

function rewriteMpd(mpd, manifestUrl) {
  const manifestBase = new URL(manifestUrl);
  const manifestDir = manifestBase.href.substring(0, manifestBase.href.lastIndexOf('/') + 1);

  let out = mpd.replace(/<BaseURL>([^<]*)<\/BaseURL>/gi, (_m, rel) => {
    const abs = new URL(rel.trim() || './', manifestDir);
    const relPath = abs.pathname.replace(/^\//, '');
    return `<BaseURL>${proxyPath(relPath)}</BaseURL>`;
  });

  out = out.replace(/https?:\/\/[^"'\s<>]*jiotvpllive\.cdn\.jio\.com[^"'\s<>]*/g, (match) => {
    try {
      const u = new URL(match);
      return proxyPath(u.pathname.replace(/^\//, '') + u.search);
    } catch {
      return match;
    }
  });

  return out;
}

app.use('/proxy', (req, res) => {
  if (req.query.url) {
    let parsed;
    try {
      parsed = new URL(req.query.url);
    } catch {
      res.status(400).send('Invalid url');
      return;
    }
    if (parsed.hostname !== JIO_HOST) {
      res.status(403).send('Host not allowed');
      return;
    }
    const cookie = req.query.cookie || '';
    rememberCookie(req.query.url, cookie);
    fetchUpstream(req.query.url, cookie, res);
    return;
  }

  const subpath = req.path.replace(/^\//, '');
  if (!subpath) {
    res.status(400).send('Missing path');
    return;
  }
  const cookie = req.query.cookie || cookieForPath(subpath);
  if (!cookie) {
    res.status(403).send('Missing auth cookie for this segment. Reload the channel.');
    return;
  }
  fetchUpstream(`https://${JIO_HOST}/${subpath}`, cookie, res);
});

// Frontend (index.html, channels.json, config.js) — same port as API
app.use(express.static(WEB_ROOT, { index: 'index.html' }));

const server = app.listen(PORT, () => {
  console.log('');
  console.log('  StreamBox ready');
  console.log(`  Open:  http://localhost:${PORT}`);
  console.log(`  API:   http://localhost:${PORT}/health`);
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. Try: PORT=${PORT + 1} npm start`);
    process.exit(1);
  }
  throw err;
});
