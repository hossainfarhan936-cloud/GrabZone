import legacy from './worker.mjs';
import { gzApplyCors, gzPreflight } from './cors-policy.mjs';

const now=()=>new Date().toISOString();
const clean=(v,n=10000)=>String(v??'').trim().slice(0,n);
const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...h}});
async function q(env,sql,p=[]){return env.DB.prepare(sql).bind(...p).all()}
async function one(env,sql,p=[]){return (await q(env,sql,p)).results?.[0]||null}
async function sha(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v))))].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function pbkdf(p,s){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(p),'PBKDF2',false,['deriveBits']);const b=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(s),iterations:100000,hash:'SHA-256'},k,256);return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function cookie(req,n){for(const p of (req.headers.get('Cookie')||'').split(';')){const a=p.trim().split('=');if(a[0]===n)return decodeURIComponent(a.slice(1).join('='))}return ''}
async function hmac(secret,data){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(secret)),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(data)))}
function b64(b){let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function ub64(s){s=String(s).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function sign(p,sec){const a=b64(new TextEncoder().encode(JSON.stringify(p)));return a+'.'+b64(await hmac(sec,a))}
async function verify(t,sec){if(!t||!sec)return null;const a=String(t).split('.');if(a.length!==2)return null;const e=await hmac(sec,a[0]),g=ub64(a[1]);if(e.length!==g.length)return null;let d=0;for(let i=0;i<e.length;i++)d|=e[i]^g[i];if(d)return null;try{const p=JSON.parse(new TextDecoder().decode(ub64(a[0])));return p.exp>Date.now()/1000?p:null}catch{return null}}
const secret=e=>String(e.MARKETPLACE_AUTH_SECRET||e.D1_AUTH_SECRET||e.GRABZONE_ADMIN_PASSWORD||'');

let ready;
async function schema(env){if(ready)return ready;ready=(async()=>{
const s=[
`CREATE TABLE IF NOT EXISTS vendors(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,business_name TEXT NOT NULL,brand_name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT,logo_url TEXT,banner_url TEXT,description TEXT,tagline TEXT,accent_color TEXT DEFAULT '#ff6b00',status TEXT NOT NULL DEFAULT 'Active',shipping_fee REAL NOT NULL DEFAULT 130,commission_type TEXT NOT NULL DEFAULT 'percentage',commission_value REAL NOT NULL DEFAULT 10,homepage_visible INTEGER NOT NULL DEFAULT 1,featured INTEGER NOT NULL DEFAULT 0,social_links TEXT DEFAULT '{}',contact_info TEXT DEFAULT '{}',announcement TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS vendor_users(id TEXT PRIMARY KEY,vendor_id TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'vendor_admin',status TEXT NOT NULL DEFAULT 'Active',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS vendor_sessions(token_hash TEXT PRIMARY KEY,vendor_user_id TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS vendor_products(product_id TEXT PRIMARY KEY,vendor_id TEXT NOT NULL,category TEXT,status TEXT DEFAULT 'Active',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS vendor_orders(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,vendor_id TEXT NOT NULL,subtotal REAL DEFAULT 0,shipping_fee REAL DEFAULT 0,commission_amount REAL DEFAULT 0,vendor_earnings REAL DEFAULT 0,status TEXT DEFAULT 'Processing',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(order_id,vendor_id))`,
`CREATE TABLE IF NOT EXISTS vendor_order_items(id TEXT PRIMARY KEY,vendor_order_id TEXT NOT NULL,order_item_id TEXT NOT NULL,product_id TEXT,variation_id TEXT,variation_options TEXT,variation_sku TEXT,sku TEXT,quantity INTEGER NOT NULL,unit_price REAL DEFAULT 0,line_total REAL DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS shipments(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,vendor_id TEXT NOT NULL,courier TEXT,tracking_id TEXT,tracking_url TEXT,status TEXT DEFAULT 'Pending',note TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS shipment_items(id TEXT PRIMARY KEY,shipment_id TEXT NOT NULL,order_item_id TEXT NOT NULL,quantity INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS vendor_store_sections(id TEXT PRIMARY KEY,vendor_id TEXT NOT NULL,section_type TEXT NOT NULL,title TEXT,body TEXT,sort_order INTEGER DEFAULT 0,enabled INTEGER DEFAULT 1,data_json TEXT DEFAULT '{}',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS marketplace_audit_log(id TEXT PRIMARY KEY,actor_type TEXT NOT NULL,actor_id TEXT,action TEXT NOT NULL,vendor_id TEXT,details TEXT,created_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS marketplace_settings(id INTEGER PRIMARY KEY,enabled INTEGER DEFAULT 1,default_shipping REAL DEFAULT 130,show_brands INTEGER DEFAULT 1,show_vendor_badges INTEGER DEFAULT 1,updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS marketplace_categories(id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`];
for(const x of s)await env.DB.prepare(x).run();
await env.DB.prepare("INSERT OR IGNORE INTO marketplace_settings(id,enabled,default_shipping,show_brands,show_vendor_badges,updated_at) VALUES(1,1,130,1,1,?)").bind(now()).run();
for(const x of [`ALTER TABLE product_variations ADD COLUMN regular_price REAL NOT NULL DEFAULT 0`,`ALTER TABLE product_variations ADD COLUMN sale_price REAL`,`ALTER TABLE product_variations ADD COLUMN old_price REAL`,`ALTER TABLE product_variations ADD COLUMN stock_mode TEXT NOT NULL DEFAULT 'untracked'`,`ALTER TABLE product_variations ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 0`,`ALTER TABLE product_variations ADD COLUMN min_qty INTEGER NOT NULL DEFAULT 1`,`ALTER TABLE product_variations ADD COLUMN max_qty INTEGER`,`ALTER TABLE product_variations ADD COLUMN options_key TEXT NOT NULL DEFAULT ''`]){try{await env.DB.prepare(x).run()}catch{}}
for(const x of [`ALTER TABLE vendor_order_items ADD COLUMN variation_id TEXT`,`ALTER TABLE vendor_order_items ADD COLUMN variation_options TEXT`,`ALTER TABLE vendor_order_items ADD COLUMN variation_sku TEXT`,`ALTER TABLE vendor_order_items ADD COLUMN sku TEXT`,`CREATE TABLE IF NOT EXISTS product_variations(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,sku TEXT,regular_price REAL NOT NULL DEFAULT 0,sale_price REAL,old_price REAL,stock INTEGER NOT NULL DEFAULT 0,stock_mode TEXT NOT NULL DEFAULT 'untracked',low_stock_threshold INTEGER NOT NULL DEFAULT 0,image_url TEXT,status TEXT NOT NULL DEFAULT 'Available',min_qty INTEGER NOT NULL DEFAULT 1,max_qty INTEGER,options_key TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,`CREATE INDEX IF NOT EXISTS product_variations_product_idx ON product_variations(product_id)`]){try{await env.DB.prepare(x).run()}catch{}}
for(const x of [`ALTER TABLE products ADD COLUMN vendor_id TEXT`,`ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0`,`ALTER TABLE products ADD COLUMN sku TEXT`,`ALTER TABLE products ADD COLUMN sale_price REAL`,`ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 0`,`ALTER TABLE products ADD COLUMN min_qty INTEGER NOT NULL DEFAULT 1`,`ALTER TABLE products ADD COLUMN max_qty INTEGER`,`ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'simple'`,`ALTER TABLE products ADD COLUMN category_id TEXT`,`ALTER TABLE order_items ADD COLUMN vendor_id TEXT`,`ALTER TABLE order_items ADD COLUMN variation_id TEXT`,`ALTER TABLE order_items ADD COLUMN variation_options TEXT`,`ALTER TABLE order_items ADD COLUMN variation_sku TEXT`]){try{await env.DB.prepare(x).run()}catch{}}
await env.DB.prepare(`INSERT OR IGNORE INTO marketplace_settings(id,updated_at) VALUES(1,?)`).bind(now()).run();
let gz=await one(env,"SELECT id FROM vendors WHERE slug='grabzone'");if(!gz){const id=crypto.randomUUID(),t=now();await env.DB.prepare(`INSERT INTO vendors(id,slug,business_name,brand_name,email,status,shipping_fee,commission_value,featured,homepage_visible,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,'grabzone','GrabZone','GrabZone',String(env.GMAIL_FROM_EMAIL||'admin@grabzone.store'),'Active',130,0,1,1,t,t).run();gz={id}}
await env.DB.prepare('UPDATE products SET vendor_id=? WHERE vendor_id IS NULL').bind(gz.id).run();
})();return ready}
async function admin(req,e){const raw=cookie(req,'gz_admin_session');if(raw){const x=await one(e,"SELECT u.id,u.email FROM admin_sessions s JOIN admin_users u ON u.id=s.admin_user_id WHERE s.token_hash=? AND s.expires_at>?",[await sha(raw),now()]);if(x)return x}const b=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');const p=await verify(b,secret(e));return p?.sub?{id:p.sub,email:p.email}:null}
async function vu(req,e){const raw=cookie(req,'gz_vendor_session')||(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!raw)return null;return one(e,"SELECT vu.id,vu.email,vu.vendor_id,vu.role,v.brand_name,v.slug,v.status vendor_status FROM vendor_sessions s JOIN vendor_users vu ON vu.id=s.vendor_user_id JOIN vendors v ON v.id=vu.vendor_id WHERE s.token_hash=? AND s.expires_at>? AND vu.status='Active' AND v.status='Active'",[await sha(raw),now()])}
async function audit(e,t,a,action,v,d){await e.DB.prepare('INSERT INTO marketplace_audit_log(id,actor_type,actor_id,action,vendor_id,details,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),t,a,action,v,d?JSON.stringify(d):null,now()).run().catch(()=>{})}
async function syncOrder(e,orderId){
await e.DB.prepare('UPDATE order_items SET vendor_id=(SELECT vendor_id FROM products WHERE products.id=order_items.product_id) WHERE order_id=? AND vendor_id IS NULL').bind(orderId).run();
const items=(await q(e,'SELECT * FROM order_items WHERE order_id=?',[orderId])).results||[];const groups=new Map();
for(const i of items){if(!i.vendor_id)continue;if(!groups.has(i.vendor_id))groups.set(i.vendor_id,[]);groups.get(i.vendor_id).push(i)}
for(const [vid,is] of groups){const v=await one(e,'SELECT * FROM vendors WHERE id=?',[vid]);if(!v)continue;const subtotal=is.reduce((n,i)=>n+Number(i.line_total||0),0),comm=v.commission_type==='fixed'?Number(v.commission_value||0):subtotal*Number(v.commission_value||0)/100;let vo=await one(e,'SELECT id FROM vendor_orders WHERE order_id=? AND vendor_id=?',[orderId,vid]);const id=vo?.id||crypto.randomUUID();if(vo)await e.DB.prepare('UPDATE vendor_orders SET subtotal=?,shipping_fee=?,commission_amount=?,vendor_earnings=?,updated_at=? WHERE id=?').bind(subtotal,Number(v.shipping_fee||130),comm,Math.max(0,subtotal-comm),now(),id).run();else await e.DB.prepare('INSERT INTO vendor_orders(id,order_id,vendor_id,subtotal,shipping_fee,commission_amount,vendor_earnings,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,orderId,vid,subtotal,Number(v.shipping_fee||130),comm,Math.max(0,subtotal-comm),'Processing',now(),now()).run();for(const i of is){const exists=await one(e,'SELECT id FROM vendor_order_items WHERE vendor_order_id=? AND order_item_id=?',[id,i.id]);if(!exists)await e.DB.prepare('INSERT INTO vendor_order_items(id,vendor_order_id,order_item_id,product_id,variation_id,variation_options,variation_sku,sku,quantity,unit_price,line_total) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,i.id,i.product_id,i.variation_id||null,i.variation_options||null,i.variation_sku||null,i.variation_sku||i.sku||null,i.quantity,i.unit_price,i.line_total).run()}}
}
async function email(e,num){try{const a=await one(e,'SELECT id,email FROM admin_users ORDER BY created_at LIMIT 1');if(!a)return;const tok=await sign({sub:a.id,email:a.email,exp:Math.floor(Date.now()/1000)+300},secret(e));const u=new URL('/api/send-order-email',e.PUBLIC_BASE_URL||'http://internal');await legacy.fetch(new Request(u,{method:'POST',headers:{'Content-Type':'application/json','X-GrabZone-Token':tok},body:JSON.stringify({orderNumber:num})}),e)}catch{}}
async function vendorAccount(req,e){const p=new URL(req.url).pathname;if(p!=='/api/vendor/account/password')return null;const u=await vu(req,e);if(!u)return json({error:'Unauthorized'},401);if(req.method!=='PATCH')return json({error:'Method not allowed'},405);const b=await req.json().catch(()=>null);if(!b)return json({error:'Invalid JSON'},400);const current=String(b.current_password||''),next=String(b.new_password||'');if(next.length<8)return json({error:'New password must be at least 8 characters.'},400);const row=await one(e,'SELECT id,password_hash,password_salt FROM vendor_users WHERE id=? LIMIT 1',[u.id]);if(!row)return json({error:'Vendor account not found.'},404);const hash=await pbkdf(current,row.password_salt);if(hash!==row.password_hash)return json({error:'Current password is incorrect.'},401);const salt=crypto.randomUUID(),newHash=await pbkdf(next,salt);await e.DB.prepare('UPDATE vendor_users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?').bind(newHash,salt,now(),u.id).run();await e.DB.prepare('DELETE FROM vendor_sessions WHERE vendor_user_id=?').bind(u.id).run().catch(()=>{});return json({ok:true});}
async function vendorSettings(req,e){const p=new URL(req.url).pathname;if(p!=='/api/vendor/settings')return null;const u=await vu(req,e);if(!u)return json({error:'Unauthorized'},401);await e.DB.prepare('CREATE TABLE IF NOT EXISTS vendor_settings(vendor_id TEXT PRIMARY KEY,show_phone INTEGER NOT NULL DEFAULT 1,show_announcement INTEGER NOT NULL DEFAULT 1,show_contact INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL)').run();if(req.method==='GET'){const s=await one(e,'SELECT * FROM vendor_settings WHERE vendor_id=?',[u.vendor_id]);return json({settings:s||{vendor_id:u.vendor_id,show_phone:1,show_announcement:1,show_contact:1}})}if(req.method!=='PATCH')return json({error:'Method not allowed'},405);const b=await req.json().catch(()=>({})),t=now();await e.DB.prepare('INSERT INTO vendor_settings(vendor_id,show_phone,show_announcement,show_contact,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(vendor_id) DO UPDATE SET show_phone=excluded.show_phone,show_announcement=excluded.show_announcement,show_contact=excluded.show_contact,updated_at=excluded.updated_at').bind(u.vendor_id,b.show_phone?1:0,b.show_announcement?1:0,b.show_contact?1:0,t).run();return json({ok:true,settings:await one(e,'SELECT * FROM vendor_settings WHERE vendor_id=?',[u.vendor_id])});}
async function api(req,e){await schema(e);const p=new URL(req.url).pathname;
if(p==='/api/d1'&&req.method==='POST'){let b={};try{b=await req.clone().json()}catch{}if(b.fn==='create_public_order'){const r=await legacy.fetch(req,e);if(r.ok){try{const d=await r.clone().json();const o=d?.data||d?.order;if(o?.id){await syncOrder(e,o.id);await audit(e,'customer',o.id,'ORDER_SPLIT',null,{})}}catch{}}return r}if(b.fn==='track_public_order'){const id=clean(b.args?.p_tracking_id||b.p_tracking_id,120);const o=await one(e,'SELECT id FROM orders WHERE upper(public_tracking_id)=upper(?) OR upper(order_number)=upper(?)',[id,id]);if(o&&await one(e,'SELECT id FROM vendor_orders WHERE order_id=?',[o.id]))return track(req,e,id)}return legacy.fetch(req,e)}
if(p==='/api/vendor/account/password'){const r=await vendorAccount(req,e);if(r)return r}if(p==='/api/vendor/settings'){const r=await vendorSettings(req,e);if(r)return r}if(p==='/api/vendor-auth'){if(req.method==='GET'){const u=await vu(req,e);return json({authenticated:!!u,user:u})}let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)}if(b.action==='logout'){const raw=cookie(req,'gz_vendor_session');if(raw)await e.DB.prepare('DELETE FROM vendor_sessions WHERE token_hash=?').bind(await sha(raw)).run();return json({ok:true},200,{'Set-Cookie':'gz_vendor_session=;Path=/;Max-Age=0;HttpOnly;Secure;SameSite=None'})}const id=clean(b.identifier,200).toLowerCase(),pass=String(b.password||'');const u=await one(e,"SELECT vu.*,v.status vendor_status,v.brand_name,v.slug FROM vendor_users vu JOIN vendors v ON v.id=vu.vendor_id WHERE lower(vu.email)=lower(?)",[id]);if(!u||u.status!=='Active'||u.vendor_status!=='Active'||await pbkdf(pass,u.password_salt)!==u.password_hash)return json({error:'Invalid vendor email or password.'},401);const raw=crypto.randomUUID()+crypto.randomUUID(),exp=new Date(Date.now()+7*86400000).toISOString();await e.DB.prepare('INSERT INTO vendor_sessions(token_hash,vendor_user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await sha(raw),u.id,exp,now()).run();return json({ok:true,user:{id:u.id,email:u.email,vendor_id:u.vendor_id,brand_name:u.brand_name,slug:u.slug}},200,{'Set-Cookie':'gz_vendor_session='+encodeURIComponent(raw)+';Path=/;Max-Age=604800;HttpOnly;Secure;SameSite=None'})}
if(p==='/api/vendor/admin/vendor-data'&&req.method==='GET'){
const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);
const vid=clean(new URL(req.url).searchParams.get('vendor_id'),100);if(!vid)return json({error:'Vendor ID required'},400);
const v=await one(e,'SELECT * FROM vendors WHERE id=?',[vid]);if(!v)return json({error:'Vendor not found'},404);await e.DB.prepare('CREATE TABLE IF NOT EXISTS vendor_settings(vendor_id TEXT PRIMARY KEY,show_phone INTEGER NOT NULL DEFAULT 1,show_announcement INTEGER NOT NULL DEFAULT 1,show_contact INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL)').run().catch(()=>{});const vs=await one(e,'SELECT * FROM vendor_settings WHERE vendor_id=?',[v.id]);v.vendor_settings=vs||{vendor_id:v.id,show_phone:1,show_announcement:1,show_contact:1};
const login=await one(e,'SELECT email,status,role FROM vendor_users WHERE vendor_id=? ORDER BY created_at LIMIT 1',[v.id]);v.login_email=login?.email||'';v.login_status=login?.status||'';v.login_role=login?.role||'vendor_admin';v.login_exists=!!login;
const products=(await q(e,'SELECT p.*,v.brand_name vendor_name FROM products p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.vendor_id=? ORDER BY p.created_at DESC',[vid])).results||[];
const orders=(await q(e,`SELECT vo.*,o.order_number,o.public_tracking_id,o.customer_name,o.email,o.phone,o.division,o.district,o.upazila,o.address,o.payment_method,o.subtotal order_subtotal,o.shipping_charge,o.total,o.status order_status,o.created_at order_created_at,v.brand_name FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id JOIN vendors v ON v.id=vo.vendor_id WHERE vo.vendor_id=? ORDER BY vo.created_at DESC`,[vid])).results||[];
for(const o of orders){
await parentStatus(e,o.order_id);
const canonical=await one(e,'SELECT status FROM orders WHERE id=?',[o.order_id]);if(canonical)o.order_status=canonical.status;o.status=o.order_status||o.status;
let items=(await q(e,`SELECT voi.*,oi.product_name,oi.image_url,oi.variation_id oi_variation_id,oi.variation_options oi_variation_options,oi.variation_sku oi_variation_sku,p.name product_name_current,p.image_url product_image,p.sku product_sku,COALESCE(NULLIF(voi.variation_sku,''),NULLIF(oi.variation_sku,''),NULLIF(pv.sku,''),NULLIF(p.sku,'')) sku,COALESCE(voi.variation_options,oi.variation_options) options_json,pv.image_url variation_image FROM vendor_order_items voi JOIN order_items oi ON oi.id=voi.order_item_id LEFT JOIN products p ON p.id=voi.product_id LEFT JOIN product_variations pv ON pv.id=COALESCE(voi.variation_id,oi.variation_id) WHERE voi.vendor_order_id=? ORDER BY voi.rowid`,[o.id])).results||[];
for(const x of items){try{x.variation_options=x.options_json?JSON.parse(x.options_json):{}}catch{x.variation_options={}}x.sku=x.sku||'';x.product_details={name:x.product_name_current||x.product_name||'Product',image_url:x.variation_image||x.image_url||x.product_image||null,sku:x.sku||x.product_sku||null};delete x.options_json}
o.items=items;o.item_count=items.reduce((n,x)=>n+Number(x.quantity||1),0);o.status=o.order_status||o.status;o.shipments=(await q(e,'SELECT * FROM shipments WHERE order_id=? AND vendor_id=? ORDER BY created_at DESC',[o.order_id,vid])).results||[];for(const sh of o.shipments)sh.status=o.status;
}
return json({vendor:v,products,orders});
}
if(p==='/api/vendor/admin/vendor-settings'){
const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);
const vid=clean(new URL(req.url).searchParams.get('vendor_id'),100);if(!vid)return json({error:'Vendor ID required'},400);
if(!(await one(e,'SELECT id FROM vendors WHERE id=?',[vid])))return json({error:'Vendor not found'},404);
await e.DB.prepare('CREATE TABLE IF NOT EXISTS vendor_settings(vendor_id TEXT PRIMARY KEY,show_phone INTEGER NOT NULL DEFAULT 1,show_announcement INTEGER NOT NULL DEFAULT 1,show_contact INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL)').run();
if(req.method==='GET'){const s=await one(e,'SELECT * FROM vendor_settings WHERE vendor_id=?',[vid]);return json({settings:s||{vendor_id:vid,show_phone:1,show_announcement:1,show_contact:1}})}
if(req.method!=='PATCH')return json({error:'Method not allowed'},405);
const b=await req.json().catch(()=>({}));await e.DB.prepare('INSERT INTO vendor_settings(vendor_id,show_phone,show_announcement,show_contact,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(vendor_id) DO UPDATE SET show_phone=excluded.show_phone,show_announcement=excluded.show_announcement,show_contact=excluded.show_contact,updated_at=excluded.updated_at').bind(vid,b.show_phone?1:0,b.show_announcement?1:0,b.show_contact?1:0,now()).run();return json({ok:true,settings:await one(e,'SELECT * FROM vendor_settings WHERE vendor_id=?',[vid])});
}
if(p==='/api/vendor/admin/settings'){
const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);
if(req.method==='GET'){
 const s=await one(e,'SELECT * FROM marketplace_settings WHERE id=1');
 return json({settings:s||{id:1,enabled:1,default_shipping:130,show_brands:1,show_vendor_badges:1}});
}
if(req.method!=='PATCH')return json({error:'Method not allowed'},405);
let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)}
const enabled=b.enabled?1:0,showBrands=b.show_brands===false?0:1,showBadges=b.show_vendor_badges===false?0:1,fee=Math.max(0,Number(b.default_shipping??130));
if(!Number.isFinite(fee))return json({error:'Invalid default shipping fee'},400);
await e.DB.prepare('UPDATE marketplace_settings SET enabled=?,default_shipping=?,show_brands=?,show_vendor_badges=?,updated_at=? WHERE id=1').bind(enabled,fee,showBrands,showBadges,now()).run();
return json({ok:true,settings:await one(e,'SELECT * FROM marketplace_settings WHERE id=1')});
}
if(p==='/api/marketplace/shipping-settings'){
if(req.method==='GET'){
 const s=await one(e,'SELECT default_shipping FROM marketplace_settings WHERE id=1');
 return json({ok:true,global_shipping_fee:Number(s?.default_shipping??130)});
}
const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);
if(req.method!=='PATCH')return json({error:'Method not allowed'},405);
let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)}
const fee=Number(b.global_shipping_fee);
if(!Number.isFinite(fee)||fee<0||fee>100000)return json({error:'Enter a valid shipping fee.'},400);
await e.DB.prepare('UPDATE marketplace_settings SET default_shipping=?,updated_at=? WHERE id=1').bind(fee,now()).run();
return json({ok:true,global_shipping_fee:fee});
}
if(p==='/api/vendor/admin/categories'){
const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);
if(req.method==='GET'){
 try{
  const rows=(await q(e,"SELECT id,name,slug FROM marketplace_categories ORDER BY name COLLATE NOCASE",[])).results||[];
  return json({categories:rows});
 }catch(err){
  console.error('marketplace categories GET failed',err);
  return json({categories:[],error:'Categories could not be loaded.'},200);
 }
}
if(req.method==='POST'){
 let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)}
 const name=String(b.name||'').trim().slice(0,120);
 const slug=(String(b.slug||name).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')).slice(0,120);
 if(!name)return json({error:'Category name is required'},400);
 if(!slug)return json({error:'Valid slug is required'},400);
 try{
  const exists=await one(e,'SELECT id FROM marketplace_categories WHERE slug=? OR lower(name)=lower(?)',[slug,name]);
  if(exists)return json({error:'Category already exists'},409);
  const id=crypto.randomUUID();
  await e.DB.prepare('INSERT INTO marketplace_categories(id,name,slug,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,name,slug,now(),now()).run();
  return json({ok:true,category:{id,name,slug}},201);
 }catch(err){
  console.error('marketplace categories POST failed',err);
  return json({error:'Category could not be saved.'},500);
 }
}
if(req.method==='DELETE'){
 let b={};try{b=await req.json().catch(()=>({}))}catch{}
 const id=clean(new URL(req.url).searchParams.get('id')||b.id,100);
 if(!id)return json({error:'Category ID is required'},400);
 const cat=await one(e,'SELECT id,name FROM marketplace_categories WHERE id=?',[id]);
 if(!cat)return json({error:'Category not found'},404);
 const used=Number((await one(e,'SELECT COUNT(*) n FROM products WHERE category_id=?',[id]))?.n||0);
 if(used>0 && b.reassign_category_id){
  const target=clean(b.reassign_category_id,100);
  if(target===id)return json({error:'Choose a different category.'},400);
  if(!(await one(e,'SELECT id FROM marketplace_categories WHERE id=?',[target])))return json({error:'Replacement category not found.'},400);
  await e.DB.prepare('UPDATE products SET category_id=?,category=(SELECT name FROM marketplace_categories WHERE id=?),updated_at=? WHERE category_id=?').bind(target,target,now(),id).run();
 }else if(used>0){
  await e.DB.prepare("UPDATE products SET category_id=NULL,category='General',updated_at=? WHERE category_id=?").bind(now(),id).run();
 }
 await e.DB.prepare('DELETE FROM marketplace_categories WHERE id=?').bind(id).run();
 return json({ok:true,deleted_id:id,reassigned_products:used});
}
return json({error:'Method not allowed'},405);
}
if(p==='/api/vendor/admin/order-data'&&req.method==='GET'){
const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);
const oid=clean(new URL(req.url).searchParams.get('order_id'),100);const o=await one(e,'SELECT * FROM orders WHERE id=? OR order_number=? OR public_tracking_id=?',[oid,oid,oid]);if(!o)return json({error:'Order not found'},404);
await parentStatus(e,o.id);const freshOrder=await one(e,'SELECT * FROM orders WHERE id=?',[o.id]);if(freshOrder)Object.assign(o,freshOrder);
const vs=(await q(e,'SELECT vo.*,v.brand_name,v.slug,v.logo_url FROM vendor_orders vo JOIN vendors v ON v.id=vo.vendor_id WHERE vo.order_id=?',[o.id])).results||[];
for(const v of vs){v.status=o.status;v.items=(await q(e,`SELECT voi.*,oi.product_name,oi.image_url,oi.variation_options,oi.variation_sku,p.name product_name_current,p.sku product_sku,pv.sku variation_sku,pv.image_url variation_image FROM vendor_order_items voi JOIN order_items oi ON oi.id=voi.order_item_id LEFT JOIN products p ON p.id=voi.product_id LEFT JOIN product_variations pv ON pv.id=COALESCE(voi.variation_id,oi.variation_id) WHERE voi.vendor_order_id=? ORDER BY voi.rowid`,[v.id])).results||[];for(const x of v.items){try{x.variation_options=x.variation_options?JSON.parse(x.variation_options):{}}catch{x.variation_options={}}x.sku=x.variation_sku||x.variation_sku||x.product_sku||'';x.product_details={name:x.product_name_current||x.product_name||'Product',image_url:x.variation_image||x.image_url||null,sku:x.sku||null}}v.shipments=(await q(e,'SELECT * FROM shipments WHERE order_id=? AND vendor_id=? ORDER BY created_at DESC',[o.id,v.vendor_id])).results||[];for(const sh of v.shipments)sh.status=o.status;}
return json({order:o,vendors:vs});
}
if(p==='/api/vendor/admin/order-status'&&req.method==='PATCH'){
const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)}
const oid=clean(b.order_id||b.vendor_order_id,100),st=clean(b.status,40);
const allowed=['New','Contacting','Confirmed','Processing','Shipped','Delivered','Cancelled'];if(!allowed.includes(st))return json({error:'Invalid status'},400);
const vo=await one(e,'SELECT id,order_id,vendor_id FROM vendor_orders WHERE id=? OR order_id=? LIMIT 1',[oid,oid]);if(!vo)return json({error:'Vendor order not found'},404);
const t=now();
await parentStatus(e,vo.order_id,st);
return json({ok:true,order_id:vo.order_id,status:st});
}
if(p==='/api/vendor/admin/shipment'&&(req.method==='POST'||req.method==='PATCH')){
const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)}
const vo=await one(e,'SELECT vo.*,ord.order_number FROM vendor_orders vo JOIN orders ord ON ord.id=vo.order_id WHERE vo.id=?',[clean(b.vendor_order_id,100)]);
if(!vo)return json({error:'Vendor order not found'},404);
const allowed=['New','Contacting','Confirmed','Processing','Shipped','Delivered','Cancelled'];const st=clean(b.status,40)||'Processing';if(!allowed.includes(st))return json({error:'Invalid shipment status'},400);
const courier=clean(b.courier,100),tracking=clean(b.tracking_id,200);if(!courier||!tracking)return json({error:'Courier and tracking ID required'},400);
if(req.method==='POST'){const id=crypto.randomUUID(),t=now();await e.DB.prepare('INSERT INTO shipments(id,order_id,vendor_id,courier,tracking_id,tracking_url,status,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,vo.order_id,vo.vendor_id,courier,tracking,clean(b.tracking_url,1000),st,clean(b.note,1000),t,t).run();await e.DB.prepare('UPDATE vendor_orders SET status=?,updated_at=? WHERE id=?').bind(st,t,vo.id).run();await parentStatus(e,vo.order_id,st);const parent=await one(e,'SELECT status FROM orders WHERE id=?',[vo.order_id]);await e.DB.prepare('UPDATE orders SET tracking_provider=?,tracking_number=?,tracking_url=?,updated_at=? WHERE id=?').bind(courier,tracking,clean(b.tracking_url,1000),now(),vo.order_id).run().catch(()=>{});await email(e,vo.order_number);return json({ok:true,shipment_id:id,parent_status:parent?.status||st},201)}
const sid=clean(b.shipment_id,100);const sh=await one(e,'SELECT * FROM shipments WHERE id=? AND vendor_id=? AND order_id=?',[sid,vo.vendor_id,vo.order_id]);if(!sh)return json({error:'Shipment not found'},404);await e.DB.prepare('UPDATE shipments SET courier=?,tracking_id=?,tracking_url=?,status=?,note=?,updated_at=? WHERE id=?').bind(courier,tracking,clean(b.tracking_url,1000),st,clean(b.note,1000),now(),sid).run();await e.DB.prepare('UPDATE vendor_orders SET status=?,updated_at=? WHERE id=?').bind(st,now(),vo.id).run();await parentStatus(e,vo.order_id,st);const parent=await one(e,'SELECT status FROM orders WHERE id=?',[vo.order_id]);await e.DB.prepare('UPDATE orders SET tracking_provider=?,tracking_number=?,tracking_url=?,updated_at=? WHERE id=?').bind(courier,tracking,clean(b.tracking_url,1000),now(),vo.order_id).run().catch(()=>{});await email(e,vo.order_number);return json({ok:true,parent_status:parent?.status||st});
}
if(p==='/api/vendor/admin/store-sections'&&(req.method==='GET'||req.method==='POST'||req.method==='PATCH'||req.method==='DELETE')){
const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);const vid=clean(new URL(req.url).searchParams.get('vendor_id'),100);if(!vid)return json({error:'Vendor ID required'},400);if(!(await one(e,'SELECT id FROM vendors WHERE id=?',[vid])))return json({error:'Vendor not found'},404);
if(req.method==='GET')return json({sections:(await q(e,'SELECT * FROM vendor_store_sections WHERE vendor_id=? ORDER BY sort_order,id',[vid])).results||[]});
let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)}
if(req.method==='POST'){const id=crypto.randomUUID(),t=now();await e.DB.prepare('INSERT INTO vendor_store_sections(id,vendor_id,section_type,title,body,sort_order,enabled,data_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,vid,clean(b.section_type,50)||'custom',clean(b.title,300),clean(b.body,10000),Number(b.sort_order||0),b.enabled===false?0:1,JSON.stringify(b.data_json||{}),t,t).run();return json({ok:true,id})}
const id=clean(b.id,100);if(req.method==='PATCH'){await e.DB.prepare('UPDATE vendor_store_sections SET section_type=?,title=?,body=?,sort_order=?,enabled=?,data_json=?,updated_at=? WHERE id=? AND vendor_id=?').bind(clean(b.section_type,50)||'custom',clean(b.title,300),clean(b.body,10000),Number(b.sort_order||0),b.enabled?1:0,JSON.stringify(b.data_json||{}),now(),id,vid).run();return json({ok:true})}
await e.DB.prepare('DELETE FROM vendor_store_sections WHERE id=? AND vendor_id=?').bind(id,vid).run();return json({ok:true});
}
if(p==='/api/vendor/admin/reset-password'&&req.method==='POST'){
const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)}
const vid=clean(b.vendor_id,100),pass=String(b.password||''),loginEmail=clean(b.login_email||b.email,200).toLowerCase();
if(!vid||pass.length<8)return json({error:'Vendor ID and password of 8+ characters required.'},400);
if(loginEmail&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(loginEmail))return json({error:'Valid login email is required.'},400);
const v=await one(e,'SELECT id FROM vendors WHERE id=? OR slug=? LIMIT 1',[vid,vid]);if(!v)return json({error:'Vendor not found'},404);
const clash=loginEmail?await one(e,'SELECT id,vendor_id FROM vendor_users WHERE lower(email)=lower(?) AND vendor_id<>? LIMIT 1',[loginEmail,v.id]):null;
if(clash)return json({error:'That login email is already used by another vendor account.'},409);
const u=await one(e,'SELECT id,email FROM vendor_users WHERE vendor_id=? ORDER BY created_at LIMIT 1',[v.id]);
const salt=crypto.randomUUID(),hash=await pbkdf(pass,salt);
if(u){
 await e.DB.prepare('UPDATE vendor_users SET email=?,password_hash=?,password_salt=?,status=\'Active\',updated_at=? WHERE id=?').bind(loginEmail||u.email,hash,salt,now(),u.id).run();
 return json({ok:true,login_email:loginEmail||u.email,login_created:false});
}
if(!loginEmail)return json({error:'Login email is required to create a vendor login.'},400);
const uid=crypto.randomUUID(),t=now();
await e.DB.prepare('INSERT INTO vendor_users(id,vendor_id,email,password_hash,password_salt,status,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(uid,v.id,loginEmail,hash,salt,'Active','vendor_admin',t,t).run();
return json({ok:true,login_email:loginEmail,login_created:true});
}

