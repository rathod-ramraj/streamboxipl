export const config = { runtime: 'edge' };

export default function handler() {
  return Response.json({ ok: true, service: 'streambox-api', platform: 'vercel-edge' });
}
