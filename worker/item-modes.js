export function itemManagementMode(value, fallback = 'managed') {
  const mode = value === undefined ? fallback : value;
  if (!['managed', 'direct'].includes(mode)) {
    const error = new Error('יש לבחור ניהול בקשות באתר או תיאום ישיר');
    error.status = 400;
    throw error;
  }
  return mode;
}

// Run before all feature routers so alternate booking endpoints obey the same rule.
export async function directItemGuard(request, env, url) {
  const path = url.pathname, method = request.method;
  let itemId;
  const route = path.match(/^\/api\/items\/([^/]+)\/(?:availability-check|availability-calendar|multi-range-request|inventory|waitlist|units|availability)$/);
  if (route) itemId = decodeURIComponent(route[1]);
  if (method === 'POST' && (path === '/api/loan-requests' || /^\/api\/organizations\/[^/]+\/branch-transfers$/.test(path))) {
    const body = await request.clone().json().catch(() => null);
    itemId = body?.itemId;
  }
  if (!itemId) return null;
  const item = await env.DB.prepare('SELECT management_mode FROM items WHERE id=?').bind(itemId).first();
  if (item?.management_mode !== 'direct') return null;
  return Response.json({error:'פריט זה מוצע בתיאום ישיר. אפשר לפנות לגמ״ח דרך פרטי הקשר בעמוד הפריט.',managementMode:'direct'}, {status:409});
}
