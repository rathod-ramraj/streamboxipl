import { handleProxyEdge } from './_lib/proxy-edge.js';

export const config = { runtime: 'edge', regions: ['bom1', 'iad1', 'sin1'] };

export default async function handler(request) {
  return handleProxyEdge(request, '');
}
