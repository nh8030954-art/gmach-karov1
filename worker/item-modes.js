const ready = new WeakMap();
export async function ensureItemManagementModes(env) {
  if (!ready.has(env.DB)) ready.set(env.DB, (async () => {
    // Production can be ahead of Wrangler's migration ledger. Reconcile this
    // additive change independently of historical migrations.
    const columns = await env.DB.prepare('PRAGMA table_info(items)').all();
    if (!columns.results.some(column => column.name === 'management_mode')) {
      try {
        await env.DB.prepare("ALTER TABLE items ADD COLUMN management_mode TEXT NOT NULL DEFAULT 'managed' CHECK(management_mode IN ('managed','direct'))").run();
      } catch (error) {
        if (!/duplicate column name/i.test(String(error))) throw error;
      }
    }
    await env.DB.batch([
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS direct_items_no_loans BEFORE INSERT ON loan_requests
        WHEN EXISTS(SELECT 1 FROM items WHERE id=NEW.item_id AND management_mode='direct')
        BEGIN SELECT RAISE(ABORT,'Direct contact items cannot receive loan requests'); END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS item_mode_preserves_active_loans BEFORE UPDATE OF management_mode ON items
        WHEN NEW.management_mode='direct' AND OLD.management_mode!='direct'
        AND EXISTS(SELECT 1 FROM loan_requests WHERE item_id=OLD.id AND status IN ('pending','approved','collected'))
        BEGIN SELECT RAISE(ABORT,'Finish active loans before switching to direct contact'); END`)
    ]);
  })().catch(error => { ready.delete(env.DB); throw error; }));
  await ready.get(env.DB);
}

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
