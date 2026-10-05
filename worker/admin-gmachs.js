// One source of truth for organization rows in all administrator lists.
export const adminGmachSelect=`SELECT o.*,c.contact_phone,osc.code AS gmach_code,u.full_name AS owner_name,u.email AS owner_email,
 (SELECT COUNT(*) FROM items i WHERE i.organization_id=o.id AND i.deleted_at IS NULL) AS item_count,
 (SELECT COUNT(*) FROM items i WHERE i.organization_id=o.id AND i.deleted_at IS NULL AND i.status='active') AS active_item_count
 FROM organizations o LEFT JOIN organization_contacts c ON c.organization_id=o.id LEFT JOIN users u ON u.id=o.owner_id LEFT JOIN organization_serial_codes osc ON osc.organization_id=o.id`;
export async function loadAdminGmachDetails(env,id){
 const organization=await env.DB.prepare(adminGmachSelect+' WHERE o.id=? AND o.deleted_at IS NULL').bind(id).first();
 if(!organization)return null;
 const [items,loans]=await env.DB.batch([
  env.DB.prepare(`SELECT i.*,sc.code AS item_code FROM items i LEFT JOIN item_serial_codes_v2 sc ON sc.item_id=i.id WHERE i.organization_id=? ORDER BY i.created_at DESC`).bind(id),
  env.DB.prepare(`SELECT lr.id,lr.status,lr.workflow_status,lr.requested_from,lr.requested_until,i.title,u.full_name AS borrower_name FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN users u ON u.id=lr.borrower_id WHERE i.organization_id=? ORDER BY lr.created_at DESC LIMIT 200`).bind(id)
 ]);
 return {organization,items:items.results||[],loans:loans.results||[]};
}
