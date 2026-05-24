const fs = require('fs');
const path = require('path');

let apiUrl = (process.env.STREAMBOX_API_URL || '').replace(/\/$/, '');
if (process.env.VERCEL === '1' && process.env.FORCE_RENDER_PROXY !== 'true') {
  apiUrl = '';
}

const out = path.join(__dirname, '..', 'config.js');
const body = `// Generated at build time.\nwindow.STREAMBOX_API = ${JSON.stringify(apiUrl)};\n`;

fs.writeFileSync(out, body);
console.log('config.js:', apiUrl || '(same origin)');
