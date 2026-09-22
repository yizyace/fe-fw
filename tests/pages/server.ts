import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve('dist');
const prefix = '/fe-fw/';
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

// Match Pages directory redirects and 404 handling, without an SPA fallback.
createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith(prefix)) { response.writeHead(404); response.end('Not found'); return; }
    let file = resolve(root, pathname.slice(prefix.length));
    if (file !== root && !file.startsWith(`${root}${sep}`)) { response.writeHead(404); response.end('Not found'); return; }
    if ((await stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) { response.writeHead(301, { location: `${url.pathname}/${url.search}` }); response.end(); return; }
      file = resolve(file, 'index.html');
    }
    const bytes = await readFile(file);
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    response.end(bytes);
  } catch {
    response.writeHead(404, { 'content-type': 'text/html' });
    response.end(await readFile(resolve(root, '404.html')).catch(() => 'Not found'));
  }
}).listen(4174, '127.0.0.1', () => console.log('Pages preview: http://127.0.0.1:4174/fe-fw/'));
