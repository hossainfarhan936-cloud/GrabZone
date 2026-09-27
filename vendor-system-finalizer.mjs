import { notifyVendorOrder } from './vendor-order-notify.mjs';
const now=()=>new Date().toISOString();
const clean=(v,n=10000)=>String(v??'').trim().slice(0,n);
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function q(e,s,p=[]){return e.DB.prepare(s).bind(...p).all()}
async function one(e,s,p=[]){return(await q(e,s,p)).results?.[0]||null}
async function sha(v){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v))))].map(x=>x.toString(16).padStart(2,'0')).join('')}
function cookie(r,n){for(const p of(r.headers.get('Cookie')||'').split(';')){const a=p.trim().split('=');if(a[0]===n)return decodeURIComponent(a.slice(1).join('='))}return ''}
async function vendor(r,e){const t=cookie(r,'gz_vendor_session')||(r.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();if(!t)return null;return one(e,"SELECT vu.id,vu.vendor_id,vu.email,vu.role,v.slug,v.brand_name FROM vendor_sessions s JOIN vendor_users vu ON vu.id=s.vendor_user_id JOIN vendors v ON v.id=vu.vendor_id WHERE s.token_hash=? AND s.expires_at>? AND vu.status='Active' AND v.status='Active' LIMIT 1",[await sha(t),now()])}
async function ensureVendorOrderTables(e){
 await e.DB.prepare("CREATE TABLE IF NOT EXISTS vendor_orders(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,vendor_id TEXT NOT NULL,subtotal REAL NOT NULL DEFAULT 0,commission_amount REAL NOT NULL DEFAULT 0,vendor_earnings REAL NOT NULL DEFAULT 0,delivery_charge REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'Processing',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)").run().catch(()=>{});
 await e.DB.prepare("ALTER TABLE vendor_orders ADD COLUMN vendor_notified_at TEXT").run().catch(()=>{});
 await e.DB.prepare("CREATE TABLE IF NOT EXISTS vendor_order_items(id TEXT PRIMARY KEY,vendor_order_id TEXT NOT NULL,order_item_id TEXT NOT NULL,product_id TEXT,quantity INTEGER NOT NULL DEFAULT 1,unit_price REAL NOT NULL DEFAULT 0,line_total REAL NOT NULL DEFAULT 0,variation_id TEXT,variation_options TEXT,variation_sku TEXT)").run().catch(()=>{});
}
async function schema(e){for(const sql of ["ALTER TABLE order_items ADD COLUMN variation_id TEXT","ALTER TABLE order_items ADD COLUMN variation_options TEXT","ALTER TABLE order_items ADD COLUMN variation_sku TEXT","ALTER TABLE vendor_order_items ADD COLUMN variation_id TEXT","ALTER TABLE vendor_order_items ADD COLUMN variation_options TEXT","ALTER TABLE vendor_order_items ADD COLUMN variation_sku TEXT","ALTER TABLE product_variations ADD COLUMN stock_mode TEXT NOT NULL DEFAULT 'untracked'","ALTER TABLE shipments ADD COLUMN customer_notified_at TEXT","CREATE INDEX IF NOT EXISTS order_items_variation_idx ON order_items(variation_id)","CREATE INDEX IF NOT EXISTS vendor_order_items_variation_idx ON vendor_order_items(variation_id)"])await e.DB.prepare(sql).run().catch(()=>{});}
function qty(x){return Math.max(1,Math.floor(Number(x||1)))}
async function reserveInventory(e,items){
 const held=[];
 for(const item of items){
  const n=qty(item.quantity);
  if(item.variation_id){
   const v=await one(e,"SELECT pv.id,pv.status,pv.product_id,p.vendor_id,p.published,p.name product_name FROM product_variations pv JOIN products p ON p.id=pv.product_id WHERE pv.id=?",[clean(item.variation_id,120)]);
   if(!v||!v.published||v.status!=='Available')throw Object.assign(new Error('One selected variation is no longer available.'),{status:409});
   held.push({kind:'variation',id:v.id,qty:n,product_id:v.product_id,vendor_id:v.vendor_id,name:v.product_name});
  }else{
   const p=await one(e,"SELECT id,name,published,vendor_id FROM products WHERE id=?",[clean(item.product_id,120)]);
   if(!p||!p.published)throw Object.assign(new Error('One selected product is no longer available.'),{status:409});
   held.push({kind:'product',id:p.id,qty:n,product_id:p.id,vendor_id:p.vendor_id,name:p.name});
  }
 }
 return held;
}
async function restoreInventory(e,held){return true}async function restoreVendorOrderInventory(e,vendorOrderId,vendorId){return true}
async function logHeld(e,held,orderId){return true}
async function snapshot(e,orderId,payload){const rows=(await q(e,'SELECT id,product_id,quantity,unit_price,line_total FROM order_items WHERE order_id=? ORDER BY rowid',[orderId])).results||[];const items=Array.isArray(payload.items)?payload.items:[];for(let i=0;i<Math.min(rows.length,items.length);i++){const src=items[i];if(!src?.variation_id)continue;const v=await one(e,"SELECT pv.sku,pv.image_url,(SELECT image_url FROM variation_images WHERE variation_id=pv.id ORDER BY sort_order,id LIMIT 1) variation_image FROM product_variations pv WHERE pv.id=?",[clean(src.variation_id,120)]);const opts=src.variation_options&&typeof src.variation_options==='object'?src.variation_options:{};await e.DB.prepare('UPDATE order_items SET variation_id=?,variation_options=?,variation_sku=?,unit_price=?,line_total=?,image_url=COALESCE(?,image_url) WHERE id=?').bind(src.variation_id,JSON.stringify(opts),v?.sku||src.sku||'',Number(src.unit_price||rows[i].unit_price||0),Number(src.line_total||rows[i].line_total||0),v?.image_url||v?.variation_image||src.image_url||null,rows[i].id).run()}const vendorRows=(await q(e,'SELECT voi.id,voi.order_item_id FROM vendor_order_items voi JOIN vendor_orders vo ON vo.id=voi.vendor_order_id WHERE vo.order_id=?',[orderId])).results||[];for(const x of vendorRows){const oi=await one(e,'SELECT variation_id,variation_options,variation_sku FROM order_items WHERE id=?',[x.order_item_id]);if(oi)await e.DB.prepare('UPDATE vendor_order_items SET variation_id=?,variation_options=?,variation_sku=? WHERE id=?').bind(oi.variation_id,oi.variation_options,oi.variation_sku,x.id).run()}}
async function emailStatus(next,e,orderNumber,status){try{const a=await one(e,'SELECT id,email FROM admin_users ORDER BY created_at LIMIT 1');const secret=String(e.MARKETPLACE_AUTH_SECRET||e.D1_AUTH_SECRET||e.GRABZONE_ADMIN_PASSWORD||'');if(!a||!secret)return false;const payload=btoa(JSON.stringify({sub:a.id,email:a.email,exp:Math.floor(Date.now()/1000)+300})).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(payload)))].map(x=>String.fromCharCode(x)).join('');const token=payload+'.'+btoa(sig).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');const r=await next(new Request(new URL('/api/send-order-email',e.PUBLIC_BASE_URL||'http://internal'),{method:'POST',headers:{'Content-Type':'application/json','X-GrabZone-Token':token},body:JSON.stringify({orderNumber,type:'order_status_updated',status})}));return r.ok}catch{return false}}
async function notifyVendor(e,vendorOrderId){
 try{
  /*
    One notification per vendor order, sent through the shared notifier so the
    checkout path, the admin confirmation path and this finalizer cannot email the
    same vendor twice. Delivery status is recorded in vendor_order_notifications.
  */
  const v=await one(e,"SELECT vo.*,v.brand_name,v.business_name,v.order_notification_email,v.email vendor_email,o.order_number,o.customer_name,o.created_at order_created_at,o.status order_status FROM vendor_orders vo JOIN vendors v ON v.id=vo.vendor_id JOIN orders o ON o.id=vo.order_id WHERE vo.id=? LIMIT 1",[vendorOrderId]);
  if(!v)return false;
  const items=(await q(e,"SELECT voi.*,oi.product_name,oi.image_url FROM vendor_order_items voi JOIN order_items oi ON oi.id=voi.order_item_id WHERE voi.vendor_order_id=? ORDER BY voi.rowid",[vendorOrderId])).results||[];
  const subtotal=Number(v.subtotal||0);
  const shipping=Math.max(0,Number(v.delivery_charge||v.shipping_fee||0));
  const result=await notifyVendorOrder(e,{
   orderId:v.order_id,
   orderNumber:v.order_number,
   placedAt:v.order_created_at||v.created_at,
   orderStatus:v.order_status||v.status,
   vendorId:v.vendor_id,
   vendorName:v.brand_name||v.business_name||"GrabZone Vendor",
   recipient:String(v.order_notification_email||v.vendor_email||"").trim(),
   vendorOrderId:v.id,
   items,subtotal,shipping,total:subtotal+shipping,
   customerName:v.customer_name,
  });
  if(result?.sent){
   await e.DB.prepare("UPDATE vendor_orders SET vendor_notified_at=?,updated_at=? WHERE id=?").bind(now(),now(),vendorOrderId).run().catch(()=>{});
   return true;
  }
  return false;
 }catch(err){console.warn("Vendor order notification:",err);return false}
}

