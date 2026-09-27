/**
 * Vendor "new order" notifications.
 *
 * One notification per order+vendor pair, claimed in the database so two
 * concurrent requests cannot both send it.
 *
 * How the claim works (all compare-and-set, using D1's meta.changes):
 *   1. INSERT OR IGNORE a row with status='sending' and a fresh claim_token.
 *      1 row changed  -> this request owns the claim and may send.
 *      0 rows changed -> the pair is already recorded; read it and decide:
 *                        'sent'                   -> stop (already delivered)
 *                        'sending' + fresh lease  -> stop (another request is sending)
 *                        'sending' + stale lease  -> take over with a conditional UPDATE
 *                        'failed' / 'skipped'     -> take over with a conditional UPDATE
 *   2. Send.
 *   3. Write the result with `WHERE notification_key=? AND claim_token=?`, so a
 *      request whose lease was taken over cannot overwrite the newer result.
 *
 * Guarantee, stated precisely: at most one *successful* notification per pair, and
 * concurrent duplicates are impossible. This is not exactly-once delivery — if the
 * process dies after the provider accepted the message but before the log write,
 * the row stays 'sending' and a later request may take over after the lease expires
 * and send one more copy. That window is reported, not hidden.
 *
 * Every function returns a result object and never throws: a mail or database
 * problem must never break an order.
 */
import { sendVendorOrderEmail } from './grabzone-email.mjs';

const TABLE='vendor_order_notifications';
const TERMINAL=new Set(['cancelled','canceled','failed','returned','refunded','incomplete','abandoned']);
/** How long a claim is honoured before another request may take it over. */
export const CLAIM_LEASE_MS=15*60*1000;

const CREATE_TABLE=`CREATE TABLE IF NOT EXISTS ${TABLE}(`
  +'notification_key TEXT PRIMARY KEY,'
  +'order_id TEXT NOT NULL,'
  +'vendor_id TEXT NOT NULL,'
  +'vendor_order_id TEXT,'
  +'recipient TEXT,'
  +'status TEXT NOT NULL,'
  +'attempts INTEGER NOT NULL DEFAULT 0,'
  +'provider TEXT,'
  +'provider_status INTEGER,'
  +'provider_message_id TEXT,'
  +'error TEXT,'
  +'claim_token TEXT,'
  +'claimed_at TEXT,'
  +'sent_at TEXT,'
  +'created_at TEXT NOT NULL,'
  +'updated_at TEXT NOT NULL)';
const CREATE_INDEX_ORDER=`CREATE INDEX IF NOT EXISTS idx_vendor_order_notifications_order ON ${TABLE}(order_id, vendor_id)`;
const CREATE_INDEX_STATE=`CREATE INDEX IF NOT EXISTS idx_vendor_order_notifications_state ON ${TABLE}(status, claimed_at)`;
/** Columns added after the first revision of this table, for databases that already have it. */
const ADD_COLUMNS=[
  'ALTER TABLE '+TABLE+' ADD COLUMN claim_token TEXT',
  'ALTER TABLE '+TABLE+' ADD COLUMN claimed_at TEXT',
  'ALTER TABLE '+TABLE+' ADD COLUMN sent_at TEXT',
];
const REQUIRED_COLUMNS=['notification_key','order_id','vendor_id','status','attempts','provider','provider_status','provider_message_id','error','claim_token','claimed_at','sent_at','created_at','updated_at'];

/**
 * Verified environments. Keyed by the env object so a different binding (or a
 * test) can never inherit another database's verification, and so a transient
 * failure is retried on the next request instead of being cached as "fine".
 */
const verified=new WeakSet();

/**
 * Create and then VERIFY the notification table.
 * Returns {ok:true} or {ok:false,error}. When it is not ok the caller must not
 * send, because without a working claim a duplicate cannot be prevented.
 */
export async function ensureNotificationStore(env){
  if(verified.has(env))return {ok:true};
  try{
    await env.DB.prepare(CREATE_TABLE).run();
    await env.DB.prepare(CREATE_INDEX_ORDER).run().catch(()=>{});
    await env.DB.prepare(CREATE_INDEX_STATE).run().catch(()=>{});
    for(const sql of ADD_COLUMNS)await env.DB.prepare(sql).run().catch(()=>{});
    const info=await env.DB.prepare(`PRAGMA table_info(${TABLE})`).all();
    const names=new Set((info?.results||[]).map(r=>String(r.name)));
    const missing=REQUIRED_COLUMNS.filter(c=>!names.has(c));
    if(!names.size||missing.length){
      return {ok:false,error:`${TABLE} is not ready (missing: ${missing.join(', ')||'table'})`};
    }
    verified.add(env);
    return {ok:true};
  }catch(err){
    return {ok:false,error:String(err?.message||err)};
  }
}

export function notificationKey(orderId,vendorId){return `${String(orderId||"").trim()}|${String(vendorId||"").trim()}`}

