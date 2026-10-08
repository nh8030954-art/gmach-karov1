const ready = new WeakMap();
export async function ensureOrganizationSubcategories(env) {
  if (!ready.has(env.DB)) ready.set(env.DB, env.DB.prepare(`CREATE TABLE IF NOT EXISTS organization_subcategory_preferences (
    organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    parent_category_id TEXT NOT NULL,
    selections_json TEXT NOT NULL
  )`).run().catch(error => { ready.delete(env.DB); throw error; }));
  await ready.get(env.DB);
}

export async function validateOrganizationSubcategories(env, parentId, selections) {
  const invalid = () => { const error = new Error('יש לבחור לפחות קטגוריית משנה אחת או כל הקטגוריה'); error.status = 400; throw error; };
  if (!Array.isArray(selections) || !selections.length || selections.length > 200 || selections.some(x => typeof x !== 'string')) invalid();
  const unique = [...new Set(selections)];
  if (unique.includes('__all__')) { if (unique.length !== 1) invalid(); return ['__all__']; }
  const children = (await env.DB.prepare("SELECT id FROM categories WHERE parent_id=? AND status='active'").bind(parentId).all()).results;
  if (unique.some(id => !children.some(child => child.id === id))) invalid();
  return unique;
}

export async function organizationSubcategories(env, organizationId, parentId) {
  await ensureOrganizationSubcategories(env);
  const row = await env.DB.prepare('SELECT * FROM organization_subcategory_preferences WHERE organization_id=?').bind(organizationId).first();
  if (!row || row.parent_category_id !== parentId) return ['__all__'];
  const selected = JSON.parse(row.selections_json);
  if (selected.includes('__all__')) return ['__all__'];
  const children = (await env.DB.prepare("SELECT id FROM categories WHERE parent_id=? AND status='active'").bind(parentId).all()).results;
  const active = selected.filter(id => children.some(child => child.id === id));
  return active.length ? active : ['__all__'];
}

export async function organizationSubcategoriesStatement(env, id, parentId, selections) {
  await ensureOrganizationSubcategories(env);
  return env.DB.prepare(`INSERT INTO organization_subcategory_preferences(organization_id,parent_category_id,selections_json) VALUES(?,?,?)
    ON CONFLICT(organization_id) DO UPDATE SET parent_category_id=excluded.parent_category_id,selections_json=excluded.selections_json`).bind(id, parentId, JSON.stringify(selections));
}
