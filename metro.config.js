const { getDefaultConfig } = require('expo/metro-config');
const http = require('node:http');
const config = getDefaultConfig(__dirname);

// Preserve the existing web map stub.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { filePath: require.resolve('./stubs/react-native-maps-stub.js'), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

const routes = new Map([
  ['/rep-api/health', 'GET'], ['/rep-api/session', 'POST'], ['/rep-api/poll', 'GET'],
  ['/rep-api/command', 'POST'], ['/rep-api/frame', 'POST'], ['/rep-api/close', 'POST'],
]);
const originalEnhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const next = originalEnhance ? originalEnhance(middleware, server) : middleware;
  return (req, res, nextMiddleware) => {
    const route = req.url?.split('?')[0];
    if (!routes.has(route)) return next(req, res, nextMiddleware);
    if (routes.get(route) !== req.method) { res.writeHead(405); res.end(); return; }
    if (Number(req.headers['content-length'] || 0) > 2900000) { res.writeHead(413); res.end(); return; }
    const upstream = http.request({ host: '127.0.0.1', port: 9002, path: route, method: req.method,
      headers: { 'content-type': 'application/json', authorization: req.headers.authorization || '',
        'x-rep-session': req.headers['x-rep-session'] || '' } }, response => {
      res.writeHead(response.statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.pipe(res);
    });
    let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > 2900000) { upstream.destroy(); req.destroy(); } });
    upstream.setTimeout(12000, () => upstream.destroy());
    req.on('aborted', () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); if (!res.writableEnded) res.end('{"detail":"Rep server unavailable. Start npm run start:reps."}'); });
    req.pipe(upstream);
  };
};
module.exports = config;