export function isTerminalOrderStatus(status){
  return TERMINAL.has(String(status||"").trim().toLowerCase());
}

/** Where the vendor signs in to see the order. No token is ever put in the link. */
export function vendorPanelUrl(env){
  const base=String((env&&(env.VENDOR_PANEL_URL||env.PUBLIC_SITE_URL))||"https://grabzone.tech").replace(/\/+$/,"");
  return `${base}/vendor-dashboard#orders`;
}

async function readRow(env,key){
  const r=await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE notification_key=? LIMIT 1`).bind(key).all();
  return r?.results?.[0]||null;
}

/** First attempt for this pair: the inserted row itself is the lock. */
async function tryInsertClaim(env,{key,orderId,vendorId,vendorOrderId,recipient,token,nowIso}){
  const r=await env.DB.prepare(`INSERT OR IGNORE INTO ${TABLE}`
    +'(notification_key,order_id,vendor_id,vendor_order_id,recipient,status,attempts,claim_token,claimed_at,created_at,updated_at)'
    +" VALUES(?,?,?,?,?,'sending',1,?,?,?,?)")
    .bind(key,orderId,vendorId,vendorOrderId||null,recipient||null,token,nowIso,nowIso,nowIso).run();
  return Number(r?.meta?.changes||0)===1;
}

/** Take over a stale 'sending' claim (the previous request died mid-flight). */
async function stealExpiredClaim(env,{key,recipient,vendorOrderId,token,nowIso,leaseMs}){
  const staleBefore=new Date(Date.now()-leaseMs).toISOString();
  const r=await env.DB.prepare(`UPDATE ${TABLE}`
    +" SET status='sending',recipient=?,vendor_order_id=?,claim_token=?,claimed_at=?,attempts=attempts+1,error=NULL,updated_at=?"
    +" WHERE notification_key=? AND status='sending' AND (claimed_at IS NULL OR claimed_at<?)")
    .bind(recipient||null,vendorOrderId||null,token,nowIso,nowIso,key,staleBefore).run();
  return Number(r?.meta?.changes||0)===1;
}

/** Take over a failed or previously skipped notification (retry). */
async function retakeFailedClaim(env,{key,recipient,vendorOrderId,token,nowIso}){
  const r=await env.DB.prepare(`UPDATE ${TABLE}`
    +" SET status='sending',recipient=?,vendor_order_id=?,claim_token=?,claimed_at=?,attempts=attempts+1,error=NULL,updated_at=?"
    +" WHERE notification_key=? AND status IN ('failed','skipped','pending')")
    .bind(recipient||null,vendorOrderId||null,token,nowIso,nowIso,key).run();
  return Number(r?.meta?.changes||0)===1;
}

async function finalize(env,{key,token,status,provider,providerStatus,providerMessageId,error,nowIso}){
  const sql=`UPDATE ${TABLE} SET status=?,provider=?,provider_status=?,provider_message_id=?,error=?,sent_at=CASE WHEN ?='sent' THEN ? ELSE sent_at END,updated_at=? WHERE notification_key=? AND claim_token=?`;
  const r=await env.DB.prepare(sql)
    .bind(status,provider||null,providerStatus??null,providerMessageId||null,error?String(error).slice(0,500):null,status,nowIso,nowIso,key,token).run();
  return Number(r?.meta?.changes||0)===1;
}

async function logSkipped(env,{key,orderId,vendorId,recipient,reason,nowIso}){
  const ins=await env.DB.prepare(`INSERT OR IGNORE INTO ${TABLE}`
    +'(notification_key,order_id,vendor_id,recipient,status,attempts,error,created_at,updated_at)'
    +" VALUES(?,?,?,?,'skipped',0,?,?,?)")
    .bind(key,orderId,vendorId,recipient||null,String(reason).slice(0,300),nowIso,nowIso).run();
  if(Number(ins?.meta?.changes||0)===1)return;
  await env.DB.prepare(`UPDATE ${TABLE} SET status='skipped',error=?,updated_at=? WHERE notification_key=? AND status<>'sent'`)
    .bind(String(reason).slice(0,300),nowIso,key).run().catch(()=>{});
}

/**
 * Notify one vendor about one order. Never throws.
 * Returns {sent, status, reason?, provider?, duplicate?, warning?}.
 */
export async function notifyVendorOrder(env,{
  orderId,orderNumber,placedAt,orderStatus,vendorId,vendorName,recipient,vendorOrderId,items,subtotal,shipping,total,customerName,panelUrl,leaseMs=CLAIM_LEASE_MS
}={}){
  const key=notificationKey(orderId,vendorId);
  const nowIso=new Date().toISOString();
  const token=(globalThis.crypto?.randomUUID?.()||String(Math.random())).replace(/-/g,"");
  try{
    if(!orderId||!vendorId)return {sent:false,status:"skipped",reason:"missing-identifiers"};
    if(isTerminalOrderStatus(orderStatus))return {sent:false,status:"skipped",reason:"order-not-active"};

    // The store must be usable before anything is sent: without a working claim a
    // duplicate cannot be prevented, so this fails closed instead of sending blind.
    const store=await ensureNotificationStore(env);
    if(!store.ok){
      console.error("Vendor order notification blocked: notification store unavailable -",store.error);
      return {sent:false,status:"blocked",reason:"notification-store-unavailable",error:store.error};
    }

    const to=String(recipient||"").trim();
    if(!to||!to.includes("@")){
      await logSkipped(env,{key,orderId,vendorId,recipient:to,reason:"vendor email address missing",nowIso}).catch(()=>{});
      return {sent:false,status:"skipped",reason:"no-recipient"};
    }

    const base={key,orderId:String(orderId),vendorId:String(vendorId),vendorOrderId:vendorOrderId||null,recipient:to,token,nowIso};
    let owned=await tryInsertClaim(env,base);
    if(!owned){
      const row=await readRow(env,key);
      if(!row)return {sent:false,status:"failed",reason:"claim-row-unreadable"};
      if(String(row.status)==="sent")return {sent:false,status:"duplicate",reason:"already-notified"};
      if(String(row.status)==="sending"){
        owned=await stealExpiredClaim(env,{...base,leaseMs});
        if(!owned)return {sent:false,status:"duplicate",reason:"send-in-progress"};
      }else{
        owned=await retakeFailedClaim(env,base);
        if(!owned)return {sent:false,status:"duplicate",reason:"claim-lost"};
      }
    }

    const result=await sendVendorOrderEmail(env,{
      to,vendorName,orderNumber,placedAt,orderStatus,items,subtotal,shipping,total,customerName,
      panelUrl:panelUrl||vendorPanelUrl(env),
    });

    if(result?.ok){
      const chain=Array.isArray(result.attempts)?result.attempts.map(a=>`${a.provider}:${a.outcome}`).join(","):null;
      const note=result.fallbackFrom?`fallback from ${result.fallbackFrom} (${chain})`:null;
      let logged=false;
      try{
        logged=await finalize(env,{key,token,status:"sent",provider:result.provider||null,providerStatus:result.status??null,providerMessageId:result.id||null,error:note,nowIso});
      }catch(err){
        console.error("Vendor order notification: could not write the delivery log",key,err);
      }
      if(!logged){
        // One retry of the log write, then report the window honestly: the mail is
        // out but not recorded, so a later retry could send it a second time.
        try{
          logged=await finalize(env,{key,token,status:"sent",provider:result.provider||null,providerStatus:result.status??null,providerMessageId:result.id||null,error:null,nowIso});
        }catch{}
      }
      if(!logged){
        console.error("Vendor order notification delivered but NOT recorded",key,"- a retry could duplicate it");
        return {sent:true,status:"sent-unlogged",provider:result.provider||null,warning:"delivery log write failed"};
      }
      return {sent:true,status:"sent",provider:result.provider||null};
    }

    const chain=Array.isArray(result?.attempts)?result.attempts.map(a=>`${a.provider}:${a.outcome}`).join(","):null;
    const reason=result?.skipped||result?.error||"send-failed";
    const note=chain?`${chain} — ${reason}`:reason;
    try{
      await finalize(env,{key,token,status:"failed",provider:result?.provider||null,providerStatus:result?.status??null,providerMessageId:null,error:note,nowIso});
    }catch(err){
      console.error("Vendor order notification: could not write the failure log",key,err);
    }
    console.error("Vendor order notification not delivered",key,reason);
    return {sent:false,status:"failed",reason:String(reason).slice(0,200),provider:result?.provider||null};
  }catch(err){
    console.error("Vendor order notification error",key,err);
    try{
      await env.DB.prepare(`UPDATE ${TABLE} SET status='failed',error=?,updated_at=? WHERE notification_key=? AND status<>'sent'`)
        .bind(String(err?.message||err).slice(0,300),nowIso,key).run();
    }catch{}
    return {sent:false,status:"error",reason:String(err?.message||err).slice(0,200)};
  }
}

/**
 * Notify every vendor of one order.
 * vendors: [{vendorId,vendorName,recipient,vendorOrderId,items,subtotal,shipping,total}]
 * Each entry carries only that vendor's own items and totals.
 */
export async function notifyVendorsForOrder(env,{orderId,orderNumber,placedAt,orderStatus,customerName,panelUrl,vendors}={}){
  const out=[];
  for(const v of (vendors||[])){
    out.push({vendor_id:v.vendorId,...await notifyVendorOrder(env,{
      orderId,orderNumber,placedAt,orderStatus,customerName,panelUrl,
      vendorId:v.vendorId,vendorName:v.vendorName,recipient:v.recipient,vendorOrderId:v.vendorOrderId,
      items:v.items,subtotal:v.subtotal,shipping:v.shipping,total:v.total,
    })});
  }
  return out;
}