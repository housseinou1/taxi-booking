const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2];
const PORT = Number(process.argv[3] || 5599);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.map': 'application/json',
  '.txt': 'text/plain',
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(ROOT, urlPath);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(ROOT, urlPath, 'index.html');
    }
    if (!fs.existsSync(file)) {
      file = path.join(ROOT, 'index.html'); // SPA fallback, mirrors nginx try_files
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, '127.0.0.1', () => console.log('SERVING ' + ROOT + ' on http://127.0.0.1:' + PORT));
