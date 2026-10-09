// Reconcile only the item a person is using; no clock, global scan or polling.
export async function reconcileItemDeadlines(env,itemId,now=new Date().toISOString()){
  const rows=(await env.DB.prepare(`SELECT lr.id,lr.status,lr.workflow_status,lr.borrower_id,o.owner_id,i.title FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE lr.item_id=? AND ((lr.status='pending' AND lr.hold_expires_at IS NOT NULL AND lr.hold_expires_at<=?) OR (lr.status='approved' AND lr.workflow_status='approved_ready_for_pickup' AND lr.pickup_expires_at IS NOT NULL AND lr.pickup_expires_at<=?) OR (lr.status='collected' AND lr.workflow_status!='overdue' AND lr.requested_until<?))`).bind(itemId,now,now,now).all()).results||[];
  const changed=[];
  for(const row of rows){
    const workflow=row.status==='pending'?'hold_expired':row.status==='approved'?'pickup_expired':'overdue';
    const status=row.status==='pending'?'cancelled':row.status;
    const update=await env.DB.prepare(`UPDATE loan_requests SET status=?,workflow_status=?,updated_at=?,cancelled_at=CASE WHEN ?='cancelled' THEN ? ELSE cancelled_at END WHERE id=? AND status=? AND workflow_status IS ?`).bind(status,workflow,now,status,now,row.id,row.status,row.workflow_status).run();
    if(!Number(update.meta?.changes))continue;
    const statements=[];
    if(workflow==='hold_expired'){
      statements.push(env.DB.prepare("UPDATE inventory_holds SET status='released' WHERE request_id=? AND status='active'").bind(row.id));
      statements.push(env.DB.prepare("UPDATE item_units SET status='available',updated_at=? WHERE status='held' AND id IN (SELECT unit_id FROM loan_unit_assignments WHERE request_id=? AND returned_at IS NULL)").bind(now,row.id));
      statements.push(env.DB.prepare('UPDATE loan_unit_assignments SET returned_at=? WHERE request_id=? AND returned_at IS NULL').bind(now,row.id));
    }
    const title=workflow==='hold_expired'?'שמירת המלאי פגה':workflow==='pickup_expired'?'חלון האיסוף הסתיים':'ההשאלה באיחור';
    for(const userId of new Set([row.borrower_id,row.owner_id].filter(Boolean)))statements.push(env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body,request_id) VALUES(?,?,'status',?,?,?)").bind(crypto.randomUUID(),userId,title,row.title,row.id));
    statements.push(env.DB.prepare('INSERT INTO loan_request_events(id,request_id,actor_id,event_type,details_json) VALUES(?,?,NULL,?,?)').bind(crypto.randomUUID(),row.id,workflow,JSON.stringify({detectedAt:now,source:'item-action'})));
    await env.DB.batch(statements);
    changed.push({id:row.id,status,workflow_status:workflow});
  }
  return changed;
}
