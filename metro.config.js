const { getDefaultConfig } = require('expo/metro-config');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const config = getDefaultConfig(__dirname);

// Preserve the existing web map stub.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { filePath: require.resolve('./stubs/react-native-maps-stub.js'), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

const routes = new Map([
  ['/rep-api/goals', 'POST'], ['/rep-api/countries', 'POST'], ['/rep-api/calories', 'POST'], ['/rep-api/health', 'GET'], ['/rep-api/session', 'POST'], ['/rep-api/poll', 'GET'],
  ['/rep-api/command', 'POST'], ['/rep-api/frame', 'POST'], ['/rep-api/close', 'POST'],
  ['/rep-api/food-analyze', 'POST'], ['/rep-api/food-describe', 'POST'],
]);
const devTokenPath = path.join(__dirname, '.expo', 'rep-session-token');
function readDevToken() {
  try { return fs.readFileSync(devTokenPath, 'utf8').trim(); } catch { return ''; }
}
const originalEnhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const next = originalEnhance ? originalEnhance(middleware, server) : middleware;
  return (req, res, nextMiddleware) => {
    const route = req.url?.split('?')[0];
    if (!routes.has(route)) return next(req, res, nextMiddleware);
    if (routes.get(route) !== req.method) { res.writeHead(405); res.end(); return; }
    const limit = (route === '/rep-api/frame' || route === '/rep-api/food-analyze') ? 2900000 : 65536;
    if (Number(req.headers['content-length'] || 0) > limit) { res.writeHead(413); res.end(); return; }
    const headers = {
      'content-type': 'application/json',
      authorization: req.headers.authorization || '',
      'x-rep-session': req.headers['x-rep-session'] || '',
    };
    if (!headers.authorization) {
      const devToken = readDevToken();
      if (devToken) headers['x-rep-dev-token'] = devToken;
    }
    const upstream = http.request({ host: '127.0.0.1', port: 9002, path: route, method: req.method, headers }, response => {
      res.writeHead(response.statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.pipe(res);
    });
    let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > limit) { upstream.destroy(); req.destroy(); } });
    upstream.setTimeout(12000, () => upstream.destroy());
    req.on('aborted', () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); if (!res.writableEnded) res.end('{"detail":"Rep server unavailable. Start npm run start:reps."}'); });
    req.pipe(upstream);
  };
};
module.exports = config;
