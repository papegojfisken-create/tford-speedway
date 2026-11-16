// Cloudflare Pages Function: GET /api/turn
// Hands the game short-lived login details for Cloudflare's relay (TURN) server, so two players can connect
// even when their home routers block a direct connection. The secret key stays here on Cloudflare and is
// never sent to players. Needs two settings in the Pages project: TURN_KEY_ID and TURN_KEY_API_TOKEN (secret).
export async function onRequestGet({ request, env }) {
  const json = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  // only hand out relay details to the game's own pages
  const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
  const host = new URL(request.url).host;
  if (origin) { try { if (new URL(origin).host !== host) return json({ iceServers: null }); } catch (e) { return json({ iceServers: null }); } }
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ iceServers: null, reason: 'not configured' });
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 })
    });
    if (!r.ok) return json({ iceServers: null, reason: 'relay ' + r.status });
    const d = await r.json();
    let list = d.iceServers;
    if (list && !Array.isArray(list)) list = [list];
    return json({ iceServers: list || null });
  } catch (e) {
    return json({ iceServers: null, reason: 'relay unreachable' });
  }
}