async function createVendorOrders(e,orderId){
  const table=(await one(e,"SELECT name FROM sqlite_master WHERE type='table' AND name='vendor_orders'"))?.name;
  if(!table)return;
  const rows=(await q(e,"SELECT oi.id order_item_id,oi.product_id,oi.product_name,oi.quantity,oi.unit_price,oi.line_total,oi.variation_id,oi.variation_options,oi.variation_sku,p.vendor_id,COALESCE(v.brand_name,v.business_name,v.slug,'GrabZone Vendor') vendor_name,COALESCE(v.shipping_fee,0) shipping_fee,COALESCE(v.commission_type,'percentage') commission_type,COALESCE(v.commission_value,0) commission_value FROM order_items oi JOIN products p ON p.id=oi.product_id LEFT JOIN vendors v ON v.id=p.vendor_id WHERE oi.order_id=? ORDER BY oi.rowid",[orderId])).results||[];
  const groups=new Map();
  for(const row of rows){if(!row.vendor_id)continue;if(!groups.has(row.vendor_id))groups.set(row.vendor_id,{vendor_id:row.vendor_id,vendor_name:row.vendor_name,shipping_fee:Number(row.shipping_fee??0),commission_type:String(row.commission_type||'percentage'),commission_value:Number(row.commission_value||0),items:[]});groups.get(row.vendor_id).items.push(row);}
  if(!groups.size)return;
  const voCols=new Set(((await q(e,'PRAGMA table_info(vendor_orders)')).results||[]).map(x=>x.name));
  const voiCols=new Set(((await q(e,'PRAGMA table_info(vendor_order_items)')).results||[]).map(x=>x.name));
  for(const g of groups.values()){
    const exists=await one(e,'SELECT id FROM vendor_orders WHERE order_id=? AND vendor_id=? LIMIT 1',[orderId,g.vendor_id]);
    if(exists)continue;
    const subtotal=Math.max(0,g.items.reduce((n,x)=>n+Number(x.line_total||0),0));
    const commission=g.commission_type==='percentage'?Math.round(subtotal*Math.max(0,g.commission_value)/100*100)/100:Math.min(subtotal,Math.max(0,g.commission_value));
    const earnings=Math.max(0,subtotal-commission);
    const delivery=Math.max(0,Number(g.shipping_fee??0));
    const vo={id:crypto.randomUUID(),order_id:orderId,vendor_id:g.vendor_id,subtotal,shipping_fee:delivery,delivery_charge:delivery,commission_amount:commission,vendor_earnings:earnings,status:'Processing',created_at:now(),updated_at:now()};
    const vfields=Object.keys(vo).filter(k=>voCols.has(k));
    if(!vfields.includes('id')||!vfields.includes('order_id')||!vfields.includes('vendor_id'))continue;
    await e.DB.prepare('INSERT INTO vendor_orders('+vfields.join(',')+') VALUES('+vfields.map(()=>'?').join(',')+')').bind(...vfields.map(k=>vo[k])).run();
    for(const item of g.items){
      const vi={id:crypto.randomUUID(),vendor_order_id:vo.id,order_item_id:item.order_item_id,product_id:item.product_id,quantity:item.quantity,unit_price:item.unit_price,line_total:item.line_total,variation_id:item.variation_id||null,variation_options:item.variation_options||null,variation_sku:item.variation_sku||null};
      const ifields=Object.keys(vi).filter(k=>voiCols.has(k));
      if(!ifields.includes('id')||!ifields.includes('vendor_order_id')||!ifields.includes('order_item_id'))continue;
      await e.DB.prepare('INSERT INTO vendor_order_items('+ifields.join(',')+') VALUES('+ifields.map(()=>'?').join(',')+')').bind(...ifields.map(k=>vi[k])).run();
    }
    await notifyVendor(e,vo.id);
  }
}

