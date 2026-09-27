import googleOAuth from './google-oauth.mjs';
import legacyApiBridge from './legacy-api-bridge.mjs';
import legacyWorker from './worker.mjs';
import app from './admin-vendor-capabilities-wrapper.mjs';
import vendorFinalizer from './vendor-system-finalizer.mjs';
import vendorV2 from './vendor-system-v2.mjs';
import vendorGenerator from './vendor-system-generator.mjs';
import vendorStore from './vendor-store-v2.mjs';
import adminVariations from './marketplace-admin-variations.mjs';
import marketplaceComplete from './vendor-marketplace-complete.mjs';
const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, must-revalidate',...h}});const now=()=>new Date().toISOString();function cookie(req,n){for(const p of(req.headers.get('Cookie')||'').split(';')){const a=p.trim().split('=');if(a[0]===n)return decodeURIComponent(a.slice(1).join('='))}return ''}async function sha(v){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v))))].map(x=>x.toString(16).padStart(2,'0')).join('')}async function one(e,s,p=[]){return(await e.DB.prepare(s).bind(...p).all()).results?.[0]||null}async function admin(req,e){const t=cookie(req,'gz_admin_session');return t?one(e,"SELECT u.id,u.email FROM admin_sessions s JOIN admin_users u ON u.id=s.admin_user_id WHERE s.token_hash=? AND s.expires_at>?",[await sha(t),now()]):null}async function vendor(req,e){const t=cookie(req,'gz_vendor_session');return t?one(e,"SELECT vu.id,vu.vendor_id,vu.email,v.slug,v.brand_name FROM vendor_sessions s JOIN vendor_users vu ON vu.id=s.vendor_user_id JOIN vendors v ON v.id=vu.vendor_id WHERE s.token_hash=? AND s.expires_at>? AND vu.status='Active' AND v.status='Active'",[await sha(t),now()]):null}
async function publicVariations(req,e){
 const u=new URL(req.url);
 if(u.pathname!=='/api/marketplace/variations'||req.method!=='GET')return null;
 const pid=String(u.searchParams.get('product_id')||'').trim();
 if(!pid)return json({error:'product_id is required.'},400);
 try{
  // Read existing tables with SELECT * so older D1 schemas do not cause a 500
  // merely because one legacy column is missing.
  await e.DB.prepare(`CREATE TABLE IF NOT EXISTS product_options(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,name TEXT NOT NULL,sort_order INTEGER DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`).run().catch(()=>{});
  await e.DB.prepare(`CREATE TABLE IF NOT EXISTS option_values(id TEXT PRIMARY KEY,option_id TEXT NOT NULL,value TEXT NOT NULL,sort_order INTEGER DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`).run().catch(()=>{});
  await e.DB.prepare(`CREATE TABLE IF NOT EXISTS product_variations(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,options TEXT,sku TEXT,regular_price REAL NOT NULL DEFAULT 0,sale_price REAL,old_price REAL,stock INTEGER NOT NULL DEFAULT 0,stock_mode TEXT NOT NULL DEFAULT 'untracked',low_stock_threshold INTEGER NOT NULL DEFAULT 0,image_url TEXT,status TEXT NOT NULL DEFAULT 'Available',min_qty INTEGER NOT NULL DEFAULT 1,max_qty INTEGER,options_key TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`).run().catch(()=>{});
  await e.DB.prepare(`CREATE TABLE IF NOT EXISTS variation_options(variation_id TEXT NOT NULL,option_id TEXT NOT NULL,option_value_id TEXT NOT NULL,PRIMARY KEY(variation_id,option_id))`).run().catch(()=>{});
  await e.DB.prepare(`CREATE TABLE IF NOT EXISTS variation_images(id TEXT PRIMARY KEY,variation_id TEXT NOT NULL,image_url TEXT NOT NULL,sort_order INTEGER DEFAULT 0,created_at TEXT NOT NULL)`).run().catch(()=>{});

  const product=await one(e,'SELECT * FROM products WHERE id=? LIMIT 1',[pid]);
  if(!product)return json({error:'Product not found.'},404);
  if(Number(product.published??1)!==1)return json({error:'Product not found.'},404);
  try {
   await e.DB.prepare('CREATE TABLE IF NOT EXISTS product_images(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,image_url TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,is_main INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)').run().catch(()=>{});
   const imageRows=(await e.DB.prepare('SELECT image_url FROM product_images WHERE product_id=? ORDER BY sort_order,id').bind(pid).all()).results||[];
   await e.DB.prepare('CREATE TABLE IF NOT EXISTS vendor_product_images(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,vendor_id TEXT NOT NULL,image_url TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)').run().catch(()=>{});
   const vendorImageRows=(await e.DB.prepare('SELECT image_url FROM vendor_product_images WHERE product_id=? ORDER BY sort_order,id').bind(pid).all()).results||[];
   const dbUrls=[...imageRows,...vendorImageRows].map(x=>String(x.image_url||'').trim()).filter(Boolean);
   let storedUrls=[];
   const rawStored=product.image_urls;
   if(Array.isArray(rawStored)) storedUrls=rawStored.map(x=>String(x||'').trim()).filter(Boolean);
   else if(typeof rawStored==='string'){try{const parsed=JSON.parse(rawStored);if(Array.isArray(parsed))storedUrls=parsed.map(x=>String(x||'').trim()).filter(Boolean)}catch{}}
   const all=[...dbUrls,...storedUrls,String(product.image_url||'').trim()].filter(Boolean);
   product.image_urls=[...new Set(all)].slice(0,10);
  } catch {
   product.image_urls=String(product.image_url||'').trim()?[String(product.image_url).trim()]:[];
  }

  const options=(await e.DB.prepare('SELECT * FROM product_options WHERE product_id=?').bind(pid).all()).results||[];
  options.sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.id||'').localeCompare(String(b.id||'')));
  for(const o of options){
   o.values=(await e.DB.prepare('SELECT * FROM option_values WHERE option_id=?').bind(o.id).all()).results||[];
   o.values.sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.id||'').localeCompare(String(b.id||'')));
  }

  const rawVariations=(await e.DB.prepare('SELECT * FROM product_variations WHERE product_id=?').bind(pid).all()).results||[];
  const variations=[];
  for(const v of rawVariations){
   if(String(v.status||'Available').toLowerCase()==='disabled')continue;
   v.status=v.status||'Available';
   const legacyOptions=v.options;
   v.options={};

   // Primary source: normalized variation_options rows.
   try{
    const rows=(await e.DB.prepare('SELECT vo.option_id,vo.option_value_id,po.name,ov.value FROM variation_options vo LEFT JOIN product_options po ON po.id=vo.option_id LEFT JOIN option_values ov ON ov.id=vo.option_value_id WHERE vo.variation_id=?').bind(v.id).all()).results||[];
    for(const x of rows)if(x.name&&x.value)v.options[x.name]=x.value;
   }catch{}

   // Legacy source: JSON options stored directly on the variation.
   if(!Object.keys(v.options).length&&legacyOptions){
    try{
     const parsed=typeof legacyOptions==='string'?JSON.parse(legacyOptions):legacyOptions;
     if(parsed&&typeof parsed==='object')for(const [k,val] of Object.entries(parsed))if(String(k).trim()&&String(val).trim())v.options[String(k).trim()]=String(val).trim();
    }catch{}
   }

   // Last source: the generated options_key.
   if(!Object.keys(v.options).length&&v.options_key){
    for(const pair of String(v.options_key).split('|')){
     const n=pair.indexOf('=');
     if(n>0)v.options[pair.slice(0,n)]=pair.slice(n+1);
    }
   }

   try{
    v.images=(await e.DB.prepare('SELECT image_url FROM variation_images WHERE variation_id=? ORDER BY sort_order,id').bind(v.id).all()).results?.map(x=>x.image_url).filter(Boolean)||[];
   }catch{v.images=[]}
   if(!v.image_url&&v.images?.[0])v.image_url=v.images[0];
   variations.push(v);
  }

  return json({product,enabled:options.length>0||variations.length>0,options,variations});
 }catch(err){
  console.error('Public marketplace variations failed',err);
  return json({error:'Variations could not be loaded.',detail:String(err?.message||err)},500);
 }
}
async function shippingSettings(req,e){
 const p=new URL(req.url).pathname;
 if(p!=='/api/marketplace/shipping-settings')return null;
 await e.DB.prepare("ALTER TABLE site_settings ADD COLUMN global_shipping_fee REAL NOT NULL DEFAULT 130").run().catch(()=>{});
 await e.DB.prepare("INSERT OR IGNORE INTO site_settings(id,global_shipping_fee) VALUES(1,130)").run().catch(()=>{});
 if(req.method==='GET'){
  const row=(await e.DB.prepare("SELECT global_shipping_fee FROM site_settings WHERE id=1 LIMIT 1").all()).results?.[0];
  const fee=Number(row?.global_shipping_fee);
  return json({ok:true,global_shipping_fee:Number.isFinite(fee)&&fee>=0?fee:130});
 }
 if(req.method!=='PATCH')return json({error:'Method not allowed.'},405);
 if(!await admin(req,e))return json({error:'Unauthorized'},401);
 const b=await req.json().catch(()=>({})),fee=Number(b.global_shipping_fee);
 if(!Number.isFinite(fee)||fee<0||fee>100000)return json({error:'Enter a valid shipping fee.'},400);
 await e.DB.prepare("UPDATE site_settings SET global_shipping_fee=?,updated_at=? WHERE id=1").bind(fee,now()).run();
 return json({ok:true,global_shipping_fee:fee});
}
async function upload(req,e){if(new URL(req.url).pathname!=='/api/vendor/upload'||req.method!=='POST')return null;const f=await req.formData().catch(()=>null),file=f?.get('file');if(!(file instanceof File))return json({error:'Image file is required.'},400);const a=await admin(req,e),u=a?null:await vendor(req,e);if(!a&&!u)return json({error:'Vendor not found or unauthorized.'},401);const vendorId=a?String(f.get('vendor_id')||''):u.vendor_id;if(!vendorId)return json({error:'Vendor not found or unauthorized.'},401);const v=await one(e,'SELECT id FROM vendors WHERE id=? OR slug=?',[vendorId,vendorId]);if(!v)return json({error:'Vendor not found.'},404);const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif'},type=String(file.type||'').toLowerCase();if(!types[type])return json({error:'Only JPG, PNG, WEBP, GIF or AVIF images are allowed.'},415);if(file.size>10*1024*1024)return json({error:'Maximum image size is 10 MB.'},413);if(!e.ASSETS_BUCKET)return json({error:'R2 image storage is not configured.'},500);const kind=String(f.get('kind')||'image').replace(/[^a-z0-9_-]/gi,'').toLowerCase()||'image',key=`vendors/${v.id}/${kind}-${crypto.randomUUID()}.${types[type]}`;await e.ASSETS_BUCKET.put(key,file.stream(),{httpMetadata:{contentType:type,cacheControl:'public,max-age=31536000,immutable'},customMetadata:{vendor_id:v.id,uploaded_by:a?'admin':'vendor'}});return json({ok:true,url:'/api/vendor/media/'+encodeURIComponent(key),key})}async function marketplaceMedia(req,e){const pre='/api/marketplace/media/',p=new URL(req.url).pathname;if(!p.startsWith(pre)||req.method!=='GET')return null;const key=decodeURIComponent(p.slice(pre.length));if(!key||key.includes('..'))return new Response('Not found',{status:404});const o=await e.ASSETS_BUCKET?.get(key);if(!o)return new Response('Not found',{status:404});const h=new Headers();o.writeHttpMetadata(h);h.set('Cache-Control','public,max-age=31536000,immutable');return new Response(o.body,{headers:h})}
async function media(req,e){const pre='/api/vendor/media/',p=new URL(req.url).pathname;if(!p.startsWith(pre)||req.method!=='GET')return null;const key=decodeURIComponent(p.slice(pre.length));if(!key.startsWith('vendors/')||key.includes('..'))return new Response('Not found',{status:404});const o=await e.ASSETS_BUCKET?.get(key);if(!o)return new Response('Not found',{status:404});const h=new Headers();o.writeHttpMetadata(h);h.set('Cache-Control','public,max-age=31536000,immutable');return new Response(o.body,{headers:h})}
const UPLOAD_UI=`<script data-gz-upload-ui>(()=>{if(window.__gzUploadUI)return;window.__gzUploadUI=1;const q=s=>document.querySelector(s);async function upload(input,kind,vendor){const f=input.files?.[0];if(!f)return '';const fd=new FormData();fd.append('file',f);fd.append('kind',kind);if(vendor)fd.append('vendor_id',vendor);const r=await fetch('/api/vendor/upload',{method:'POST',credentials:'include',body:fd});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Upload failed');return d.url}function add(field,label,kind,vendor){if(!field||field.parentElement.querySelector('[data-gz-pick="'+kind+'"]'))return null;const w=document.createElement('div');w.setAttribute('data-gz-pick',kind);w.style='margin-top:8px';w.innerHTML='<label style="display:block;font-size:11px;font-weight:800;color:#666;margin-bottom:5px">'+label+' from PC</label><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:10px;background:#fff">';field.parentElement.appendChild(w);return w.querySelector('input')}async function setup(){const path=location.pathname,v=new URLSearchParams(location.search).get('vendor')||'';if(path.includes('marketplace-vendor-control-v2')){const l=q('#logoUrl'),b=q('#bannerUrl'),p=q('#productImage');if(l&&p){const li=add(l,'Logo','vendor-logo',v),bi=add(b,'Banner','vendor-banner',v),pi=add(p,'Product image','product-image',v);const pf=q('#profileForm'),pr=q('#productForm');if(pf&&!pf.__gz){pf.__gz=1;const old=pf.onsubmit;pf.onsubmit=async e=>{e.preventDefault();try{if(li?.files?.length)l.value=await upload(li,'vendor-logo',v);if(bi?.files?.length)b.value=await upload(bi,'vendor-banner',v);if(typeof old==='function')return old.call(pf,e)}catch(x){alert(x.message)}}}if(pr&&!pr.__gz){pr.__gz=1;const old=pr.onsubmit;pr.onsubmit=async e=>{e.preventDefault();try{if(pi?.files?.length)p.value=await upload(pi,'product-image',v);if(typeof old==='function')return old.call(pr,e)}catch(x){alert(x.message)}}}}}else if(path==='/vendor-dashboard.html'){const l=q('#v_logo_url'),b=q('#v_banner_url'),p=q('#p_image_url');if(l&&p){const li=add(l,'Logo','vendor-logo',''),bi=add(b,'Banner','vendor-banner',''),pi=add(p,'Product image','product-image',''),pf=q('#profileForm'),pr=q('#productForm');if(pf&&!pf.__gz){pf.__gz=1;const old=pf.onsubmit;pf.onsubmit=async e=>{e.preventDefault();try{if(li?.files?.length)l.value=await upload(li,'vendor-logo','');if(bi?.files?.length)b.value=await upload(bi,'vendor-banner','');if(typeof old==='function')return old.call(pf,e)}catch(x){alert(x.message)}}}if(pr&&!pr.__gz){pr.__gz=1;const old=pr.onsubmit;pr.onsubmit=async e=>{e.preventDefault();try{if(pi?.files?.length)p.value=await upload(pi,'product-image','');if(typeof old==='function')return old.call(pr,e)}catch(x){alert(x.message)}}}}}else if(path==='/vendor-admin.html'){const l=q('#logo_url'),b=q('#banner_url'),f=q('#form');if(l&&b&&f&&!f.__gz){f.__gz=1;const li=add(l,'Logo','vendor-logo',''),bi=add(b,'Banner','vendor-banner',''),old=f.onsubmit;f.onsubmit=async e=>{e.preventDefault();try{if(li?.files?.length)l.value=await upload(li,'vendor-logo','');if(bi?.files?.length)b.value=await upload(bi,'vendor-banner','');if(typeof old==='function')return old.call(f,e)}catch(x){alert(x.message)}}}}}let n=0;const t=setInterval(()=>{setup();if(++n>80)clearInterval(t)},150)})();</script>`;
const V2UI='<link rel="stylesheet" href="/vendor-system-v2.css?v=20260916-v5"><link rel="stylesheet" href="/vendor-system-dashboard.css?v=20260916-v5"><script defer src="/vendor-system-v2-ui.js?v=20260920-v26" data-grabzone-vendor-v2-ui></script><script defer src="/vendor-system-dashboard-ui.js?v=20260916-v4" data-grabzone-vendor-dashboard-ui></script><script defer src="/vendor-system-final-ui.js?v=20260916-v3" data-grabzone-vendor-final-ui></script><script defer src="/vendor-cart-variation-fix.js?v=20260916-v3" data-grabzone-cart-variation-fix></script><script defer src="/vendor-checkout-variation-bridge.js?v=20260916-v3" data-grabzone-checkout-variation-bridge></script>';
const ADMIN_VAR_UI='<script src="/marketplace-admin-variations-ui.js?v=20260919-v5" data-grabzone-admin-variations-ui></script>';
const LOADER='<script src="/grabzone-global-loader.js?v=20260916-notice11" data-grabzone-global-loader></script>',CART='<script src="/grabzone-cart-quantity-bridge.js" data-grabzone-cart-bridge></script>',MKT='<script defer src="/marketplace-reference-ui.js?v=20260911-final3" data-grabzone-marketplace-reference-ui></script>',HOME='<link rel="stylesheet" href="/marketplace-home-brand-premium.css?v=20260911-ref1"><script src="/grabzone-home-reference-marketplace.js?v=20260915-fullwidth3" data-grabzone-home-reference-marketplace></script><script src="/grabzone-home-layout-finalizer.js?v=20260912-final1" data-grabzone-home-layout-finalizer></script><script src="/grabzone-notice-sync.js?v=20260916-notice12" data-grabzone-notice-sync></script>',RESP='<link rel="stylesheet" href="/grabzone-site-responsive.css?v=20260912-final2" data-grabzone-final-visual-fix>';
async function inject(r,req){if(!r.ok)return r;const type=r.headers.get('content-type')||'';if(!type.includes('text/html'))return r;let b=await r.text();const p=new URL(req.url).pathname,s=[];if(!b.includes('data-grabzone-global-loader'))s.push(LOADER);if(p==='/checkout.html'&&!b.includes('data-grabzone-cart-bridge'))s.push(CART);if((p==='/marketplace'||p==='/marketplace.html')&&!b.includes('data-grabzone-marketplace-reference-ui'))s.push(MKT);if(p==='/'||p==='/index.html')s.push(HOME);if(/^\/(admin|vendor-admin|marketplace-admin-orders|marketplace-vendor-control-v2|vendor-dashboard)(?:\.html)?$/i.test(p))s.push(UPLOAD_UI);if(/^\/(vendor-dashboard|vendor-admin|marketplace-vendor-control-v2|product|checkout)(?:\.html)?$/i.test(p))s.push(V2UI);if(p==='/marketplace-vendor-control-v2'||p==='/marketplace-vendor-control-v2.html')s.push(ADMIN_VAR_UI);else s.push(RESP);const out=/<head[^>]*>/i.test(b)?b.replace(/<head[^>]*>/i,m=>m+'\n'+s.join('\n')):s.join('\n')+b;const h=new Headers(r.headers);h.set('Cache-Control','no-store,must-revalidate');h.delete('Content-Length');return new Response(out,{status:r.status,statusText:r.statusText,headers:h})}
export default{async fetch(req,env,ctx){try{const p=new URL(req.url).pathname;
/*
  Never serve backend source, config or migration files as static assets.
  Defence in depth on top of .assetsignore, which keeps them out of the asset
  upload in the first place. No page loads these paths at runtime.
*/
if(req.method==='GET'||req.method==='HEAD'){
  if(/\.(?:mjs|jsonc|sql|md)$/i.test(p)||/^\/(?:\.assetsignore|\.env(?:\.|$)|wrangler[^/]*\.jsonc|package(?:-lock)?\.json)$/i.test(p)){
    return new Response('Not found',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }
}
const go=await googleOAuth(req,env);if(go)return go;let legacy=null;
if(!(p==='/api/d1'&&req.method==='POST')){
  legacy=await legacyApiBridge(req,env,ctx,(r)=>null);
  if(legacy)return legacy;
}else{
  const probe=await req.clone().json().catch(()=>null);
  if(probe?.fn!=='create_public_order'){
    legacy=await legacyApiBridge(req,env,ctx,(r)=>null);
    if(legacy)return legacy;
  }
}if(p==='/api/marketplace/notices'&&req.method==='GET'){const [rows,settings]=await Promise.all([env.DB.prepare('SELECT id,title,message,active,sort_order,created_at FROM notices WHERE active=1 ORDER BY sort_order ASC,created_at ASC').all(),env.DB.prepare('SELECT show_notice FROM site_settings WHERE id=1 LIMIT 1').all()]);const show=Number(settings.results?.[0]?.show_notice??1)!==0;return json({show_notice:show,notices:show?(rows.results||[]):[]})}if(p==='/api/marketplace/brands'&&req.method==='GET'){const rows=(await env.DB.prepare("SELECT id,slug,brand_name,business_name,logo_url,banner_url,description,featured FROM vendors WHERE LOWER(COALESCE(status,'Active'))='active' AND COALESCE(homepage_visible,1)=1 ORDER BY featured DESC,COALESCE(brand_name,business_name,slug) COLLATE NOCASE").all()).results||[];return json({brands:rows.map(v=>({...v,brand_name:v.brand_name||v.business_name||v.slug}))})}const pv=await publicVariations(req,env);if(pv)return pv;const ss=await shippingSettings(req,env);if(ss)return ss;const mm=await media(req,env);if(mm)return mm;const mktm=await marketplaceMedia(req,env);if(mktm)return mktm;const up=await upload(req,env);if(up)return up;const probeOrderEarly=req.method==='POST'&&new URL(req.url).pathname==='/api/d1'?await req.clone().json().catch(()=>null):null;const pathEarly=new URL(req.url).pathname;const adminVariationRoute=pathEarly==='/api/marketplace/admin/variations'||pathEarly.startsWith('/api/marketplace/admin/variations/');if(adminVariationRoute){const avEarly=await adminVariations.fetch(req,env,ctx,(r)=>vendorFinalizer.fetch(r,env,ctx,(x)=>vendorGenerator.fetch(x,env,ctx,(y)=>vendorV2.fetch(y,env,ctx,(z)=>legacyWorker.fetch(z,env,ctx)))));if(avEarly)return avEarly}const directVariation=/^\/api\/vendor\/variations(?:\/[^/]+)?$/.test(pathEarly)||/^\/api\/vendor\/variation(?:\/[^/]+)?$/.test(pathEarly)||/^\/api\/vendor\/variation_[^/]+$/.test(pathEarly);if(directVariation)return vendorV2.fetch(req,env,ctx,(x)=>legacyWorker.fetch(x,env,ctx));const marketplace=probeOrderEarly?.fn==='create_public_order'?null:await marketplaceComplete.fetch(req,env,ctx);if(marketplace)return marketplace;const terminal=(r)=>legacyWorker.fetch(r,env,ctx);const probeOrder=req.method==='POST'&&new URL(req.url).pathname==='/api/d1'?await req.clone().json().catch(()=>null):null;if(probeOrder?.fn==='create_public_order'){return legacyWorker.fetch(req,env,ctx)}const av=await adminVariations.fetch(req,env,ctx,(r)=>vendorFinalizer.fetch(r,env,ctx,(x)=>vendorGenerator.fetch(x,env,ctx,(y)=>vendorV2.fetch(y,env,ctx,terminal))));if(av)return av;const fin=await vendorFinalizer.fetch(req,env,ctx,(r)=>vendorGenerator.fetch(r,env,ctx,(x)=>vendorV2.fetch(x,env,ctx,terminal)));if(fin)return fin;const store=await vendorStore.fetch(req,env,ctx,(r)=>app.fetch(r,env,ctx));if(store)return store;const gen=await vendorGenerator.fetch(req,env,ctx,(r)=>vendorV2.fetch(r,env,ctx,(x)=>app.fetch(x,env,ctx)));if(gen)return gen;const v2=await vendorV2.fetch(req,env,ctx,(r)=>app.fetch(r,env,ctx));if(v2)return v2;const r=await app.fetch(req,env,ctx);
/*
  Branded 404: when the runtime reaches this point for a missing page, serve
  404.html instead of the host's default error page. Requests that Cloudflare
  answers straight from the asset binding (paths outside run_worker_first)
  never reach the Worker; see the PR for the one-line wrangler.jsonc change
  that covers those too. That config change needs your approval to deploy.
*/
if(r&&r.status===404&&(req.method==='GET'||req.method==='HEAD')&&env.ASSETS){
  const wantsHtml=(req.headers.get('Accept')||'').includes('text/html')||!/\.[a-z0-9]{2,5}$/i.test(p);
  if(wantsHtml){
    try{
      const notFound=await env.ASSETS.fetch(new Request(new URL('/404.html',req.url).toString(),{headers:req.headers}));
      if(notFound&&notFound.ok){
        const h=new Headers(notFound.headers);h.delete('Content-Length');
        return new Response(notFound.body,{status:404,headers:h});
      }
    }catch(err){console.error('404 page fallback failed',err)}
  }
}
return inject(r,req)}catch(e){return json({error:e?.message||'Marketplace runtime failed'},500)}}};