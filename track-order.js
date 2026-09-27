
(()=> {
 const C=window.GRABZONE_CONFIG||{};
 let invoiceSiteSettings={whatsapp:C.whatsapp||'',instagram:C.instagram||'',messenger:C.messenger||''};
 const $=id=>document.getElementById(id);
 const statuses=['New','Contacting','Confirmed','Processing','Shipped','Delivered','Cancelled'];
 const statusIcons={
   New:'<svg viewBox="0 0 24 24"><path d="M4 9.5 12 4l8 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-9Z"/><path d="M8 20v-6h8v6"/></svg>',
   Contacting:'<svg viewBox="0 0 24 24"><path d="M7 4h3l1.5 4-2 1.5a13 13 0 0 0 5 5l1.5-2 4 1.5v3c0 1-1 1.5-2 1.5C11 18.5 5.5 13 5.5 6 5.5 5 6 4 7 4Z"/></svg>',
   Confirmed:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
   Processing:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
   Shipped:'<svg viewBox="0 0 24 24"><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></svg>',
   Delivered:'<svg viewBox="0 0 24 24"><path d="M5 12h10M11 8l4 4-4 4"/><path d="M4 5h16v14H4z"/></svg>',
   Cancelled:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m9 9 6 6M15 9l-6 6"/></svg>'
 };

 async function loadSocial(){
   try{
     if(window.grabzoneD1){
       const sb=window.grabzoneD1;
       const q=await sb.from('site_settings').select('whatsapp,instagram,messenger').eq('id',1).maybeSingle();
       const s=q.data||{};
       invoiceSiteSettings={...invoiceSiteSettings,...s};
       const wa=String(s.whatsapp||C.whatsapp||'').trim();
       const ig=String(s.instagram||C.instagram||'').trim();
       const fb=String(s.messenger||C.messenger||'').trim();
       if(wa&&!wa.includes('XXXXXXXX')) $('wa').href=wa; else $('wa').removeAttribute('href');
       if(ig&&!ig.includes('yourstore')) $('ig').href=ig; else $('ig').removeAttribute('href');
       if(fb&&!fb.includes('yourpage')) $('fb').href=fb; else $('fb').removeAttribute('href');
     }
   }catch(e){console.error('Social links:',e)}
 }
 const socialSettingsReady=loadSocial();

 function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
 function safeExternalLink(value){try{const u=new URL(String(value||'').trim(),location.origin);return /^https?:$/.test(u.protocol)&&!/(yourpage|yourstore|XXXXXXXX)/i.test(u.href)?u.href:''}catch{return ''}}
 function render(o){
   const idx=statuses.indexOf(o.status),safeIdx=idx<0?0:idx;
   const descriptions={New:'Order received',Contacting:'We are contacting you to confirm the order',Confirmed:'Order confirmed successfully',Processing:'Your order is being prepared',Shipped:'Your package is on the way',Delivered:'Order delivered',Cancelled:'This order has been cancelled'};
   $('result').hidden=false;
   const currentLabel=descriptions[o.status]||'Your order status has been updated';
   const district=String(o.district||'').toLowerCase(),division=String(o.division||'').toLowerCase();
   const eta=(district.includes('dhaka')||division==='dhaka')?'1–2 days':(district.includes('chattogram')||district.includes('chittagong')||division.includes('chattogram')||division.includes('chittagong'))?'2–4 days':(division?'2–5 days':'');
   const statusMarkup=statuses.map((s,i)=>{const isCancelled=s==='Cancelled';const cls=o.status==='Cancelled'?(isCancelled?'cancelled current':''):(i<safeIdx?'completed':i===safeIdx?'current':'');return '<div class="track-status-step '+cls+'"><span class="track-status-icon">'+statusIcons[s]+'</span><span>'+esc(s)+'</span></div>';}).join('');
   const vendors=Array.isArray(o.vendors)?o.vendors:[];
   function productImage(i){return String(i.image_url||'').trim()||'https://placehold.co/160x160?text=Product'}
 function variationText(i){let v=i.variation_options;if(typeof v==='string'){try{v=JSON.parse(v||'{}')}catch{v={}}}return v&&typeof v==='object'&&!Array.isArray(v)?Object.entries(v).map(([k,val])=>esc(k)+': '+esc(val)).join(' · '):''}
 async function openInvoice(o){
   const modal=$('invoiceModal'),body=$('invoiceBody'),meta=$('invoiceMeta');
   if(!modal||!body||modal.classList.contains('open')||modal.dataset.opening==='1')return;
   modal.dataset.opening='1';
   await socialSettingsReady;
   (window.__gzInvoicePrintTimers||[]).forEach(clearTimeout);window.__gzInvoicePrintTimers=[];
   modal.classList.remove('open','printing','printed','paper-feeding','invoice-reveal','printer-phase');modal.scrollTop=0;
   const orderNo=String(o.orderNumber||o.order_number||o.order_id||'—');
   const tracking=String(o.tracking_id||o.trackingId||'—');
   const orderDate=o.created_at||o.createdAt||o.order_date||o.orderDate||'';
   const dateText=orderDate?new Date(orderDate).toLocaleString('en-BD',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dhaka'}):'—';
   const payment=String(o.payment_method||o.paymentMethod||'Cash on Delivery');
   const status=String(o.status||'Processing');
   const customer=String(o.customer_name||o.customerName||'—');
   const phone=String(o.phone||o.customer_phone||'—');
   const email=String(o.email||o.customer_email||'');
   const address=[o.address,o.upazila,o.district,o.division].filter(Boolean).join(', ')||'—';
   const pointsUrl='https://grabzone.tech/grabpoints.html';
   const socialIcons={
     messenger:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.15 2 11.27c0 2.92 1.47 5.52 3.77 7.2V22l3.44-1.89c.9.25 1.83.38 2.79.38 5.52 0 10-4.15 10-9.22S17.52 2 12 2Zm1 12.42-2.55-2.72-4.98 2.72 5.48-5.82 2.61 2.72 4.92-2.72-5.48 5.82Z"/></svg>',
     instagram:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2.3"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2.3"/><circle cx="17.7" cy="6.5" r="1.4" fill="currentColor"/></svg>',
     whatsapp:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.03 2a9.86 9.86 0 0 0-8.48 14.9L2.2 22l5.24-1.37A9.9 9.9 0 1 0 12.03 2Zm0 17.98a8.06 8.06 0 0 1-4.1-1.12l-.3-.18-3.1.81.83-3.02-.2-.31a8.08 8.08 0 1 1 6.87 3.82Zm4.43-6.05c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.46-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.16 1.51.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z"/></svg>'
   };
   const socialFooter=[['Facebook / Messenger','messenger'],['Instagram','instagram'],['WhatsApp','whatsapp']].map(([label,key])=>{const href=safeExternalLink(invoiceSiteSettings[key]);return href?'<a class="gz-invoice-social-link gz-social-'+key+'" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+socialIcons[key]+'<span>'+label+'</span></a>':''}).filter(Boolean).join('');
   const qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=6&data='+encodeURIComponent(pointsUrl);
   const sum=Number(o.subtotal||0),shipping=Number(o.shipping_charge||0);
   const discount=Number(o.referral_discount||0)+Number(o.rewards_voucher_discount||0)+Number(o.mystery_discount||0);
   const total=Number(o.total||0);
   const money=n=>'৳'+Number(n||0).toLocaleString('en-BD');
   const bar=(id,value)=>'<div class="gz-invoice-barcode"><svg id="'+id+'" role="img" aria-label="Barcode '+esc(value)+'"></svg><small>'+esc(value)+'</small></div>';
   const vendors=Array.isArray(o.vendors)?o.vendors:[];
   const flatItems=vendors.flatMap(v=>(v.items||[]).map(i=>({vendor:v.brand_name||v.vendor_name||'GrabZone',item:i})));
   const items=flatItems.length?flatItems.map(({vendor:v,item:i})=>'<tr><td class="gz-inv-item"><div class="gz-inv-product">'+(i.image_url?'<img src="'+esc(productImage(i))+'" alt="">':'')+'<div><b>'+esc(i.product_name||i.name||'Product')+'</b><small class="gz-inv-store">🏬 Store: '+esc(v)+'</small><small>SKU: '+esc(i.variation_sku||i.sku||'—')+(variationText(i)?'<br>'+variationText(i):'')+'</small></div></div></td><td>'+money(i.unit_price||0)+'</td><td>'+Number(i.quantity||1)+'</td><td><b>'+money(i.line_total||Number(i.unit_price||0)*Number(i.quantity||1))+'</b></td></tr>').join(''):
     (Array.isArray(o.items)?o.items:[]).map(i=>'<tr><td class="gz-inv-item"><div class="gz-inv-product">'+(i.image_url?'<img src="'+esc(productImage(i))+'" alt="">':'')+'<div><b>'+esc(i.product_name||i.name||'Product')+'</b><small class="gz-inv-store">🏬 Store: '+esc(i.brand_name||i.vendor_name||i.store_name||'GrabZone')+'</small><small>SKU: '+esc(i.sku||'—')+'</small></div></div></td><td>'+money(i.unit_price||i.price||0)+'</td><td>'+Number(i.quantity||1)+'</td><td><b>'+money(i.line_total||Number(i.price||i.unit_price||0)*Number(i.quantity||1))+'</b></td></tr>').join('');
   body.innerHTML=
     '<div class="gz-invoice-toolbar"><span class="gz-invoice-chip">🧾 GRABZONE RECEIPT</span><div class="gz-invoice-actions"><button type="button" id="invoiceDownload" class="gz-invoice-download">📥 Download Invoice</button></div></div>'+
     '<div class="gz-invoice-brandhead"><div class="gz-invoice-brand"><img src="favicon.png" alt="GrabZone logo"><div><strong>Grab<span>Zone</span></strong><small>GADGETS&nbsp; • &nbsp;FASHION&nbsp; • &nbsp;MORE FOR YOU</small></div></div><div class="gz-invoice-title"><h2>ORDER INVOICE</h2><p>Thank you for shopping with GrabZone!</p></div></div>'+
     '<section class="gz-invoice-order-meta"><div class="gz-invoice-identifiers"><div><span>GrabZone Order No.</span><b>'+esc(orderNo)+'</b></div><div><span>Tracking ID</span><b>'+esc(tracking)+'</b></div></div><div class="gz-invoice-orderfacts"><div><span>Order Date</span><b>'+esc(dateText)+'</b></div><div><span>Payment Method</span><b>'+esc(payment)+'</b></div><div><span>Order Status</span><b><i class="gz-invoice-status-dot"></i>'+esc(status)+'</b></div></div></section>'+
     '<section class="gz-invoice-parties"><div><h3>♟ Customer Information</h3><b>'+esc(customer)+'</b><p>Phone: '+esc(phone)+(email?'<br>Email: '+esc(email):'')+'</p></div><div><h3>📍 Shipping Address</h3><p>'+esc(address)+'</p></div></section>'+
     '<section class="gz-invoice-items"><table><thead><tr><th>Item</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead><tbody>'+items+'</tbody></table></section>'+
     '<section class="gz-invoice-totals"><div><span>Subtotal</span><b>'+money(sum)+'</b></div><div><span>Shipping</span><b>'+money(shipping)+'</b></div>'+(discount?'<div><span>Discount</span><b>−'+money(discount)+'</b></div>':'')+'<div class="gz-invoice-grandtotal"><span>Total Paid ('+esc(payment)+')</span><b>'+money(total)+'</b></div></section>'+
     '<section class="gz-invoice-barcodes"><div><h3>GrabZone Order Barcode</h3>'+bar('gzInvoiceOrderBarcode',orderNo)+'</div><div><h3>Tracking ID Barcode</h3>'+bar('gzInvoiceTrackingBarcode',tracking)+'</div></section>'+
     '<section class="gz-invoice-thanks"><div class="gz-invoice-signoff"><strong>Thank You <span>♡</span></strong><em>for shopping with GrabZone!</em></div><div class="gz-invoice-bangla"><b>আপনার অর্ডারের জন্য ধন্যবাদ!</b><p>আপনার সমর্থন আমাদের আরও ভালো পণ্য এবং সেবা দেওয়ার অনুপ্রেরণা দেয়।</p></div></section>'+
     '<section class="gz-invoice-grabpoints"><div class="gz-invoice-gp-brand"><div class="gz-invoice-gp-icon">GP</div><div><strong>Grab<span>Points</span></strong><h3>কেনাকাটায় আরও বেশি সুবিধা পান!</h3><p>প্রতিটি অর্ডারে GrabPoints সংগ্রহ করুন এবং ভবিষ্যতে ব্যবহার করে ডিসকাউন্ট পান।</p></div></div><div class="gz-invoice-gp-rewards"><span>🛒 অর্ডার করুন<br>সুবিধা নিন</span><span>🎁 পয়েন্ট দিয়ে<br>ডিসকাউন্ট পান</span><span>⭐ বিশেষ অফার<br>ও রিওয়ার্ড পান</span></div><a class="gz-invoice-gp-qr" href="'+esc(pointsUrl)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(qrUrl)+'" alt="GrabPoints QR code"><b>এখানে GrabPoints দেখুন</b><small>স্ক্যান করুন অথবা ভিজিট করুন</small><strong>grabzone.tech/grabpoints.html</strong></a></section>'+
     '<footer class="gz-invoice-footer"><div><b>🛟 Need Help?</b><a href="mailto:grabzonesupport@gmail.com">grabzonesupport@gmail.com</a></div><div><b>🌐 Visit Our Store</b><a href="https://grabzone.tech/" target="_blank" rel="noopener noreferrer">grabzone.tech</a></div><div><b>📲 Follow @GrabZone</b><span class="gz-invoice-social-links">'+(socialFooter||'<small>Social links are not configured.</small>')+'</span></div><small>© '+new Date().getFullYear()+' GrabZone. All rights reserved.</small></footer>';
   const receiptPaper=modal.querySelector('.receipt-paper');
   if(receiptPaper){
     receiptPaper.innerHTML='<div class="receipt-lines"><strong>GRABZONE</strong><b>ORDER RECEIPT</b><hr><span>Order: '+esc(orderNo)+'</span><span>Tracking: '+esc(tracking)+'</span><span>Customer: '+esc(customer)+'</span><b class="receipt-mini-total">TOTAL: '+money(total)+'</b><i></i><i></i></div>';
   }
   if(window.JsBarcode){
     [[ '#gzInvoiceOrderBarcode',orderNo ],[ '#gzInvoiceTrackingBarcode',tracking ]].forEach(([selector,value])=>{if(value&&value!=='—'){try{window.JsBarcode(selector,value,{format:'CODE128',displayValue:false,lineColor:'#171717',background:'#fff',width:1.5,height:48,margin:3});}catch(err){console.warn('Invoice barcode error:',err)}}});
   }
   const downloadBtn=$('invoiceDownload');
   if(downloadBtn)downloadBtn.onclick=async()=>{
     const sheet=modal.querySelector('.invoice-sheet');
     const old=downloadBtn.innerHTML;downloadBtn.disabled=true;downloadBtn.textContent='⏳ Preparing full PDF…';
     let pdfRoot=null;
     try{
       if(!window.html2pdf)throw new Error('PDF generator did not load. Refresh the page and try again.');
       pdfRoot=document.createElement('div');
       pdfRoot.className='gz-invoice-pdf-root';
       pdfRoot.style.cssText='position:fixed;left:0;top:0;width:680px;box-sizing:border-box;background:#fff;color:#171923;z-index:2147483647;pointer-events:none;opacity:.001;';
       const clone=sheet.cloneNode(true);
       clone.classList.add('gz-invoice-pdf-copy');
       clone.style.setProperty('position','static','important');
       clone.style.setProperty('width','680px','important');
       clone.style.setProperty('max-width','none','important');
       clone.style.setProperty('height','auto','important');
       clone.style.setProperty('max-height','none','important');
       clone.style.setProperty('overflow','visible','important');
       clone.style.setProperty('margin','0','important');
       clone.style.setProperty('padding','20px','important');
       clone.style.setProperty('transform','none','important');
       clone.style.setProperty('clip-path','none','important');
       clone.style.setProperty('box-shadow','none','important');
       clone.style.setProperty('border-radius','0','important');
       clone.querySelector('.invoice-close')?.remove();
       clone.querySelector('.gz-invoice-actions')?.remove();
       clone.querySelectorAll('*').forEach(el=>{el.style.setProperty('animation','none','important');el.style.setProperty('transition','none','important')});
       pdfRoot.appendChild(clone);
       document.body.appendChild(pdfRoot);
       const imgs=[...clone.querySelectorAll('img')];
       await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true})})));
       const pdfHeight=Math.max(clone.scrollHeight,clone.getBoundingClientRect().height);
       const opt={
         margin:[6,6,8,6],
         filename:'GrabZone-Invoice-'+orderNo.replace(/[^a-z0-9_-]/gi,'-')+'.pdf',
         image:{type:'jpeg',quality:.98},
         html2canvas:{scale:2,useCORS:true,allowTaint:false,backgroundColor:'#ffffff',scrollX:0,scrollY:0},
         jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
         pagebreak:{mode:['css'],avoid:['.gz-invoice-grabpoints','.gz-invoice-barcodes','.gz-invoice-thanks','.gz-invoice-footer','.gz-inv-product']}
       };
       await window.html2pdf().set(opt).from(clone).save();
     }catch(err){console.error('Invoice PDF download failed:',err);alert('Invoice PDF তৈরি করা যায়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।');}
     finally{if(pdfRoot)pdfRoot.remove();downloadBtn.disabled=false;downloadBtn.innerHTML=old;}
   };
   modal.classList.add('open','printing','printer-phase');
   window.__gzInvoicePrintTimers.push(setTimeout(()=>modal.classList.add('paper-feeding'),250));
   window.__gzInvoicePrintTimers.push(setTimeout(()=>modal.classList.add('invoice-reveal'),3000));
   window.__gzInvoicePrintTimers.push(setTimeout(()=>{modal.classList.remove('printing','printer-phase','paper-feeding','invoice-reveal');modal.classList.add('printed');delete modal.dataset.opening},4300));
 }
 const shipmentMarkup=vendors.length?vendors.map(v=>{
     const products=(v.items||[]).map(i=>esc(i.product_name||'Product')+' × '+Number(i.quantity||1)).join(' · ')||'Product';
     const shipments=Array.isArray(v.shipments)?v.shipments:[];
     return '<section class="tracking-box"><div style="font-size:12px;color:#777;font-weight:800;text-transform:uppercase;letter-spacing:.06em">SHOP</div><div style="font-size:18px;font-weight:900;margin-top:3px">'+esc(v.brand_name||v.vendor_name||'Vendor')+'</div><div style="margin-top:5px;font-size:13px;color:#555"><b>Product:</b> '+products+'</div>'+
       (shipments.length?shipments.map(s=>'<div style="margin-top:12px;padding-top:12px;border-top:1px solid #ddd"><div style="font-size:11px;font-weight:900;color:#777;text-transform:uppercase">SHIPMENT</div><div style="margin-top:5px"><b>'+esc(s.status||v.status||'Processing')+'</b></div><div style="margin-top:4px;color:#555">'+esc(s.courier||'Courier pending')+(s.tracking_id?' · '+esc(s.tracking_id):' · Tracking pending')+'</div>'+(s.tracking_url?'<a class="tracking-link" href="'+esc(s.tracking_url)+'" target="_blank" rel="noopener">Track Package →</a>':'')+'</div>').join(''):'<div style="margin-top:10px;color:#777">Shipment not added yet.</div>')+
     '</section>';
   }).join(''):'<div class="tracking-box">Shipment details will appear here once your vendor ships the order.</div>';
   $('result').innerHTML='<b>Order #'+esc(o.orderNumber)+'</b>'+
   '<div class="current-status">Current Status: '+esc(o.status||'Unknown')+'<small>'+esc(currentLabel)+'</small></div>'+
   (eta?'<div class="tracking-box"><b>📦 Estimated Arrival</b><div>'+esc(eta)+'</div></div>':'')+
   '<div class="track-status-line" aria-label="Order status progress">'+statusMarkup+'</div>'+
   '<div class="order-mini-info"><div class="order-mini"><span>Order</span><b>#'+esc(o.orderNumber||'—')+'</b></div><div class="order-mini"><span>Tracking ID</span><b>'+esc(o.tracking_id||'—')+'</b></div></div><div class="tracking-actions"><button type="button" class="gz-action primary" id="viewInvoiceBtn"><span class="gz-action-icon">🧾</span> View Invoice</button><button type="button" class="gz-action" id="copyTrackingBtn"><span class="gz-action-icon">📋</span> Copy Tracking ID</button><button type="button" class="gz-action success" id="refreshOrderBtn"><span class="gz-action-icon">🔄</span> Refresh Status</button><button type="button" class="gz-action dark" id="storeActionBtn"><span class="gz-action-icon">🛍️</span> Continue Shopping</button></div><div style="margin-top:22px"><b style="font-size:16px">📦 Shipment Tracking</b>'+shipmentMarkup+'</div>'+
   (o.items?.length?'<div class="items"><b>Order Items</b>'+o.items.map(i=>'<div class="item"><span>'+esc(i.name)+' × '+i.quantity+'</span><span>৳'+Number(i.price*i.quantity).toLocaleString('en-BD')+'</span></div>').join('')+'</div>':'');
   const invBtn=$('viewInvoiceBtn');if(invBtn)invBtn.onclick=()=>openInvoice(o);
   const copyBtn=$('copyTrackingBtn');if(copyBtn)copyBtn.onclick=async()=>{const value=String(o.tracking_id||o.orderNumber||'').trim();try{await navigator.clipboard.writeText(value);copyBtn.innerHTML='<span class="gz-action-icon">✅</span> Copied!';setTimeout(()=>{copyBtn.innerHTML='<span class="gz-action-icon">📋</span> Copy Tracking ID'},1600)}catch{copyBtn.innerHTML='<span class="gz-action-icon">⚠️</span> Copy unavailable';setTimeout(()=>{copyBtn.innerHTML='<span class="gz-action-icon">📋</span> Copy Tracking ID'},1600)}};
   const refreshBtn=$('refreshOrderBtn');if(refreshBtn)refreshBtn.onclick=async()=>{refreshBtn.disabled=true;refreshBtn.innerHTML='<span class="gz-action-icon">⏳</span> Updating...';try{const d=await getOrder(o.tracking_id||o.orderNumber);if(d?.order){render(d.order);$('msg').innerHTML='<span class="live-dot"></span> Status updated just now';}}catch(e){$('msg').textContent=e.message||'Could not refresh order.'}finally{if($('refreshOrderBtn'))$('refreshOrderBtn').disabled=false}};
   const storeBtn=$('storeActionBtn');if(storeBtn)storeBtn.onclick=()=>{location.href='index.html'};
   const closeInvoice=()=>{(window.__gzInvoicePrintTimers||[]).forEach(clearTimeout);window.__gzInvoicePrintTimers=[];const m=$('invoiceModal');if(m){m.classList.remove('open','printing','printed','printer-phase','paper-feeding','invoice-reveal');delete m.dataset.opening}};const invClose=$('invoiceClose');if(invClose)invClose.onclick=closeInvoice;const invModal=$('invoiceModal');if(invModal)invModal.onclick=e=>{if(e.target===invModal)closeInvoice()};
 }

 async function getOrder(id){
   const clean=String(id||'').trim().toUpperCase();
   if(!clean) throw new Error('Please enter your Order Tracking ID.');
   const marketplace=await fetch('/api/marketplace/track?tracking_id='+encodeURIComponent(clean),{cache:'no-store'});
   let md={}; try{md=await marketplace.json()}catch{}
   if(marketplace.ok&&md.order)return {success:true,order:{...md.order,orderNumber:md.order.order_number,items:[],vendors:md.vendors||[]}};
   if(!window.grabzoneD1) throw new Error(md.error||'Tracking service is not configured.');
   const sb=window.grabzoneD1;
   const {data,error}=await sb.rpc('track_public_order',{p_tracking_id:clean});
   if(!error&&data) return {success:true,order:data};
   console.warn('Direct tracking RPC failed:',error);
   const response=await fetch('/api/track-order?trackingId='+encodeURIComponent(clean),{cache:'no-store'});
   let body={}; try{body=await response.json()}catch{}
   if(!response.ok) throw new Error(body.error||'Order not found. Please check your Order ID.');
   return body;
 }

 $('trackForm').addEventListener('submit',async e=>{
   e.preventDefault();
   const msg=$('msg'),result=$('result');
   msg.textContent='Checking order…'; result.hidden=true;
   try{
     const d=await getOrder($('orderId').value);
     if(!d?.order) throw new Error('Order not found. Please check your Order ID.');
     render(d.order);
     msg.textContent='Order found ✓';
     if(params.get('invoice')==='1') openInvoice(d.order);
   }catch(e){
     console.error('Track order:',e);
     msg.textContent=e.message||'Could not load the order. Please try again.';
   }
 });
const params=new URLSearchParams(location.search);
 const initialTracking=params.get('tracking')||'';
 if(initialTracking){$('orderId').value=initialTracking.toUpperCase();setTimeout(()=>$('trackForm').requestSubmit(),50)}
})();
