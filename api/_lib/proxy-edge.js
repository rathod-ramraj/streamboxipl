const JIO_HOST = 'jiotvpllive.cdn.jio.com';

function corsHeaders(origin) {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', origin || '*');
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return h;
}

function jioHeaders(cookie) {
  const h = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 JioTV',
    Accept: '*/*',
    Referer: 'https://www.jiotv.com/',
    Origin: 'https://www.jiotv.com',
  };
  if (cookie) h.Cookie = cookie;
  return h;
}

function publicBase(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function proxyPath(relativePath, base) {
  const clean = relativePath.replace(/^\//, '');
  return `${base}/proxy/${clean}`;
}

function rewriteMpd(mpd, manifestUrl, base) {
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

export async function handleProxyEdge(request, subpath) {
  const reqUrl = new URL(request.url);
  const origin = request.headers.get('origin') || '*';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const base = publicBase(request);
  let target;
  let cookie = reqUrl.searchParams.get('cookie') || '';

  if (reqUrl.searchParams.get('url')) {
    target = reqUrl.searchParams.get('url');
    try {
      const parsed = new URL(target);
      if (parsed.hostname !== JIO_HOST) {
        return new Response('Host not allowed', { status: 403, headers: corsHeaders(origin) });
      }
    } catch {
      return new Response('Invalid url', { status: 400, headers: corsHeaders(origin) });
    }
  } else if (subpath) {
    target = `https://${JIO_HOST}/${subpath}`;
    if (!cookie) {
      return new Response('Missing cookie. Reload channel.', { status: 403, headers: corsHeaders(origin) });
    }
  } else {
    return new Response('Missing path', { status: 400, headers: corsHeaders(origin) });
  }

  let upstream;
  try {
    upstream = await fetch(target, { headers: jioHeaders(cookie), redirect: 'manual' });
  } catch (err) {
    return new Response('Proxy fetch failed: ' + err.message, { status: 502, headers: corsHeaders(origin) });
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    const loc = upstream.headers.get('location');
    if (loc && loc.includes(JIO_HOST)) {
      const abs = new URL(loc, target).href;
      const rel = new URL(abs).pathname.replace(/^\//, '');
      return Response.redirect(proxyPath(rel, base), 302);
    }
  }

  const ct = upstream.headers.get('content-type') || 'application/octet-stream';
  const headers = corsHeaders(origin);
  headers.set('Content-Type', ct);

  if (!upstream.ok) {
    const msg =
      upstream.status === 451 || upstream.status === 403
        ? `Jio CDN blocked proxy (HTTP ${upstream.status}). Run the app locally: npm run dev:api at home, then use a tunnel (cloudflared) as STREAMBOX_API_URL.`
        : `Upstream HTTP ${upstream.status}`;
    return new Response(msg, { status: upstream.status, headers });
  }

  if (ct.includes('dash+xml') || target.endsWith('.mpd')) {
    const text = await upstream.text();
    return new Response(rewriteMpd(text, target, base), { status: 200, headers });
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
