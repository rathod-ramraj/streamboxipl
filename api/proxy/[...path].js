import { handleProxyEdge } from '../_lib/proxy-edge.js';

export const config = { runtime: 'edge', regions: ['bom1', 'iad1', 'sin1'] };

export default async function handler(request) {
  const reqUrl = new URL(request.url);
  const parts = reqUrl.pathname.split('/proxy/');
  const subpath = (parts[1] || '').replace(/^\//, '').split('?')[0];
  return handleProxyEdge(request, subpath);
}
