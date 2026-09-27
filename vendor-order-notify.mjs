/**
 * Vendor "new order" notifications.
 *
 * One email per vendor per order, never two — the order flow in this project
 * creates the vendor rows from three different places (checkout, the admin
 * "Confirmed" transition and the vendor finalizer), and before this module each
 * of them could email the same vendor again.
 *
 * The deduplication key is "<order id>|<vendor id>", which is known by every
 * caller even before the vendor_orders row exists, and every attempt is written
 * to vendor_order_notifications so the delivery status is visible and a failed
 * send can be retried without sending a duplicate to a vendor who already got it.
 *
 * Nothing in here throws: a mail problem must never break an order.
 */
import { sendVendorOrderEmail } from './grabzone-email.mjs';

const TABLE='vendor_order_notifications';
const TERMINAL=new Set(['cancelled','canceled','failed','returned','refunded','incomplete','abandoned']);

let tableReady=false;

export async function ensureVendorNotificationTable(env){
  if(tableReady)return true;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ${TABLE}(`
    +'notification_key TEXT PRIMARY KEY,'
    +'order_id TEXT NOT NULL,'
    +'vendor_id TEXT NOT NULL,'
    +'vendor_order_id TEXT,'
    +'recipient TEXT,'
    +'provider TEXT,'
    +'status TEXT NOT NULL,'
    +'attempts INTEGER NOT NULL DEFAULT 0,'
    +'provider_status INTEGER,'
    +'provider_message_id TEXT,'
    +'error TEXT,'
    +'created_at TEXT NOT NULL,'
    +'updated_at TEXT NOT NULL)').run().catch(()=>{});
  tableReady=true;
  return true;
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

async function readLog(env,key){
  try{
    const r=await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE notification_key=? LIMIT 1`).bind(key).all();
    return r?.results?.[0]||null;
  }catch{return null}
}

async function writeLog(env,row,existing){
  const now=new Date().toISOString();
  if(existing){
    await env.DB.prepare(`UPDATE ${TABLE} SET vendor_order_id=?,recipient=?,provider=?,status=?,attempts=?,provider_status=?,provider_message_id=?,error=?,updated_at=? WHERE notification_key=?`)
      .bind(row.vendor_order_id||existing.vendor_order_id||null,row.recipient||null,row.provider||null,row.status,Number(row.attempts||0),row.provider_status??null,row.provider_message_id||null,row.error?String(row.error).slice(0,500):null,now,row.notification_key).run();
    return;
  }
  await env.DB.prepare(`INSERT INTO ${TABLE}(notification_key,order_id,vendor_id,vendor_order_id,recipient,provider,status,attempts,provider_status,provider_message_id,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(row.notification_key,row.order_id,row.vendor_id,row.vendor_order_id||null,row.recipient||null,row.provider||null,row.status,Number(row.attempts||0),row.provider_status??null,row.provider_message_id||null,row.error?String(row.error).slice(0,500):null,now,now).run();
}

/**
 * Notify one vendor about one order.
 * Returns {sent:true|false, status, reason?} — never throws.
 */
export async function notifyVendorOrder(env,{
  orderId,orderNumber,placedAt,orderStatus,vendorId,vendorName,recipient,vendorOrderId,items,subtotal,shipping,total,customerName,panelUrl
}={}){
  const key=notificationKey(orderId,vendorId);
  const base={notification_key:key,order_id:String(orderId||""),vendor_id:String(vendorId||""),vendor_order_id:vendorOrderId||null};
  try{
    if(!orderId||!vendorId)return {sent:false,status:"skipped",reason:"missing-identifiers"};
    if(isTerminalOrderStatus(orderStatus))return {sent:false,status:"skipped",reason:"order-not-active"};
    await ensureVendorNotificationTable(env);
    const existing=await readLog(env,key);
    if(existing&&existing.status==="sent")return {sent:false,status:"duplicate",reason:"already-notified"};
    const to=String(recipient||"").trim();
    if(!to||!to.includes("@")){
      await writeLog(env,{...base,status:"skipped",attempts:Number(existing?.attempts||0),error:"vendor email address missing"},existing);
      return {sent:false,status:"skipped",reason:"no-recipient"};
    }
    const result=await sendVendorOrderEmail(env,{
      to,vendorName,orderNumber,placedAt,items,subtotal,shipping,total,customerName,
      panelUrl:panelUrl||vendorPanelUrl(env),
    });
    if(result?.ok){
      await writeLog(env,{...base,recipient:to,provider:result.provider||null,status:"sent",attempts:Number(existing?.attempts||0)+1,provider_status:result.status??null,provider_message_id:result.id||null},existing);
      return {sent:true,status:"sent",provider:result.provider||null};
    }
    const reason=result?.skipped||result?.error||"send-failed";
    await writeLog(env,{...base,recipient:to,provider:result?.provider||null,status:"failed",attempts:Number(existing?.attempts||0)+1,provider_status:result?.status??null,error:reason},existing);
    console.error("Vendor order notification not delivered",key,reason);
    return {sent:false,status:"failed",reason:String(reason).slice(0,200)};
  }catch(err){
    // A notification problem must never surface to the caller of an order API.
    console.error("Vendor order notification error",key,err);
    try{await writeLog(env,{...base,status:"failed",attempts:1,error:String(err?.message||err)},null)}catch{}
    return {sent:false,status:"error",reason:String(err?.message||err).slice(0,200)};
  }
}

/**
 * Notify every vendor of one order.
 * vendors: [{vendorId,vendorName,recipient,vendorOrderId,items,subtotal,shipping,total}]
 * Returns one result per vendor; item arrays are never shared between vendors,
 * so one vendor can only ever receive their own lines and totals.
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