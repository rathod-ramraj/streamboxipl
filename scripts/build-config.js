const fs = require('fs');
const path = require('path');

// Use same-origin /proxy on Vercel (Jio blocks many cloud IPs like Render).
// Set STREAMBOX_API_URL only if you host the API elsewhere that is not blocked.
let apiUrl = (process.env.STREAMBOX_API_URL || '').replace(/\/$/, '');
if (process.env.VERCEL === '1' && process.env.FORCE_RENDER_PROXY !== 'true') {
  apiUrl = '';
}

const out = path.join(__dirname, '..', 'config.js');
const body = `// Generated at build time. Do not edit.\nwindow.STREAMBOX_API = ${JSON.stringify(apiUrl)};\n`;

fs.writeFileSync(out, body);
console.log('config.js written. API:', apiUrl || '(same origin /proxy on Vercel)');
