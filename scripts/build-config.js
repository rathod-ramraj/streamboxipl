const fs = require('fs');
const path = require('path');

const apiUrl = (process.env.STREAMBOX_API_URL || '').replace(/\/$/, '');
const out = path.join(__dirname, '..', 'config.js');
const body = `// Generated at build time. Do not edit.\nwindow.STREAMBOX_API = ${JSON.stringify(apiUrl)};\n`;

fs.writeFileSync(out, body);
console.log('config.js written. API:', apiUrl || '(same origin)');
