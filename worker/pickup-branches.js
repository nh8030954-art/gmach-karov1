export async function pickupBranches(env,itemId){
 const rows=await env.DB.prepare(`SELECT b.id,b.name,b.city,b.address,
   (SELECT COUNT(*) FROM item_units u WHERE u.item_id=i.id AND u.branch_id=b.id AND u.status IN ('available','held','loaned')) AS unit_capacity,
   (SELECT COUNT(*) FROM item_units u WHERE u.item_id=i.id AND u.branch_id=b.id AND u.status!='retired') AS tracked_units,p.mode,p.quantity_override,i.quantity
   FROM items i JOIN organizations o ON o.id=i.organization_id
   JOIN organization_branches b ON b.organization_id=o.id AND b.status='active'
   LEFT JOIN branch_inventory_policies p ON p.branch_id=b.id AND p.item_id=i.id
   WHERE i.id=? AND i.status='active' AND i.is_free=1 AND o.status='approved' AND o.is_hidden=0
   AND (EXISTS(SELECT 1 FROM item_units u WHERE u.item_id=i.id AND u.branch_id=b.id AND u.status!='retired') OR p.item_id IS NOT NULL)
   ORDER BY b.name,b.id`).bind(itemId).all();
 return (rows.results||[]).map(row=>({id:row.id,name:row.name,city:row.city,address:row.address,capacity:Number(row.tracked_units)>0?Number(row.unit_capacity): (row.mode==='separate'?Number(row.quantity_override||0):Number(row.quantity||0))}));
}
export async function branchAvailable(env,itemId,branch,from,until,pad=0,exclude=''){
 if(!branch)return Infinity;
 const start=new Date(Date.parse(from)-Number(pad||0)*60000).toISOString().slice(0,16),end=new Date(Date.parse(until)+Number(pad||0)*60000).toISOString().slice(0,16);
 const row=await env.DB.prepare(`SELECT COALESCE(SUM(quantity),0) used FROM loan_requests WHERE item_id=? AND (branch_id=? OR branch_id IS NULL) AND status IN ('pending','approved','collected') AND id<>? AND requested_from<? AND requested_until>?`).bind(itemId,branch.id,exclude||'',end,start).first();
 return Math.max(0,branch.capacity-Number(row?.used||0));
}