async function createOrder(req,e,next){const b=await req.clone().json().catch(()=>null);if(!b||b.fn!=='create_public_order')return null;const payload=b.args?.payload||b.payload||{};const items=Array.isArray(payload.items)?payload.items:[];if(!items.length)return next(req);await schema(e);await ensureVendorOrderTables(e);let shipping=0;const vendorIds=new Set();for(const item of items){const v=await one(e,"SELECT p.vendor_id,ven.status FROM products p LEFT JOIN vendors ven ON ven.id=p.vendor_id WHERE p.id=?",[clean(item.product_id,120)]);if(v?.vendor_id)vendorIds.add(v.vendor_id)}for(const vendorId of vendorIds){const v=await one(e,"SELECT shipping_fee,status FROM vendors WHERE id=?",[vendorId]);if(v?.status==='Active')shipping+=Math.max(0,Number(v.shipping_fee??0))}let held=[];try{held=await reserveInventory(e,items);const nb={...b,args:{...(b.args||{}),payload:{...payload,shipping_charge:shipping,items:items.map(i=>({...i}))}}};const h=new Headers(req.headers);h.delete('content-length');h.set('X-GZ-Inventory-Reserved','1');const r=await next(new Request(req.url,{method:'POST',headers:h,body:JSON.stringify(nb)}));if(!r.ok){await restoreInventory(e,held);return r}const d=await r.clone().json().catch(()=>({})),o=d?.data||d?.order;if(o?.id){await snapshot(e,o.id,payload);await createVendorOrders(e,o.id);await logHeld(e,held,o.id)}else{await restoreInventory(e,held);return json({error:'Order service did not return an order ID.'},500)}return r}catch(err){await restoreInventory(e,held);return json({error:err?.message||'Unable to create order.'},err?.status||500)}}
async function orders(req,e){const u=await vendor(req,e);if(!u)return json({error:'Unauthorized'},401);await schema(e);await ensureVendorOrderTables(e);const rows=(await q(e,`SELECT vo.*,o.order_number,o.public_tracking_id,o.customer_name,o.email,o.phone,o.address,o.district,o.division,o.upazila,o.status order_status,o.created_at order_created_at,o.payment_method,o.shipping_charge,o.total_amount,o.subtotal order_subtotal FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.vendor_id=? ORDER BY vo.created_at DESC`,[u.vendor_id])).results||[];for(const o of rows){let items=(await q(e,`SELECT voi.*,oi.product_name,oi.image_url,COALESCE(NULLIF(voi.variation_sku,''),NULLIF(pv.sku,''),NULLIF(p.sku,''),NULLIF(oi.variation_sku,''),'') sku,COALESCE(voi.variation_options,oi.variation_options) options_json FROM vendor_order_items voi JOIN order_items oi ON oi.id=voi.order_item_id LEFT JOIN products p ON p.id=voi.product_id LEFT JOIN product_variations pv ON pv.id=COALESCE(voi.variation_id,oi.variation_id) WHERE voi.vendor_order_id=? ORDER BY voi.rowid`,[o.id])).results||[];if(!items.length){items=(await q(e,`SELECT oi.*,p.vendor_id,COALESCE(NULLIF(pv.sku,''),NULLIF(p.sku,''),NULLIF(oi.variation_sku,''),'') sku,COALESCE(oi.variation_options,'{}') options_json FROM order_items oi JOIN products p ON p.id=oi.product_id LEFT JOIN product_variations pv ON pv.id=oi.variation_id WHERE oi.order_id=? AND p.vendor_id=? ORDER BY oi.rowid`,[o.order_id,u.vendor_id])).results||[]}for(const i of items){i.variation_options=null;try{i.variation_options=i.options_json?JSON.parse(i.options_json):null}catch{}delete i.options_json}o.items=items;o.item_count=items.reduce((n,i)=>n+Number(i.quantity||1),0);o.shipments=(await q(e,'SELECT * FROM shipments WHERE order_id=? AND vendor_id=? ORDER BY created_at DESC',[o.order_id,u.vendor_id])).results||[]}return json({orders:rows})}
async function status(req,e,next){const u=await vendor(req,e);if(!u)return json({error:'Unauthorized'},401);const b=await req.json().catch(()=>({}));const allowed=['New','Contacting','Confirmed','Processing','Shipped','Delivered','Cancelled'];if(!allowed.includes(b.status))return json({error:'Invalid status.'},400);const vo=await one(e,'SELECT vo.id,vo.order_id,o.order_number FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.id=? AND vo.vendor_id=?',[clean(b.vendor_order_id,120),u.vendor_id]);if(!vo)return json({error:'Vendor order not found.'},404);const previous=vo.status;await e.DB.prepare('UPDATE vendor_orders SET status=?,updated_at=? WHERE id=?').bind(b.status,now(),vo.id).run();if((b.status==='Cancelled'||b.status==='Returned')&&previous!==b.status)await restoreVendorOrderInventory(e,vo.id,u.vendor_id);const rows=(await q(e,'SELECT status FROM vendor_orders WHERE order_id=?',[vo.order_id])).results||[];const s=rows.map(x=>String(x.status||''));let parent='New';if(!s.length)parent='New';else if(s.every(x=>x==='Delivered'))parent='Delivered';else if(s.every(x=>x==='Cancelled'))parent='Cancelled';else if(s.every(x=>x==='Shipped'))parent='Shipped';else if(s.every(x=>x==='Processing'))parent='Processing';else if(s.every(x=>x==='Confirmed'))parent='Confirmed';else if(s.every(x=>x==='Contacting'))parent='Contacting';else if(s.some(x=>x==='Shipped'))parent='Shipped';else if(s.some(x=>x==='Processing'))parent='Processing';else if(s.some(x=>x==='Confirmed'))parent='Confirmed';else if(s.some(x=>x==='Contacting'))parent='Contacting';await e.DB.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').bind(parent,now(),vo.order_id).run();await emailStatus(next,e,vo.order_number,b.status);return json({ok:true,status:b.status,parent_status:parent})}
async function dashboard(req,e){const u=await vendor(req,e);if(!u)return json({error:'Unauthorized'},401);await schema(e);const v=await one(e,'SELECT * FROM vendors WHERE id=?',[u.vendor_id]);const products=Number((await one(e,'SELECT COUNT(*) n FROM products WHERE vendor_id=?',[u.vendor_id]))?.n||0);const orderStats=await one(e,'SELECT COUNT(*) orders,COALESCE(SUM(subtotal),0) sales,COALESCE(SUM(vendor_earnings),0) earnings FROM vendor_orders WHERE vendor_id=?',[u.vendor_id])||{};const open=Number((await one(e,"SELECT COUNT(*) n FROM vendor_orders WHERE vendor_id=? AND status NOT IN ('Delivered','Cancelled','Returned')",[u.vendor_id]))?.n||0);return json({vendor:v,metrics:{products,orders:Number(orderStats.orders||0),sales:Number(orderStats.sales||0),earnings:Number(orderStats.earnings||0),open_shipments:open}})}
export default{fetch:async(req,e,ctx,next)=>{try{const p=new URL(req.url).pathname;if(p==='/api/d1'&&req.method==='POST'){const r=await createOrder(req,e,next);if(r)return r}if(p==='/api/vendor/orders'&&req.method==='GET')return orders(req,e);if(p==='/api/vendor/orders/status'&&req.method==='PATCH')return status(req,e,next);if(p==='/api/vendor/dashboard'&&req.method==='GET')return dashboard(req,e);await schema(e);return next(req)}catch(err){return json({error:err?.message||'Vendor finalizer failed'},500)}}};