if(p==='/api/vendor/variations'){
 const u=await vu(req,e); if(!u)return json({error:'Unauthorized'},401);
 const url=new URL(req.url),pid=clean(url.searchParams.get('product_id')||'',120);
 if(!pid)return json({error:'product_id is required.'},400);
 const owner=await one(e,'SELECT id,name,price,product_type FROM products WHERE id=? AND vendor_id=?',[pid,u.vendor_id]);
 if(!owner)return json({error:'Product not found.'},404);
 for(const sql of [
  'CREATE TABLE IF NOT EXISTS product_options(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,name TEXT NOT NULL,sort_order INTEGER DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS option_values(id TEXT PRIMARY KEY,option_id TEXT NOT NULL,value TEXT NOT NULL,sort_order INTEGER DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS variation_options(variation_id TEXT NOT NULL,option_id TEXT NOT NULL,option_value_id TEXT NOT NULL,PRIMARY KEY(variation_id,option_id))',
  'CREATE TABLE IF NOT EXISTS variation_images(id TEXT PRIMARY KEY,variation_id TEXT NOT NULL,image_url TEXT NOT NULL,sort_order INTEGER DEFAULT 0,created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS product_variations(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,sku TEXT,regular_price REAL NOT NULL DEFAULT 0,sale_price REAL,old_price REAL,stock INTEGER NOT NULL DEFAULT 0,stock_mode TEXT NOT NULL DEFAULT "untracked",low_stock_threshold INTEGER NOT NULL DEFAULT 0,image_url TEXT,status TEXT NOT NULL DEFAULT "Available",min_qty INTEGER NOT NULL DEFAULT 1,max_qty INTEGER,options_key TEXT NOT NULL DEFAULT "",created_at TEXT NOT NULL,updated_at TEXT NOT NULL)'
 ]) await e.DB.prepare(sql).run().catch(()=>{});
 for(const sql of [
  'ALTER TABLE product_variations ADD COLUMN regular_price REAL NOT NULL DEFAULT 0',
  'ALTER TABLE product_variations ADD COLUMN sale_price REAL',
  'ALTER TABLE product_variations ADD COLUMN old_price REAL',
  'ALTER TABLE product_variations ADD COLUMN stock_mode TEXT NOT NULL DEFAULT "untracked"',
  'ALTER TABLE product_variations ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE product_variations ADD COLUMN min_qty INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE product_variations ADD COLUMN max_qty INTEGER',
  'ALTER TABLE product_variations ADD COLUMN options_key TEXT NOT NULL DEFAULT ""'
 ]) await e.DB.prepare(sql).run().catch(()=>{});
 if(req.method==='GET'){
  const options=(await q(e,'SELECT * FROM product_options WHERE product_id=? ORDER BY sort_order,id',[pid])).results||[];
  for(const o of options)o.values=(await q(e,'SELECT * FROM option_values WHERE option_id=? ORDER BY sort_order,id',[o.id])).results||[];
  const variations=(await q(e,"SELECT * FROM product_variations WHERE product_id=? AND status!='Disabled' ORDER BY created_at,id",[pid])).results||[];
  for(const v of variations){
   v.options={};
   for(const x of (await q(e,'SELECT po.name,ov.value FROM variation_options vo JOIN product_options po ON po.id=vo.option_id JOIN option_values ov ON ov.id=vo.option_value_id WHERE vo.variation_id=? ORDER BY po.sort_order,ov.sort_order',[v.id])).results||[])v.options[x.name]=x.value;
   v.images=(await q(e,'SELECT image_url FROM variation_images WHERE variation_id=? ORDER BY sort_order,id',[v.id])).results?.map(x=>x.image_url)||[];
  }
  return json({product:owner,enabled:options.length>0||variations.length>0,options,variations});
 }
 let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)};
 if(req.method==='POST'){
  const os=(Array.isArray(b.options)?b.options:[]).map((o,i)=>({name:clean(o?.name,80),values:[...new Set((Array.isArray(o?.values)?o.values:[]).map(v=>clean(v,120)).filter(Boolean))],sort_order:i})).filter(o=>o.name&&o.values.length);
  const seen=new Set();for(const o of os)if(seen.has(o.name.toLowerCase()))return json({error:'Option names must be unique.'},400);else seen.add(o.name.toLowerCase());
  if(!os.length)return json({error:'Add at least one option with values.'},400);
  let combos=[{}];for(const o of os){const next=[];for(const base of combos)for(const value of o.values)next.push({...base,[o.name]:value});combos=next}
  if(combos.length>200)return json({error:'Maximum 200 generated variations per product.'},400);
  const existing=(await q(e,'SELECT id,options_key FROM product_variations WHERE product_id=?',[pid])).results||[];
  const oldBy=new Map(existing.map(x=>[x.options_key,x])),t=now();
  const oldOpts=(await q(e,'SELECT id FROM product_options WHERE product_id=?',[pid])).results||[];
  const oldIds=oldOpts.map(x=>x.id);
  if(oldIds.length){
   const ph=oldIds.map(()=>'?').join(',');
   const oldVals=(await q(e,'SELECT id FROM option_values WHERE option_id IN ('+ph+')',oldIds)).results||[];
   const valIds=oldVals.map(x=>x.id);
   const oldVars=(await q(e,'SELECT id FROM product_variations WHERE product_id=?',[pid])).results||[];
   for(const v of oldVars)await e.DB.prepare('DELETE FROM variation_options WHERE variation_id=?').bind(v.id).run().catch(()=>{});
   if(valIds.length)await e.DB.prepare('DELETE FROM option_values WHERE id IN ('+valIds.map(()=>'?').join(',')+')').bind(...valIds).run().catch(()=>{});
   await e.DB.prepare('DELETE FROM product_options WHERE id IN ('+ph+')').bind(...oldIds).run().catch(()=>{});
  }
  const optionIds=new Map();
  for(const o of os){
   const oid=crypto.randomUUID();optionIds.set(o.name,oid);
   await e.DB.prepare('INSERT INTO product_options(id,product_id,name,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(oid,pid,o.name,o.sort_order,t,t).run();
   for(let i=0;i<o.values.length;i++)await e.DB.prepare('INSERT INTO option_values(id,option_id,value,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),oid,o.values[i],i,t,t).run();
  }
  const optionRows=(await q(e,'SELECT po.id,po.name,ov.id value_id,ov.value FROM product_options po JOIN option_values ov ON ov.option_id=po.id WHERE po.product_id=? ORDER BY po.sort_order,ov.sort_order',[pid])).results||[];
  const map=new Map(optionRows.map(x=>[x.name+'\u0000'+x.value,{option_id:x.id,value_id:x.value_id}]));
  const keep=new Set();
  for(const selected of combos){
   const key=Object.entries(selected).sort((a,b)=>a[0].localeCompare(b[0])).map(([a,v])=>a+'='+v).join('|').slice(0,1000);keep.add(key);
   const old=oldBy.get(key),id=old?.id||crypto.randomUUID();
   if(old)await e.DB.prepare('UPDATE product_variations SET status=CASE WHEN status="Disabled" THEN "Available" ELSE status END,updated_at=? WHERE id=?').bind(t,id).run();
   else await e.DB.prepare('INSERT INTO product_variations(id,product_id,sku,regular_price,sale_price,old_price,stock,stock_mode,low_stock_threshold,image_url,status,min_qty,max_qty,options_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,pid,'',Number(owner.price||0),null,null,0,'untracked',5,'','Available',1,null,key,t,t).run();
   for(const o of os){const m=map.get(o.name+'\u0000'+selected[o.name]);if(m)await e.DB.prepare('INSERT OR IGNORE INTO variation_options(variation_id,option_id,option_value_id) VALUES(?,?,?)').bind(id,m.option_id,m.value_id).run();}
  }
  for(const x of existing)if(!keep.has(x.options_key))await e.DB.prepare('UPDATE product_variations SET status="Disabled",updated_at=? WHERE id=?').bind(t,x.id).run();
  const rows=(await q(e,"SELECT * FROM product_variations WHERE product_id=? AND status!='Disabled' ORDER BY created_at,id",[pid])).results||[];
  return json({ok:true,count:combos.length,options:os,variations:rows});
 }
 if(req.method==='PATCH'){
  const id=clean(url.pathname.split('/').pop(),120),v=await one(e,'SELECT * FROM product_variations WHERE id=? AND product_id=?',[id,pid]);if(!v)return json({error:'Variation not found.'},404);
  const status=['Available','Out of Stock','Disabled'].includes(b.status)?b.status:v.status;
  const hasStock=b.stock!==undefined&&b.stock!==null&&b.stock!=='',stock=hasStock?Math.max(0,Math.floor(Number(b.stock))):Number(v.stock||0);
  const regular=b.regular_price===undefined?Number(v.regular_price||0):Math.max(0,Number(b.regular_price));
  const sale=b.sale_price===null||b.sale_price===''?null:(b.sale_price===undefined?v.sale_price:Math.max(0,Number(b.sale_price)));
  const old=b.old_price===null||b.old_price===''?null:(b.old_price===undefined?v.old_price:Math.max(0,Number(b.old_price)));
  await e.DB.prepare('UPDATE product_variations SET sku=?,regular_price=?,sale_price=?,old_price=?,stock=?,image_url=?,status=?,stock_mode=?,low_stock_threshold=?,updated_at=? WHERE id=?').bind(clean(b.sku??v.sku,120),regular, sale, old, stock, clean(b.image_url??v.image_url,2000),status,(status==='Out of Stock'||stock>0)?'tracked':'untracked',Math.max(0,Math.floor(Number(b.low_stock_threshold??v.low_stock_threshold??0))),now(),id).run();
  if(Array.isArray(b.images)){await e.DB.prepare('DELETE FROM variation_images WHERE variation_id=?').bind(id).run();for(let i=0;i<Math.min(10,b.images.length);i++)await e.DB.prepare('INSERT INTO variation_images(id,variation_id,image_url,sort_order,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,clean(b.images[i],2000),i,now()).run();}
  return json({ok:true});
 }
 if(req.method==='DELETE'){const id=clean(url.pathname.split('/').pop(),120);await e.DB.prepare('UPDATE product_variations SET status="Disabled",updated_at=? WHERE id=? AND product_id=?').bind(now(),id,pid).run();return json({ok:true});}
 return json({error:'Method not allowed'},405);
}
if(p==='/api/vendor/admin/products'&&(req.method==='GET'||req.method==='POST'||req.method==='PATCH'||req.method==='DELETE')){
const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);
const u=new URL(req.url),vid=clean(u.searchParams.get('vendor_id'),100);
if(req.method==='GET'){
 const rows=(await q(e,`SELECT p.*,c.name category_name,c.slug category_slug,v.brand_name vendor_name FROM products p LEFT JOIN marketplace_categories c ON c.id=p.category_id LEFT JOIN vendors v ON v.id=p.vendor_id WHERE (?='' OR p.vendor_id=?) ORDER BY p.created_at DESC`,[vid||'',vid||''])).results||[];
 for(const p0 of rows){if(!p0.category_name&&p0.category) {const cc=await one(e,'SELECT id,name,slug FROM marketplace_categories WHERE lower(trim(name))=lower(trim(?)) LIMIT 1',[p0.category]);if(cc){p0.category_id=cc.id;p0.category_name=cc.name;p0.category_slug=cc.slug}}}
 for(const p0 of rows){
  p0.variations=(await q(e,'SELECT * FROM product_variations WHERE product_id=? ORDER BY created_at,id',[p0.id])).results||[];
  for(const v of p0.variations){
   v.price=v.regular_price;
   v.options={};
   try{const vr=(await q(e,'SELECT po.name,ov.value FROM variation_options vo JOIN product_options po ON po.id=vo.option_id JOIN option_values ov ON ov.id=vo.option_value_id WHERE vo.variation_id=? ORDER BY po.sort_order,ov.sort_order',[v.id])).results||[];for(const x of vr)v.options[x.name]=x.value}catch{}
  }
  try{await e.DB.prepare('CREATE TABLE IF NOT EXISTS product_images(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,image_url TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,is_main INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)').run().catch(()=>{});await e.DB.prepare('CREATE TABLE IF NOT EXISTS vendor_product_images(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,vendor_id TEXT NOT NULL,image_url TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)').run().catch(()=>{});const a=(await q(e,'SELECT image_url FROM product_images WHERE product_id=? ORDER BY sort_order,id',[p0.id])).results||[];const b=(await q(e,'SELECT image_url FROM vendor_product_images WHERE product_id=? ORDER BY sort_order,id',[p0.id])).results||[];let legacy=[];try{legacy=Array.isArray(p0.image_urls)?p0.image_urls:(typeof p0.image_urls==='string'?JSON.parse(p0.image_urls||'[]'):[])}catch{};p0.image_urls=[...new Set([...a,...b].map(x=>x.image_url).concat(legacy,p0.image_url||[]).map(x=>String(x||'').trim()).filter(Boolean))].slice(0,10)}catch{p0.image_urls=p0.image_url?[p0.image_url]:[]}
 }
 return json({products:rows});
}
let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)}
const productId=clean(b.id,100);
if(req.method==='DELETE'){if(!productId)return json({error:'Product ID required'},400);const target=await one(e,'SELECT id,vendor_id FROM products WHERE id=?',[productId]);if(!target)return json({error:'Product not found'},404);if(vid&&String(target.vendor_id)!==String(vid))return json({error:'Product does not belong to this vendor.'},403);await e.DB.prepare('DELETE FROM variation_images WHERE variation_id IN (SELECT id FROM product_variations WHERE product_id=?)').bind(productId).run().catch(()=>{});await e.DB.prepare('DELETE FROM variation_options WHERE variation_id IN (SELECT id FROM product_variations WHERE product_id=?)').bind(productId).run().catch(()=>{});await e.DB.prepare('DELETE FROM product_variations WHERE product_id=?').bind(productId).run().catch(()=>{});await e.DB.prepare('DELETE FROM product_images WHERE product_id=?').bind(productId).run().catch(()=>{});await e.DB.prepare('DELETE FROM vendor_product_images WHERE product_id=?').bind(productId).run().catch(()=>{});await e.DB.prepare('DELETE FROM products WHERE id=? AND vendor_id=?').bind(productId,target.vendor_id).run();return json({ok:true,deleted_product_id:productId});}
if(req.method==='PATCH'){
 const p0=await one(e,'SELECT * FROM products WHERE id=?',[productId]);if(!p0)return json({error:'Product not found'},404);
 if(b.category_id!==undefined){const cid=clean(b.category_id,100);if(cid){const cc=await one(e,'SELECT id,name,slug FROM marketplace_categories WHERE id=?',[cid]);if(!cc)return json({error:'Selected category does not exist.'},400);b.category_id=cc.id;b.category=cc.name;}else{b.category_id=null;b.category='General';}}
 const fields=['name','category','category_id','price','sale_price','old_price','image_url','tag','description','published','vendor_id','stock','sku','low_stock_threshold','min_qty','max_qty','product_type'];
 const ss=[],pp=[];for(const k of fields)if(b[k]!==undefined){let v=b[k];if(['price','sale_price','old_price'].includes(k))v=v===null||v===''?null:Number(v);if(['stock','low_stock_threshold','min_qty','max_qty'].includes(k))v=v===null||v===''?null:Math.max(0,Math.floor(Number(v)));if(k==='published')v=b[k]?1:0;if(k==='product_type')v=v==='variable'?'variable':'simple';ss.push(k+'=?');pp.push(v)}if(ss.length){ss.push('updated_at=?');pp.push(now(),productId);await e.DB.prepare('UPDATE products SET '+ss.join(',')+' WHERE id=?').bind(...pp).run();}
if(Array.isArray(b.image_urls)){
  const imageUrls=b.image_urls.map(x=>clean(x,2000)).filter(Boolean).slice(0,10);
  await e.DB.prepare('CREATE TABLE IF NOT EXISTS product_images(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,image_url TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,is_main INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)').run().catch(()=>{});
  await e.DB.prepare('DELETE FROM product_images WHERE product_id=?').bind(productId).run();
  if(imageUrls.length) await e.DB.batch(imageUrls.map((url,i)=>e.DB.prepare('INSERT INTO product_images(id,product_id,image_url,sort_order,is_main,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),productId,url,i,i===0?1:0,now())));
  if(imageUrls[0]) await e.DB.prepare('UPDATE products SET image_url=?,updated_at=? WHERE id=?').bind(imageUrls[0],now(),productId).run();
}
if(Array.isArray(b.variations))await saveVariations(e,productId,b.variations);
return json({ok:true,product:await one(e,'SELECT * FROM products WHERE id=?',[productId]),variations:(await q(e,'SELECT * FROM product_variations WHERE product_id=? ORDER BY created_at,id',[productId])).results||[]});
}
const vId=clean(b.vendor_id||vid,100);if(!vId)return json({error:'Vendor ID required'},400);if(!(await one(e,'SELECT id FROM vendors WHERE id=?',[vId])))return json({error:'Vendor not found'},404);
const name=clean(b.name,300);const price=Number(b.price);if(!name||!Number.isFinite(price)||price<0)return json({error:'Product name and valid price are required.'},400);
const id=crypto.randomUUID(),t=now(),type=b.product_type==='variable'?'variable':'simple',imageUrls=Array.isArray(b.image_urls)?b.image_urls.map(x=>clean(x,2000)).filter(Boolean):[];
let categoryId=clean(b.category_id,100),categoryName='General';
if(categoryId){const cc=await one(e,'SELECT id,name FROM marketplace_categories WHERE id=?',[categoryId]);if(!cc)return json({error:'Selected category does not exist.'},400);categoryId=cc.id;categoryName=cc.name;}else if(clean(b.category,120)){const cc=await one(e,'SELECT id,name FROM marketplace_categories WHERE lower(trim(name))=lower(trim(?)) LIMIT 1',[clean(b.category,120)]);if(cc){categoryId=cc.id;categoryName=cc.name;}else categoryName=clean(b.category,120);}
await e.DB.prepare('INSERT INTO products(id,name,category,category_id,price,sale_price,old_price,image_url,tag,description,published,vendor_id,stock,sku,low_stock_threshold,min_qty,max_qty,product_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,name,categoryName,categoryId,price,b.sale_price===null||b.sale_price===''?null:Number(b.sale_price??null),b.old_price===null||b.old_price===''?null:Number(b.old_price??null),clean(b.image_url||imageUrls[0],2000),clean(b.tag,100),clean(b.description,10000),b.published===false?0:1,vId,Math.max(0,Math.floor(Number(b.stock||0))),clean(b.sku,100),Math.max(0,Math.floor(Number(b.low_stock_threshold??5))),Math.max(1,Math.floor(Number(b.min_qty??1))),b.max_qty===null||b.max_qty===''?null:Math.max(1,Math.floor(Number(b.max_qty))),type,t,t).run();
if(imageUrls.length){await e.DB.prepare('CREATE TABLE IF NOT EXISTS product_images(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,image_url TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,is_main INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)').run().catch(()=>{});await e.DB.batch(imageUrls.map((url,i)=>e.DB.prepare('INSERT INTO product_images(id,product_id,image_url,sort_order,is_main,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,url,i,i===0?1:0,t)));}
if(Array.isArray(b.variations)&&b.variations.length)await saveVariations(e,id,b.variations);
return json({ok:true,id,product:await one(e,'SELECT * FROM products WHERE id=?',[id]),variations:(await q(e,'SELECT * FROM product_variations WHERE product_id=? ORDER BY created_at,id',[id])).results||[]},201);
}
async function saveVariations(e,productId,rows){
 if(!Array.isArray(rows))return;
 for(const sql of [
  'CREATE TABLE IF NOT EXISTS product_options(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,name TEXT NOT NULL,sort_order INTEGER DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS option_values(id TEXT PRIMARY KEY,option_id TEXT NOT NULL,value TEXT NOT NULL,sort_order INTEGER DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS variation_options(variation_id TEXT NOT NULL,option_id TEXT NOT NULL,option_value_id TEXT NOT NULL,PRIMARY KEY(variation_id,option_id))',
  'CREATE TABLE IF NOT EXISTS variation_images(id TEXT PRIMARY KEY,variation_id TEXT NOT NULL,image_url TEXT NOT NULL,sort_order INTEGER DEFAULT 0,created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS product_variations(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,sku TEXT,regular_price REAL NOT NULL DEFAULT 0,sale_price REAL,old_price REAL,stock INTEGER NOT NULL DEFAULT 0,stock_mode TEXT NOT NULL DEFAULT "untracked",low_stock_threshold INTEGER NOT NULL DEFAULT 0,image_url TEXT,status TEXT NOT NULL DEFAULT "Available",min_qty INTEGER NOT NULL DEFAULT 1,max_qty INTEGER,options_key TEXT NOT NULL DEFAULT "",created_at TEXT NOT NULL,updated_at TEXT NOT NULL)'
 ]) await e.DB.prepare(sql).run().catch(()=>{});
 const t=now();
 await e.DB.prepare('DELETE FROM variation_options WHERE variation_id IN (SELECT id FROM product_variations WHERE product_id=?)').bind(productId).run().catch(()=>{});
 await e.DB.prepare('DELETE FROM variation_images WHERE variation_id IN (SELECT id FROM product_variations WHERE product_id=?)').bind(productId).run().catch(()=>{});
 await e.DB.prepare('DELETE FROM product_variations WHERE product_id=?').bind(productId).run();
 const oldOpts=(await q(e,'SELECT id FROM product_options WHERE product_id=?',[productId])).results||[];
 if(oldOpts.length){const ids=oldOpts.map(x=>x.id),ph=ids.map(()=>'?').join(',');await e.DB.prepare('DELETE FROM option_values WHERE option_id IN ('+ph+')').bind(...ids).run().catch(()=>{});await e.DB.prepare('DELETE FROM product_options WHERE id IN ('+ph+')').bind(...ids).run().catch(()=>{});}
 const groups=new Map();
 for(const row of rows){const opts=row.options??row.variation_options??row.attributes??{};for(const [name,value] of Object.entries(opts||{})){const n=clean(name,80),v=clean(value,120);if(!n||!v)continue;if(!groups.has(n))groups.set(n,new Set());groups.get(n).add(v)}}
 const optionMap=new Map();
 let order=0;
 for(const [name,values] of groups){const oid=crypto.randomUUID();optionMap.set(name,{id:oid,values:new Map()});await e.DB.prepare('INSERT INTO product_options(id,product_id,name,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(oid,productId,name,order++,t,t).run();let i=0;for(const value of values){const vid=crypto.randomUUID();optionMap.get(name).values.set(value,vid);await e.DB.prepare('INSERT INTO option_values(id,option_id,value,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(vid,oid,value,i++,t,t).run();}}
 for(const x of rows.slice(0,200)){
  const opts=x.options??x.variation_options??x.attributes??{},id=clean(x.id,100)||crypto.randomUUID(),sku=clean(x.sku||x.variation_sku,100)||'',regular=Math.max(0,Number(x.price??x.regular_price??0)),sale=x.sale_price===null||x.sale_price===''?null:Number(x.sale_price??null),stock=Math.max(0,Math.floor(Number(x.stock??0))),status=['Available','Out of Stock','Disabled'].includes(x.status)?x.status:'Available';
  const key=Object.entries(opts||{}).sort((a,b)=>a[0].localeCompare(b[0])).map(([a,v])=>a+'='+v).join('|').slice(0,1000);
  await e.DB.prepare('INSERT INTO product_variations(id,product_id,sku,regular_price,sale_price,old_price,stock,stock_mode,low_stock_threshold,image_url,status,min_qty,max_qty,options_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,productId,sku,regular,sale,x.old_price===null||x.old_price===''?null:Number(x.old_price??null),stock,(status==='Out of Stock'||stock>0)?'tracked':'untracked',Math.max(0,Math.floor(Number(x.low_stock_threshold??0))),clean(x.image_url,2000)||'',status,1,null,key,t,t).run();
  for(const [name,value] of Object.entries(opts||{})){const m=optionMap.get(name),valueId=m?.values.get(clean(value,120));if(m&&valueId)await e.DB.prepare('INSERT OR IGNORE INTO variation_options(variation_id,option_id,option_value_id) VALUES(?,?,?)').bind(id,m.id,valueId).run();}
 }
}
if(p==='/api/vendor/admin/order-delete'&&req.method==='POST'){
 const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);
 const b=await req.json().catch(()=>null);if(!b)return json({error:'Invalid JSON'},400);
 const oid=clean(b.order_id,120);if(!oid)return json({error:'Order ID required'},400);
 const order=await one(e,'SELECT id FROM orders WHERE id=? OR order_number=? OR public_tracking_id=? LIMIT 1',[oid,oid,oid]);
 const orderId=order?.id||oid;
 const vendorOrders=(await q(e,'SELECT id FROM vendor_orders WHERE order_id=?',[orderId])).results||[];
 const voIds=vendorOrders.map(x=>x.id).filter(Boolean);
 const shipments=(await q(e,'SELECT id FROM shipments WHERE order_id=?',[orderId])).results||[];
 const shIds=shipments.map(x=>x.id).filter(Boolean);
 if(shIds.length)await e.DB.prepare('DELETE FROM shipment_items WHERE shipment_id IN ('+shIds.map(()=>'?').join(',')+')').bind(...shIds).run();
 await e.DB.prepare('DELETE FROM shipments WHERE order_id=?').bind(orderId).run();
 if(voIds.length)await e.DB.prepare('DELETE FROM vendor_order_items WHERE vendor_order_id IN ('+voIds.map(()=>'?').join(',')+')').bind(...voIds).run();
 await e.DB.prepare('DELETE FROM vendor_orders WHERE order_id=?').bind(orderId).run();
 await e.DB.prepare('DELETE FROM order_items WHERE order_id=?').bind(orderId).run().catch(()=>{});
 await e.DB.prepare('DELETE FROM orders WHERE id=?').bind(orderId).run().catch(()=>{});
 return json({ok:true,deleted_order_id:orderId,deleted_vendor_orders:voIds.length});
}
if(p==='/api/vendor/admin/overview'){
 const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);
 if(req.method!=='GET')return json({error:'Method not allowed'},405);
 const totals=await one(e,"SELECT COALESCE(SUM(vo.subtotal),0) sales,COUNT(DISTINCT vo.order_id) orders,COALESCE(SUM(vo.commission_amount),0) commission,COALESCE(SUM(vo.vendor_earnings),0) earnings FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id")||{sales:0,orders:0,commission:0,earnings:0};
 const vendors=(await q(e,"SELECT v.id,v.slug,v.brand_name,v.business_name,v.status,COALESCE((SELECT COUNT(*) FROM products p WHERE p.vendor_id=v.id),0) products,COALESCE((SELECT COUNT(DISTINCT vo.order_id) FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.vendor_id=v.id),0) orders,COALESCE((SELECT SUM(vo.subtotal) FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.vendor_id=v.id),0) sales,COALESCE((SELECT SUM(vo.commission_amount) FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.vendor_id=v.id),0) commission,COALESCE((SELECT SUM(vo.vendor_earnings) FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.vendor_id=v.id),0) earnings FROM vendors v ORDER BY v.featured DESC,v.brand_name")).results||[];
 return json({totals,vendors});
}
if(p==='/api/vendor/admin/vendors'){const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);if(req.method==='GET'){const vs=(await q(e,'SELECT * FROM vendors ORDER BY featured DESC,brand_name')).results||[];for(const v of vs){v.product_count=Number((await one(e,'SELECT COUNT(*) n FROM products WHERE vendor_id=?',[v.id]))?.n||0);v.order_count=Number((await one(e,'SELECT COUNT(DISTINCT vo.order_id) n FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.vendor_id=?',[v.id]))?.n||0);const vu=await one(e,'SELECT email,status,role FROM vendor_users WHERE vendor_id=? ORDER BY created_at LIMIT 1',[v.id]);v.login_email=vu?.email||'';v.login_status=vu?.status||'';v.login_exists=!!vu}return json({vendors:vs})}let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)}const name=clean(b.business_name||b.brand_name,120),brand=clean(b.brand_name||name,120),email=clean(b.email,200).toLowerCase(),loginEmail=clean(b.login_email||b.email,200).toLowerCase(),pass=String(b.password||'');if(!name||!brand||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)||pass.length<8)return json({error:'Valid store email, login email and 8+ character password required.'},400);let slug=clean(b.slug||brand.toLowerCase().replace(/[^a-z0-9]+/g,'-'),70)||'vendor';let base=slug,n=1;while(await one(e,'SELECT id FROM vendors WHERE slug=?',[slug]))slug=base+'-'+(++n);const id=crypto.randomUUID(),salt=crypto.randomUUID(),t=now();await e.DB.prepare('INSERT INTO vendors(id,slug,business_name,brand_name,email,phone,logo_url,banner_url,description,tagline,accent_color,status,shipping_fee,commission_type,commission_value,homepage_visible,featured,social_links,contact_info,announcement,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,slug,name,brand,email,clean(b.phone,40),clean(b.logo_url,1000),clean(b.banner_url,1000),clean(b.description,5000),clean(b.tagline,300),clean(b.accent_color,30)||'#ff6b00','Active',Math.max(0,Number(b.shipping_fee??130)),b.commission_type==='fixed'?'fixed':'percentage',Math.max(0,Number(b.commission_value??10)),b.homepage_visible===false?0:1,b.featured?1:0,JSON.stringify(b.social_links||{}),JSON.stringify(b.contact_info||{}),clean(b.announcement,500),t,t).run();const loginClash=await one(e,'SELECT id FROM vendor_users WHERE lower(email)=lower(?) LIMIT 1',[loginEmail]);if(loginClash)return json({error:'That login email is already used by another vendor account.'},409);await e.DB.prepare('INSERT INTO vendor_users(id,vendor_id,email,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,loginEmail,await pbkdf(pass,salt),salt,t,t).run();await audit(e,'admin',a.id,'VENDOR_CREATED',id,{brand});return json({ok:true,vendor:{id,slug,brand_name:brand,email}})}
if(p.startsWith('/api/vendor/admin/vendors/')&&req.method==='DELETE'){
const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);
const id=clean(p.split('/').pop(),100);const v=await one(e,'SELECT id,brand_name FROM vendors WHERE id=? OR slug=? LIMIT 1',[id,id]);if(!v)return json({error:'Vendor not found'},404);
const pc=Number((await one(e,'SELECT COUNT(*) n FROM products WHERE vendor_id=?',[v.id]))?.n||0),oc=Number((await one(e,'SELECT COUNT(DISTINCT vo.order_id) n FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.vendor_id=?',[v.id]))?.n||0);
if(pc>0||oc>0)return json({error:`Cannot permanently delete this vendor because it has ${pc} product(s) and ${oc} order(s). Suspend the vendor instead, or remove its products and resolve order history first.`,product_count:pc,order_count:oc},409);
const sh=(await q(e,'SELECT id FROM shipments WHERE vendor_id=?',[v.id])).results||[];
const sess=(await q(e,'SELECT s.token_hash FROM vendor_sessions s JOIN vendor_users u ON u.id=s.vendor_user_id WHERE u.vendor_id=?',[v.id])).results||[];
const ids=sh.map(x=>x.id).filter(Boolean);
if(ids.length)await e.DB.prepare('DELETE FROM shipment_items WHERE shipment_id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).run().catch(()=>{});
await e.DB.prepare('DELETE FROM shipments WHERE vendor_id=?').bind(v.id).run().catch(()=>{});
await e.DB.prepare('DELETE FROM vendor_sessions WHERE token_hash IN (SELECT s.token_hash FROM vendor_sessions s JOIN vendor_users u ON u.id=s.vendor_user_id WHERE u.vendor_id=?)').bind(v.id).run().catch(()=>{});
await e.DB.prepare('DELETE FROM vendor_users WHERE vendor_id=?').bind(v.id).run().catch(()=>{});
await e.DB.prepare('DELETE FROM vendor_products WHERE vendor_id=?').bind(v.id).run().catch(()=>{});
await e.DB.prepare('DELETE FROM vendor_store_sections WHERE vendor_id=?').bind(v.id).run().catch(()=>{});
await e.DB.prepare('DELETE FROM marketplace_audit_log WHERE vendor_id=?').bind(v.id).run().catch(()=>{});
await e.DB.prepare('DELETE FROM vendors WHERE id=?').bind(v.id).run();
return json({ok:true,deleted:v});
}
if(p.startsWith('/api/vendor/admin/vendors/')&&req.method==='PATCH'){const a=await admin(req,e);if(!a)return json({error:'Unauthorized'},401);const id=p.split('/').pop();let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)};const fields=['business_name','brand_name','email','phone','logo_url','banner_url','description','tagline','accent_color','status','shipping_fee','commission_type','commission_value','homepage_visible','featured','announcement','social_links','contact_info'];const sets=[],ps=[];for(const k of fields)if(b[k]!==undefined){sets.push(k+'=?');ps.push(['social_links','contact_info'].includes(k)?JSON.stringify(b[k]||{}):['shipping_fee','commission_value'].includes(k)?Math.max(0,Number(b[k])):['homepage_visible','featured'].includes(k)?(b[k]?1:0):clean(b[k],10000))}if(!sets.length)return json({ok:true});sets.push('updated_at=?');ps.push(now());await e.DB.prepare('UPDATE vendors SET '+sets.join(',')+' WHERE id=? OR slug=?').bind(...ps,id,id).run();return json({ok:true})}
if(p==='/api/vendor/dashboard'||p==='/api/vendor/products'||p==='/api/vendor/orders'||p==='/api/vendor/profile'||p==='/api/vendor/sections'||p==='/api/vendor/shipments'||p==='/api/vendor/order-status'||p==='/api/vendor/categories'){const u=await vu(req,e);if(!u)return json({error:'Unauthorized'},401);const vid=u.vendor_id;
if(p==='/api/vendor/categories'){
 if(req.method!=='GET')return json({error:'Method not allowed'},405);
 await e.DB.prepare("CREATE TABLE IF NOT EXISTS marketplace_categories(id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)").run().catch(()=>{});
 const categories=(await q(e,'SELECT id,name,slug FROM marketplace_categories ORDER BY name COLLATE NOCASE')).results||[];
 return json({categories});
}
if(p==='/api/vendor/dashboard')return json({vendor:{id:vid,brand_name:u.brand_name,slug:u.slug},metrics:{products:Number((await one(e,'SELECT COUNT(*) n FROM products WHERE vendor_id=?',[vid]))?.n||0),orders:Number((await one(e,'SELECT COUNT(DISTINCT vo.order_id) n FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.vendor_id=?',[vid]))?.n||0),sales:Number((await one(e,'SELECT COALESCE(SUM(vo.subtotal),0) n FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.vendor_id=?',[vid]))?.n||0),earnings:Number((await one(e,'SELECT COALESCE(SUM(vo.vendor_earnings),0) n FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.vendor_id=?',[vid]))?.n||0),commission:Number((await one(e,'SELECT COALESCE(SUM(vo.commission_amount),0) n FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.vendor_id=?',[vid]))?.n||0),low_stock:Number((await one(e,'SELECT COUNT(*) n FROM products WHERE vendor_id=? AND stock<=5',[vid]))?.n||0)}});
if(p==='/api/vendor/products'){await e.DB.prepare('CREATE TABLE IF NOT EXISTS vendor_product_images(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,vendor_id TEXT NOT NULL,image_url TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)').run().catch(()=>{});await e.DB.prepare('ALTER TABLE products ADD COLUMN category_id TEXT').run().catch(()=>{});await e.DB.prepare("CREATE TABLE IF NOT EXISTS marketplace_categories(id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)").run().catch(()=>{});await e.DB.prepare('ALTER TABLE products ADD COLUMN sale_price REAL').run().catch(()=>{});await e.DB.prepare('ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 5').run().catch(()=>{});await e.DB.prepare('ALTER TABLE products ADD COLUMN min_qty INTEGER NOT NULL DEFAULT 1').run().catch(()=>{});await e.DB.prepare('ALTER TABLE products ADD COLUMN max_qty INTEGER').run().catch(()=>{});await e.DB.prepare("ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'simple'").run().catch(()=>{});if(req.method==='GET'){const rows=(await q(e,'SELECT p.*,v.brand_name vendor_name FROM products p JOIN vendors v ON v.id=p.vendor_id WHERE p.vendor_id=? ORDER BY p.created_at DESC',[vid])).results||[];for(const p of rows){p.image_urls=(await q(e,'SELECT image_url FROM vendor_product_images WHERE product_id=? AND vendor_id=? ORDER BY sort_order,id',[p.id,vid])).results?.map(x=>x.image_url)||[];if(!p.image_urls.length&&p.image_url)p.image_urls=[p.image_url]}return json({products:rows})}let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)}const validate=async(base={})=>{const categoryId=String(b.category_id||base.category_id||'').trim();if(!categoryId)return'Please select a marketplace category.';const category=await one(e,'SELECT id,name FROM marketplace_categories WHERE id=? LIMIT 1',[categoryId]);if(!category)return'Selected category is not available.';const regular=b.price===undefined?Number(base.price||0):Number(b.price);if(!Number.isFinite(regular)||regular<0)return'Valid regular price is required.';const sale=b.sale_price===undefined||b.sale_price===null||b.sale_price===''?null:Number(b.sale_price);if(sale!==null&&(!Number.isFinite(sale)||sale<0))return'Valid sale price is required.';const min=Math.max(1,Math.floor(Number(b.min_qty??1))),max=b.max_qty===null||b.max_qty===''?null:Math.max(1,Math.floor(Number(b.max_qty)));if(max!==null&&max<min)return'Maximum quantity cannot be below minimum quantity.';return null};if(req.method==='POST'){const err=await validate();if(err)return json({error:err},400);const id=crypto.randomUUID(),t=now(),regular=Number(b.price),sale=b.sale_price===null||b.sale_price===''?null:Number(b.sale_price),min=Math.max(1,Math.floor(Number(b.min_qty??1))),max=b.max_qty===null||b.max_qty===''?null:Math.max(1,Math.floor(Number(b.max_qty)));await e.DB.prepare('INSERT INTO products(id,name,category,category_id,price,sale_price,old_price,image_url,tag,description,published,vendor_id,stock,sku,low_stock_threshold,min_qty,max_qty,product_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,clean(b.name,300),clean(b.category,120)||'General',String(b.category_id||''),regular,sale,b.old_price===''?null:Number(b.old_price??null),clean(b.image_url,2000),clean(b.tag,100),clean(b.description,10000),b.published===false?0:1,vid,Math.max(0,Math.floor(Number(b.stock||0))),clean(b.sku,100),Math.max(0,Math.floor(Number(b.low_stock_threshold??5))),min,max,b.product_type==='variable'?'variable':'simple',t,t).run();const imageUrls=[...new Set((Array.isArray(b.image_urls)?b.image_urls:[]).map(x=>clean(x,2000)).filter(Boolean))].slice(0,10);if(imageUrls.length){await e.DB.prepare('DELETE FROM vendor_product_images WHERE product_id=? AND vendor_id=?').bind(id,vid).run();for(let i=0;i<imageUrls.length;i++)await e.DB.prepare('INSERT INTO vendor_product_images(id,product_id,vendor_id,image_url,sort_order,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,vid,imageUrls[i],i,t).run()}return json({ok:true,id,product:await one(e,'SELECT * FROM products WHERE id=?',[id])},201)}if(req.method==='PATCH'){const id=clean(b.id,100),p0=await one(e,'SELECT * FROM products WHERE id=? AND vendor_id=?',[id,vid]);if(!p0)return json({error:'Product not found'},404);const err=await validate(p0);if(err)return json({error:err},400);const f=['name','category','category_id','price','sale_price','old_price','image_url','tag','description','published','stock','sku','low_stock_threshold','min_qty','max_qty','product_type'],ss=[],pp=[];for(const k of f)if(b[k]!==undefined){let v=b[k];if(['price','sale_price','old_price'].includes(k))v=v===null||v===''?null:Number(v);if(['stock','low_stock_threshold'].includes(k))v=Math.max(0,Math.floor(Number(v||0)));if(k==='min_qty')v=Math.max(1,Math.floor(Number(v||1)));if(k==='max_qty')v=v===null||v===''?null:Math.max(1,Math.floor(Number(v)));if(k==='published')v=b[k]?1:0;if(k==='product_type')v=v==='variable'?'variable':'simple';if(k==='category'&&!String(v||'').trim())v='General';ss.push(k+'=?');pp.push(v)}if(!ss.length)return json({error:'No changes supplied'},400);ss.push('updated_at=?');pp.push(now(),id,vid);await e.DB.prepare('UPDATE products SET '+ss.join(',')+' WHERE id=? AND vendor_id=?').bind(...pp).run();if(Array.isArray(b.image_urls)){const imageUrls=[...new Set(b.image_urls.map(x=>clean(x,2000)).filter(Boolean))].slice(0,10);await e.DB.prepare('DELETE FROM vendor_product_images WHERE product_id=? AND vendor_id=?').bind(id,vid).run();for(let i=0;i<imageUrls.length;i++)await e.DB.prepare('INSERT INTO vendor_product_images(id,product_id,vendor_id,image_url,sort_order,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,vid,imageUrls[i],i,now()).run()}return json({ok:true,product:await one(e,'SELECT * FROM products WHERE id=?',[id])})}return json({error:'Method not allowed'},405)}
if(p==='/api/vendor/profile'){let b={};if(req.method==='GET')return json({vendor:await one(e,'SELECT * FROM vendors WHERE id=?',[vid])});try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)}const allowed=['business_name','brand_name','phone','logo_url','banner_url','description','tagline','accent_color','announcement','social_links','contact_info'];const ss=[],pp=[];for(const k of allowed)if(b[k]!==undefined){ss.push(k+'=?');pp.push(['social_links','contact_info'].includes(k)?JSON.stringify(b[k]||{}):clean(b[k],10000))}if(ss.length){ss.push('updated_at=?');pp.push(now(),vid);await e.DB.prepare('UPDATE vendors SET '+ss.join(',')+' WHERE id=?').bind(...pp,vid).run()}return json({ok:true})}
if(p==='/api/vendor/sections'){if(req.method==='GET')return json({sections:(await q(e,'SELECT * FROM vendor_store_sections WHERE vendor_id=? ORDER BY sort_order',[vid])).results||[]});let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)};if(req.method==='POST'){const id=crypto.randomUUID(),t=now();await e.DB.prepare('INSERT INTO vendor_store_sections(id,vendor_id,section_type,title,body,sort_order,enabled,data_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,vid,clean(b.section_type,50),clean(b.title,300),clean(b.body,10000),Number(b.sort_order||0),b.enabled===false?0:1,JSON.stringify(b.data_json||{}),t,t).run();return json({ok:true,id})}if(req.method==='DELETE'){const id=clean(b.id,100);if(!id)return json({error:'Section ID required.'},400);await e.DB.prepare('DELETE FROM vendor_store_sections WHERE id=? AND vendor_id=?').bind(id,vid).run();return json({ok:true})}if(req.method==='PATCH'){const id=clean(b.id,100);await e.DB.prepare('UPDATE vendor_store_sections SET title=?,body=?,sort_order=?,enabled=?,data_json=?,updated_at=? WHERE id=? AND vendor_id=?').bind(clean(b.title,300),clean(b.body,10000),Number(b.sort_order||0),b.enabled?1:0,JSON.stringify(b.data_json||{}),now(),id,vid).run();return json({ok:true})}}
if(p==='/api/vendor/orders'){const orders=(await q(e,`SELECT vo.*,o.order_number,o.public_tracking_id,o.customer_name,o.email,o.phone,o.division,o.district,o.upazila,o.address,o.payment_method,o.subtotal order_subtotal,o.shipping_charge,o.total,o.status order_status,o.created_at order_created_at,v.brand_name FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id JOIN vendors v ON v.id=vo.vendor_id WHERE vo.vendor_id=? ORDER BY vo.created_at DESC`,[vid])).results||[];for(const o of orders){let items=(await q(e,`SELECT voi.*,oi.product_name,oi.image_url,oi.variation_id oi_variation_id,oi.variation_options oi_variation_options,oi.variation_sku oi_variation_sku,p.name product_name_current,p.image_url product_image,p.sku product_sku,COALESCE(NULLIF(voi.variation_sku,''),NULLIF(oi.variation_sku,''),NULLIF(pv.sku,''),NULLIF(p.sku,'')) sku,COALESCE(voi.variation_options,oi.variation_options) options_json,pv.image_url variation_image FROM vendor_order_items voi JOIN order_items oi ON oi.id=voi.order_item_id LEFT JOIN products p ON p.id=voi.product_id LEFT JOIN product_variations pv ON pv.id=COALESCE(voi.variation_id,oi.variation_id) WHERE voi.vendor_order_id=? ORDER BY voi.rowid`,[o.id])).results||[];if(!items.length)items=(await q(e,`SELECT oi.*,p.vendor_id,p.image_url product_image,p.sku product_sku,COALESCE(NULLIF(oi.variation_sku,''),NULLIF(pv.sku,''),NULLIF(p.sku,'')) sku,oi.variation_options options_json,pv.image_url variation_image FROM order_items oi JOIN products p ON p.id=oi.product_id LEFT JOIN product_variations pv ON pv.id=oi.variation_id WHERE oi.order_id=? AND p.vendor_id=? ORDER BY oi.rowid`,[o.order_id,vid])).results||[];for(const i of items){try{i.variation_options=i.options_json?JSON.parse(i.options_json):{}}catch{i.variation_options={}}i.sku=i.sku||'';i.product_details={name:i.product_name_current||i.product_name||'Product',image_url:i.variation_image||i.image_url||i.product_image||null,sku:i.sku||i.product_sku||null};delete i.options_json}o.items=items;o.item_count=items.reduce((n,i)=>n+Number(i.quantity||1),0);o.shipments=(await q(e,'SELECT * FROM shipments WHERE order_id=? AND vendor_id=? ORDER BY created_at DESC',[o.order_id,vid])).results||[]}return json({orders})}
if(p==='/api/vendor/order-status'&&req.method==='PATCH'){let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)};const allowed=['New','Contacting','Confirmed','Processing','Shipped','Delivered','Cancelled'];if(!allowed.includes(b.status))return json({error:'Invalid status'},400);const o=await one(e,'SELECT * FROM vendor_orders WHERE id=? AND vendor_id=?',[clean(b.vendor_order_id,100),vid]);if(!o)return json({error:'Order not found'},404);await e.DB.prepare('UPDATE vendor_orders SET status=?,updated_at=? WHERE id=?').bind(b.status,now(),o.id).run();await parentStatus(e,o.order_id,b.status);await email(e,(await one(e,'SELECT order_number FROM orders WHERE id=?',[o.order_id]))?.order_number);return json({ok:true})}
if(p==='/api/vendor/shipments'&&req.method==='POST'){let b={};try{b=await req.json()}catch{return json({error:'Invalid JSON'},400)};const o=await one(e,'SELECT vo.*,ord.order_number FROM vendor_orders vo JOIN orders ord ON ord.id=vo.order_id WHERE vo.id=? AND vo.vendor_id=?',[clean(b.vendor_order_id,100),vid]);if(!o)return json({error:'Vendor order not found'},404);if(!clean(b.courier,100)||!clean(b.tracking_id,200))return json({error:'Courier and tracking ID required'},400);const id=crypto.randomUUID(),t=now(),st=clean(b.status,40)||'Processing';if(!['New','Contacting','Confirmed','Processing','Shipped','Delivered','Cancelled'].includes(st))return json({error:'Invalid shipment status'},400);await e.DB.prepare('INSERT INTO shipments(id,order_id,vendor_id,courier,tracking_id,tracking_url,status,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,o.order_id,vid,clean(b.courier,100),clean(b.tracking_id,200),clean(b.tracking_url,1000),st,clean(b.note,1000),t,t).run();await e.DB.prepare('UPDATE vendor_orders SET status=?,updated_at=? WHERE id=?').bind(st,t,o.id).run();await parentStatus(e,o.order_id,st);await e.DB.prepare('UPDATE orders SET tracking_provider=?,tracking_number=?,tracking_url=?,updated_at=? WHERE id=?').bind(clean(b.courier,100),clean(b.tracking_id,200),clean(b.tracking_url,1000),now(),o.order_id).run().catch(()=>{});await email(e,o.order_number);return json({ok:true,shipment_id:id})}}
if(p==='/api/marketplace/brands'){const u=new URL(req.url),all=u.searchParams.get('all')==='1';const a=(await q(e,`SELECT id,slug,business_name,brand_name,logo_url,banner_url,description,tagline,accent_color,featured FROM vendors WHERE status='Active' ${all?'':'AND homepage_visible=1'} ORDER BY featured DESC,brand_name`)).results||[];return json({brands:a})}
if(p==='/api/marketplace/products'){
 const u=new URL(req.url),v=clean(u.searchParams.get('vendor'),100),rawIds=String(u.searchParams.get('ids')||'').split(',').map(x=>clean(x,120)).filter(Boolean).slice(0,500);
 /*
   Pagination. The defaults keep every existing caller working unchanged: the
   storefront asks for limit=500 and still receives the whole catalogue, while a
   caller that asks for one page now gets exactly that page, the total and a
   has_more flag instead of the entire feed every time.
 */
 const MAX_LIMIT=500;
 const askedLimit=Number(u.searchParams.get('limit'));
 const limit=Number.isFinite(askedLimit)&&askedLimit>0?Math.min(MAX_LIMIT,Math.floor(askedLimit)):MAX_LIMIT;
 const askedPage=Number(u.searchParams.get('page'));
 const page=Number.isFinite(askedPage)&&askedPage>0?Math.floor(askedPage):1;
 const rawOffset=u.searchParams.get('offset');
 const askedOffset=rawOffset===null||rawOffset===''?NaN:Number(rawOffset);
 const offset=Number.isFinite(askedOffset)&&askedOffset>=0?Math.floor(askedOffset):(page-1)*limit;
 let where=" FROM products p JOIN vendors v ON v.id=p.vendor_id WHERE p.published=1",ps=[];
 if(rawIds.length){where+=' AND p.id IN ('+rawIds.map(()=>'?').join(',')+')';ps.push(...rawIds)}
 else{where+=" AND v.status='Active'";if(v){where+=' AND (v.slug=? OR v.id=?)';ps.push(v,v)}}
 const select="SELECT p.*,v.brand_name vendor_name,v.slug vendor_slug,v.logo_url vendor_logo,v.accent_color vendor_accent,v.shipping_fee vendor_shipping_fee";
 const totalRow=(await q(e,'SELECT COUNT(*) n'+where,ps)).results?.[0];
 const total=Number(totalRow?.n||0);
 const rows=(await q(e,select+where+' ORDER BY p.created_at DESC LIMIT ? OFFSET ?',[...ps,limit,offset])).results||[];
 const pagination={limit,page,offset,total,pages:Math.max(1,Math.ceil(total/limit)),has_more:offset+rows.length<total,count:rows.length};
/*
  Admin console feed vs public catalogue feed.
  The admin table (marketplace-products.html) asks for scope=admin and must carry
  an admin session; it gets the full row set including SKU, stock and the
  supplier reference. Every public caller (storefront, brand stores, home
  brand cards, checkout) keeps working but only receives the public columns —
  supplier reference, SKU and inventory internals are never returned.
*/
const adminScope=u.searchParams.get('scope')==='admin';
if(adminScope){
 if(!await admin(req,e))return json({error:'Unauthorized'},401);
 return json({products:rows,pagination});
}
const PRIVATE_FIELDS=new Set(['business_koro_product_id','sku','stock','stock_mode','low_stock_threshold','vendor_featured']);
return json({products:rows.map(row=>{const out={};for(const k of Object.keys(row)){if(!PRIVATE_FIELDS.has(k))out[k]=row[k]}return out}),pagination})}
if(p==='/api/marketplace/store'){const s=clean(new URL(req.url).searchParams.get('slug'),100),v=await one(e,"SELECT * FROM vendors WHERE slug=? AND status='Active'",[s]);if(!v)return json({error:'Store not found'},404);return json({vendor:v,products:(await q(e,'SELECT * FROM products WHERE vendor_id=? AND published=1 ORDER BY created_at DESC',[v.id])).results||[],sections:(await q(e,'SELECT * FROM vendor_store_sections WHERE vendor_id=? AND enabled=1 ORDER BY sort_order',[v.id])).results||[]})}
if(p==='/api/marketplace/track'){return track(req,e,clean(new URL(req.url).searchParams.get('tracking_id'),120))}
if(p==='/api/marketplace/order'&&req.method==='POST'){return json({error:'Use the existing checkout.'},400)}
return null}
async function parentStatus(e,id,forcedStatus){
  const t=now();
  let status=forcedStatus;
  if(status){
    await e.DB.prepare('UPDATE vendor_orders SET status=?,updated_at=? WHERE order_id=?').bind(status,t,id).run();
    await e.DB.prepare('UPDATE shipments SET status=?,updated_at=? WHERE order_id=?').bind(status,t,id).run().catch(()=>{});
  }else{
    const s=(await q(e,'SELECT status FROM vendor_orders WHERE order_id=?',[id])).results?.map(x=>String(x.status||''))||[];
    status='New';
    if(!s.length)status='New';
    else if(s.every(a=>a==='Delivered'))status='Delivered';
    else if(s.every(a=>a==='Cancelled'))status='Cancelled';
    else if(s.every(a=>a==='Shipped'))status='Shipped';
    else if(s.every(a=>a==='Processing'))status='Processing';
    else if(s.every(a=>a==='Confirmed'))status='Confirmed';
    else if(s.every(a=>a==='Contacting'))status='Contacting';
    else if(s.some(a=>a==='Shipped'))status='Shipped';
    else if(s.some(a=>a==='Processing'))status='Processing';
    else if(s.some(a=>a==='Confirmed'))status='Confirmed';
    else if(s.some(a=>a==='Contacting'))status='Contacting';
  }
  const agg=(await q(e,'SELECT COUNT(*) n,COALESCE(SUM(shipping_fee),0) shipping FROM vendor_orders WHERE order_id=?',[id])).results?.[0];
  if(Number(agg?.n||0)>0){
    const o=await one(e,'SELECT subtotal,referral_discount,grabpoints_discount,mystery_discount,rewards_voucher_discount FROM orders WHERE id=?',[id]);
    const ship=Math.max(0,Number(agg.shipping||0));
    const total=Math.max(0,Number(o?.subtotal||0)+ship-Number(o?.referral_discount||0)-Number(o?.grabpoints_discount||0)-Number(o?.mystery_discount||0)-Number(o?.rewards_voucher_discount||0));
    await e.DB.prepare('UPDATE orders SET status=?,shipping_charge=?,total=?,updated_at=? WHERE id=?').bind(status,ship,total,t,id).run();
  }else{
    await e.DB.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').bind(status,t,id).run();
  }
  return status;
}
async function track(req,e,id){const o=await one(e,'SELECT * FROM orders WHERE upper(public_tracking_id)=upper(?) OR upper(order_number)=upper(?)',[id,id]);if(!o)return json({error:'Order not found'},404);const vs=(await q(e,'SELECT vo.*,v.brand_name,v.slug,v.logo_url,v.shipping_fee vendor_shipping_fee FROM vendor_orders vo JOIN vendors v ON v.id=vo.vendor_id WHERE vo.order_id=?',[o.id])).results||[];for(const v of vs){v.items=(await q(e,"SELECT voi.*,oi.product_name,oi.image_url,oi.unit_price,oi.quantity,oi.line_total,oi.variation_id,oi.variation_options,oi.variation_sku,p.name product_name_current,p.image_url product_image,p.sku product_sku,pv.image_url variation_image,pv.sku variation_sku FROM vendor_order_items voi JOIN order_items oi ON oi.id=voi.order_item_id LEFT JOIN products p ON p.id=voi.product_id LEFT JOIN product_variations pv ON pv.id=COALESCE(voi.variation_id,oi.variation_id) WHERE voi.vendor_order_id=? ORDER BY oi.rowid",[v.id])).results||[];for(const i of v.items){i.product_id=i.product_id||null;i.product_name=i.product_name_current||i.product_name||'Product';i.image_url=i.variation_image||i.image_url||i.product_image||null;i.sku=i.variation_sku||i.product_sku||null;try{i.variation_options=i.variation_options?JSON.parse(i.variation_options):{}}catch{i.variation_options={}}}v.shipments=(await q(e,'SELECT * FROM shipments WHERE order_id=? AND vendor_id=? ORDER BY created_at',[o.id,v.vendor_id])).results||[]}
  const storedShipping=Number(o.shipping_charge);
  const vendorShipping=vs.reduce((sum,v)=>{
    const fee=Number(v.vendor_shipping_fee);
    return sum+Math.max(0,Number.isFinite(fee)?fee:130);
  },0);
  const resolvedShipping=(Number.isFinite(storedShipping)&&storedShipping>0)?storedShipping:(vendorShipping>0?vendorShipping:0);
  if(resolvedShipping!==storedShipping){
    const subtotal=Number(o.subtotal||0);
    const discounts=Number(o.referral_discount||0)+Number(o.rewards_voucher_discount||0)+Number(o.mystery_discount||0);
    o.shipping_charge=resolvedShipping;
    o.total=Math.max(0,subtotal+resolvedShipping-discounts);
  }
  const statuses=vs.map(v=>String(v.status||'New'));let canonical=o.status||'New';if(statuses.length){if(statuses.every(s=>s==='Delivered'))canonical='Delivered';else if(statuses.every(s=>s==='Cancelled'))canonical='Cancelled';else if(statuses.every(s=>s==='Shipped'))canonical='Shipped';else if(statuses.every(s=>s==='Processing'))canonical='Processing';else if(statuses.every(s=>s==='Confirmed'))canonical='Confirmed';else if(statuses.every(s=>s==='Contacting'))canonical='Contacting';else if(statuses.some(s=>s==='Shipped'))canonical='Shipped';else if(statuses.some(s=>s==='Processing'))canonical='Processing';else if(statuses.some(s=>s==='Confirmed'))canonical='Confirmed';else if(statuses.some(s=>s==='Contacting'))canonical='Contacting';}return json({order:{...o,order_number:o.order_number,tracking_id:o.public_tracking_id,status:canonical},vendors:vs})}
async function handle(req,e){try{if(req.method==='OPTIONS')return gzPreflight(req,e);const r=await api(req,e);if(r)return gzApplyCors(r,req,e);return legacy.fetch(req,e)}catch(err){console.error(err);return gzApplyCors(json({error:err.message||'Internal server error'},500),req,e)}}
export default {fetch:handle};