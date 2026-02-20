#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');

const portArg = process.argv[2] || '8080';
const rootArg = process.argv[3] || '.';

const port = Number.parseInt(portArg, 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`Invalid port: ${portArg}`);
  process.exit(1);
}

const root = path.resolve(rootArg);
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Directory not found: ${root}`);
  process.exit(1);
}

const contentTypes = {
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.sig': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
  const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const relPath = reqPath === '/' ? '/update.json' : reqPath;
  const safePath = path.normalize(relPath).replace(/^\.{2}(?:\/|\\|$)/, '');
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = err.code === 'ENOENT' ? 404 : 500;
      res.end(err.code === 'ENOENT' ? 'Not found' : 'Internal server error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}/`);
});
