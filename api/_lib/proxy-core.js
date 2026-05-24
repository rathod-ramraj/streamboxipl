const JIO_HOST = 'jiotvpllive.cdn.jio.com';

const cookiesByPrefix = new Map();

function publicBase(req) {
  if (process.env.API_PUBLIC_URL) return process.env.API_PUBLIC_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return host ? `${proto}://${host}` : '';
}

function proxyPath(relativePath, base) {
  const clean = relativePath.replace(/^\//, '');
  return `${base}/proxy/${clean}`;
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

function jioHeaders(cookie) {
  const h = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: '*/*',
    Referer: 'https://www.jiotv.com/',
    Origin: 'https://www.jiotv.com',
  };
  if (cookie) h.Cookie = cookie;
  return h;
}

function rewriteMpd(mpd, manifestUrl, cookie, base) {
  const manifestBase = new URL(manifestUrl);
  const manifestDir = manifestBase.href.substring(0, manifestBase.href.lastIndexOf('/') + 1);

  let out = mpd.replace(/<BaseURL>([^<]*)<\/BaseURL>/gi, (_m, rel) => {
    const abs = new URL(rel.trim() || './', manifestDir);
    const relPath = abs.pathname.replace(/^\//, '');
    return `<BaseURL>${proxyPath(relPath, base)}</BaseURL>`;
  });

  out = out.replace(/https?:\/\/[^"'\s<>]*jiotvpllive\.cdn\.jio\.com[^"'\s<>]*/g, (match) => {
    try {
      const u = new URL(match);
      return proxyPath(u.pathname.replace(/^\//, '') + u.search, base);
    } catch {
      return match;
    }
  });

  return out;
}

async function fetchUpstream(target, cookie, base) {
  const res = await fetch(target, { headers: jioHeaders(cookie), redirect: 'manual' });
  const ct = res.headers.get('content-type') || 'application/octet-stream';
  const body = Buffer.from(await res.arrayBuffer());

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (loc && loc.includes(JIO_HOST)) {
      const abs = new URL(loc, target).href;
      const rel = new URL(abs).pathname.replace(/^\//, '');
      return { redirect: proxyPath(rel, base), status: 302 };
    }
  }

  if (!res.ok) {
    return {
      status: res.status,
      contentType: 'text/plain',
      body: Buffer.from(
        `Upstream HTTP ${res.status}. ` +
          (res.status === 451 || res.status === 403
            ? 'Cookie expired or CDN blocked this server. Update channels.json or use Vercel proxy (remove STREAMBOX_API_URL).'
            : 'Check stream credentials.')
      ),
    };
  }

  if (ct.includes('dash+xml') || target.endsWith('.mpd')) {
    return {
      status: 200,
      contentType: ct,
      body: Buffer.from(rewriteMpd(body.toString('utf8'), target, cookie, base)),
    };
  }

  return { status: res.status, contentType: ct, body };
}

function setCors(req, res) {
  const allowed = process.env.ALLOWED_ORIGINS || '*';
  const origin = req.headers.origin;
  if (allowed === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowed.split(',').map((s) => s.trim()).includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function handleProxy(req, res, subpath) {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const base = publicBase(req);

  try {
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
      const result = await fetchUpstream(req.query.url, cookie, base);
      if (result.redirect) {
        res.redirect(302, result.redirect);
        return;
      }
      res.status(result.status);
      res.setHeader('Content-Type', result.contentType);
      res.send(result.body);
      return;
    }

    if (!subpath) {
      res.status(400).send('Missing path');
      return;
    }

    const cookie = req.query.cookie || cookieForPath(subpath);
    if (!cookie) {
      res.status(403).send('Missing auth cookie. Reload the channel.');
      return;
    }

    const target = `https://${JIO_HOST}/${subpath}`;
    const result = await fetchUpstream(target, cookie, base);
    if (result.redirect) {
      res.redirect(302, result.redirect);
      return;
    }
    res.status(result.status);
    res.setHeader('Content-Type', result.contentType);
    res.send(result.body);
  } catch (err) {
    console.error('proxy error', err);
    res.status(502).send('Proxy error: ' + err.message);
  }
}

module.exports = {
  handleProxy,
  JIO_HOST,
};
