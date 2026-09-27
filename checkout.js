(() => {
'use strict';

const C=window.GRABZONE_CONFIG||{};
const d1=window.grabzoneD1||null;

const CART_KEY='grabzone_cart_v2';
const BUY_NOW_KEY='grabzone_buy_now_v2';
const currency=C.currency||'৳';
let marketplaceShipping=0,shippingBreakdown=[],marketplaceProductsLoaded=false;
async function loadMarketplaceShipping(){
  try{
    const ids=[...new Set(checkoutItems.map(i=>i.product_id).filter(Boolean).map(String))];
    const query=ids.length?'?ids='+encodeURIComponent(ids.join(','))+'&limit=500':'?limit=500';
    const r=await fetch('/api/marketplace/products'+query,{credentials:'include',cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Marketplace products unavailable');
    const products=Array.isArray(d.products)?d.products:[];
    const map=new Map(products.map(p=>[String(p.id),p]));
    const groups=new Map();
    checkoutItems.forEach(i=>{
      const p=map.get(String(i.product_id));
      if(!p)return;
      const vid=String(p.vendor_id||'');
      if(!vid)return;
      if(!groups.has(vid))groups.set(vid,{vendor_id:vid,name:String(p.vendor_name||p.brand_name||p.vendor_slug||'Vendor'),fee:Number(p.vendor_shipping_fee??p.shipping_fee??0)});
    });
    shippingBreakdown=[...groups.values()].map(x=>({...x,fee:Math.max(0,x.fee)}));
    marketplaceShipping=shippingBreakdown.reduce((s,x)=>s+x.fee,0);
    checkoutItems=checkoutItems.map(i=>{const p=map.get(String(i.product_id));return p?{...i,vendor_id:p.vendor_id,vendor_name:p.vendor_name||p.brand_name||p.vendor_slug,vendor_shipping_fee:Number(p.vendor_shipping_fee??p.shipping_fee??0)}:i});
    marketplaceProductsLoaded=true;
    return marketplaceShipping;
  }catch(e){
    console.warn('GrabZone marketplace shipping:',e);
    marketplaceProductsLoaded=false;
    shippingBreakdown=[];marketplaceShipping=0;
    return 0;
  }
}
async function loadGlobalShipping(){ return loadMarketplaceShipping(); }

let checkoutItems=[],site={},locationTree=[],referralState={code:'',discount:0},rewardsVoucherState={code:'',discount:0,value:0,expires_at:'',points_redeemed:0},grabPointsState={balance:0,use:0,discount:0},mysteryState={token:'',discount:0},grabPointsEnabled=true,grabPointsEarnRate=10,grabPointsValue=0.1;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}};
const money=n=>currency+Number(n||0).toLocaleString('en-BD');
const getSource=()=>{const buy=read(BUY_NOW_KEY,null);return Array.isArray(buy)&&buy.length?buy:read(CART_KEY,[])};
async function loadGrabPointsSettings(){try{const{data,error}=await d1.from('site_settings').select('grabpoints_enabled,grabpoints_earn_rate,grabpoints_value').eq('id',1).maybeSingle();if(error)throw error;grabPointsEnabled=Number(data?.grabpoints_enabled??1)===1;grabPointsEarnRate=Number(data?.grabpoints_earn_rate??10);grabPointsValue=Number(data?.grabpoints_value??0.1);const box=document.querySelector('.grabpoints-box'),opt=document.querySelector('.grabpoints-optin');if(box)box.hidden=!grabPointsEnabled;if(opt)opt.hidden=!grabPointsEnabled;}catch{grabPointsEnabled=true;}}
function loadMystery(){const x=read('grabzone_mystery_v1',null);if(x?.token&&x?.expires_at&&Date.parse(x.expires_at)>Date.now())mysteryState={token:String(x.token),discount:Number(x.discount||0)};else{mysteryState={token:'',discount:0};try{localStorage.removeItem('grabzone_mystery_v1')}catch{}}}
const msg=(t,error=false)=>{const e=$('checkoutMessage');if(e){e.textContent=t||'';e.className='checkout-message'+(error?' error':'')}};
const subtotal=()=>checkoutItems.reduce((s,i)=>s+Number(i.price||0)*Number(i.quantity||0),0);
/*
  Delivery charge = the sum of each vendor's configured shipping fee, for every
  customer location. There is deliberately no Dhaka / outside-Dhaka branch: the
  same vendor rate applies everywhere in Bangladesh. The server recalculates
  this from the vendor records when the order is created, so a tampered client
  value cannot change what the customer is charged.
*/
const shippingForLocation=()=>marketplaceShipping;
function deliveryEtaForLocation(division,district){
  const d=String(district||'').toLowerCase(),v=String(division||'').toLowerCase();
  if(d||v)return '2–7 days';
  return '';
}
function renderDeliveryEta(){
  const box=$('deliveryEta'),text=$('deliveryEtaText');if(!box||!text)return;
  const eta=deliveryEtaForLocation($('division')?.value||'',$('district')?.value||'');
  box.hidden=!eta;if(eta)text.textContent=eta;
}

function divisions(){
  if(Array.isArray(locationTree)) return locationTree;
  return Array.isArray(locationTree?.data)?locationTree.data:[];
}
function districtRecords(){
  const selected=String($('division')?.value||'').trim();
  if(!selected)return [];
  const d=divisions().find(x=>String(x?.name?.en||'').trim()===selected || String(x?.name?.local||'').trim()===selected);
  return Array.isArray(d?.district)?d.district:[];
}
function thanaRecords(){
  const selectedDivision=String($('division')?.value||'').trim();
  const selectedDistrict=String($('district')?.value||'').trim();
  if(!selectedDivision||!selectedDistrict)return [];
  const d=districtRecords().find(x=>String(x?.name?.en||'').trim()===selectedDistrict || String(x?.name?.local||'').trim()===selectedDistrict);
  return Array.isArray(d?.upazila)?d.upazila:[];
}

function fillSelect(selectId,records,placeholder){
  const select=$(selectId);if(!select)return;
  const list=Array.isArray(records)?records:[];
  // Never wipe a working static dropdown when location data has not loaded yet.
  if(!list.length)return;
  const current=select.value;
  select.innerHTML='<option value="">'+esc(placeholder)+'</option>'+list.map(x=>{
    const en=String(x?.name?.en||'').trim(),local=String(x?.name?.local||'').trim();
    const value=en||local,label=en&&local&&en!==local?en+' — '+local:(en||local);
    return '<option value="'+esc(value)+'">'+esc(label)+'</option>';
  }).join('');
  if([...select.options].some(o=>o.value===current))select.value=current;
}

function fillDistrictOptions(){
  fillSelect('district',districtRecords(),'Select District');
  setPickerEnabled('district',true);
  renderPicker('district');
  updatePickerText('district');
}
function fillUpazilaOptions(){
  fillSelect('upazila',thanaRecords(),'Select Thana');
  setPickerEnabled('upazila',true);
  renderPicker('upazila');
  updatePickerText('upazila');
}
function useEmbeddedLocations(){
  const embedded=window.GRABZONE_BD_LOCATIONS;
  if(embedded&&Array.isArray(embedded.data)&&embedded.data.length){
    locationTree=embedded;
    fillSelect('division',divisions(),'Select Division');
    return true;
  }
  return false;
}
async function loadLocations(){
  // Use the bundled dataset first. It is already on the checkout page, so the
  // Division selector is populated immediately and does not depend on a fetch.
  if(useEmbeddedLocations()){
    $('district').disabled=true;
    $('upazila').disabled=true;
    return;
  }

  // Fallback for deployments where the bundled dataset is unavailable.
  try{
    const r=await fetch('/data/bangladesh-locations.json?checkout=20260829',{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const json=await r.json();
    if(!json||!Array.isArray(json.data)||!json.data.length)throw new Error('Invalid Bangladesh location data.');
    locationTree=json;
    fillSelect('division',divisions(),'Select Division');
    $('district').disabled=true;
    $('upazila').disabled=true;
    return;
  }catch(e){ console.error('GrabZone location data failed:',e); }

  // Keep the static HTML Division choices and do not blank the control.
  const division=$('division');
  if(division) division.disabled=false;
  msg('Location data could not be loaded. Please refresh and try again.',true);
}
function locationRecords(type){
  if(type==='division') return divisions();
  if(type==='district') return districtRecords();
  return thanaRecords();
}
function locationLabel(x){
  const en=String(x?.name?.en||'').trim(), local=String(x?.name?.local||'').trim();
  return {en:en||local,local:local||en,value:en||local};
}
function pickerFor(type){
  return document.querySelector('.location-picker[data-picker="'+type+'"]');
}
function renderPicker(type,query=''){
  const picker=pickerFor(type); if(!picker)return;
  const list=locationRecords(type);
  const q=String(query||'').trim().toLowerCase();
  const filtered=q?list.filter(x=>{
    const n=locationLabel(x); return n.en.toLowerCase().includes(q)||n.local.toLowerCase().includes(q);
  }):list;
  const options=picker.querySelector('.location-options');
  const selected=$(type)?.value||'';
  options.innerHTML=filtered.length?filtered.map(x=>{
    const n=locationLabel(x);
    return '<button type="button" class="location-option'+(n.value===selected?' active':'')+'" data-value="'+esc(n.value)+'" role="option" aria-selected="'+(n.value===selected?'true':'false')+'"><span class="location-option-main">'+esc(n.local)+'</span><span class="location-option-sub">'+esc(n.en)+'</span></button>';
  }).join(''):'<div class="location-empty">No matching location found.</div>';
}
function setPickerEnabled(type,enabled){
  const picker=pickerFor(type); if(!picker)return;
  const trigger=picker.querySelector('.location-trigger');
  if(trigger)trigger.disabled=!enabled;
  const input=picker.querySelector('.location-menu-search');
  if(input)input.disabled=!enabled;
}
function updatePickerText(type){
  const picker=pickerFor(type), select=$(type); if(!picker||!select)return;
  const option=select.options[select.selectedIndex];
  const text=picker.querySelector('.location-trigger-text');
  if(text)text.textContent=option?.value||option?.textContent||('Select '+type);
}
function closeAllPickers(except){
  document.querySelectorAll('.location-picker.open').forEach(p=>{
    if(p!==except){p.classList.remove('open');p.querySelector('.location-menu')?.setAttribute('hidden','');p.querySelector('.location-trigger')?.setAttribute('aria-expanded','false');}
  });
}
function openPicker(type){
  const picker=pickerFor(type); if(!picker)return;
  if(picker.querySelector('.location-trigger')?.disabled)return;
  closeAllPickers(picker);
  picker.classList.add('open');
  const menu=picker.querySelector('.location-menu'), input=picker.querySelector('.location-menu-search');
  menu.hidden=false; picker.querySelector('.location-trigger').setAttribute('aria-expanded','true');
  input.value=''; renderPicker(type,'');
  requestAnimationFrame(()=>input.focus());
}
function closePicker(type){
  const picker=pickerFor(type); if(!picker)return;
  picker.classList.remove('open');picker.querySelector('.location-menu').hidden=true;picker.querySelector('.location-trigger').setAttribute('aria-expanded','false');
}
function chooseLocation(type,value){
  const select=$(type); if(!select)return;
  select.value=value;
  updatePickerText(type);
  closePicker(type);
  if(type==='division') onDivisionChange();
  else if(type==='district') onDistrictChange();
  else render();
}
function bindLocationPickers(){
  document.querySelectorAll('.location-picker').forEach(picker=>{
    const type=picker.dataset.picker;
    const trigger=picker.querySelector('.location-trigger');
    const input=picker.querySelector('.location-menu-search');
    trigger?.addEventListener('click',()=>picker.classList.contains('open')?closePicker(type):openPicker(type));
    input?.addEventListener('input',()=>renderPicker(type,input.value));
    picker.querySelector('.location-options')?.addEventListener('click',e=>{
      const option=e.target.closest('.location-option');
      if(option)chooseLocation(type,option.dataset.value);
    });
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.location-picker'))closeAllPickers();
  });
}
function onDivisionChange(){
  const division=$('division'),district=$('district'),upazila=$('upazila');
  if(!division||!district||!upazila)return;
  district.value='';upazila.value='';
  district.disabled=!division.value;upazila.disabled=true;
  setPickerEnabled('district',!!division.value);
  setPickerEnabled('upazila',false);
  updatePickerText('district');updatePickerText('upazila');
  if(division.value)fillDistrictOptions();
  render();renderDeliveryEta();
}
function onDistrictChange(){
  const district=$('district'),upazila=$('upazila');
  if(!district||!upazila)return;
  upazila.value='';
  upazila.disabled=!district.value;
  setPickerEnabled('upazila',!!district.value);
  updatePickerText('upazila');
  if(district.value)fillUpazilaOptions();
  render();renderDeliveryEta();
}
function formData(){
  return {
    customer_name:$('customerName').value.trim(),
    phone:$('customerPhone').value.trim(),
    email:$('customerEmail').value.trim(),
    division:$('division').value.trim(),
    district:$('district').value.trim(),
    upazila:$('upazila').value.trim(),
    address:$('address').value.trim(),
    referral_code:$('referralCode').value.trim().toUpperCase(),
    rewards_voucher_code:$('rewardsVoucherCode')?.value.trim().toUpperCase()||'',
    grabpoints_opt_in:1,
    mystery_token:mysteryState.token
  };
}
function validate(d){
  if(!d.customer_name||!d.phone||!d.email||!d.division||!d.district||!d.upazila||!d.address)
    return'Please complete all required fields.';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))
    return'Please enter a valid email address.';
  const phone=d.phone.replace(/\D/g,'');
  if(!/^01[3-9]\d{8}$/.test(phone))
    return'Please enter a valid 11-digit Bangladesh mobile number (01XXXXXXXXX).';
  return checkoutItems.length?'':'Your order is empty.';
}
function render(){
  const box=$('checkoutItems'),side=$('checkoutItemsSide'),empty=$('checkoutEmpty'),form=$('checkoutForm');
  if(!checkoutItems.length){
    if(box)box.innerHTML='';if(side)side.innerHTML='';
    if(empty)empty.hidden=false;if(form)form.hidden=true;return;
  }
  if(empty)empty.hidden=true;if(form)form.hidden=false;
  box.innerHTML=checkoutItems.map(i=>`<div class="checkout-item">
    <img src="${esc(i.image_url)}" alt="${esc(i.name)}">
    <div class="checkout-item-info"><strong>${esc(i.name)}</strong><span>Quantity: ${i.quantity}${i.variation_options&&typeof i.variation_options==='object'?' · '+Object.entries(i.variation_options).map(([k,v])=>esc(k)+': '+esc(v)).join(' · '):''}${i.variation_sku||i.sku?' · SKU: '+esc(i.variation_sku||i.sku):''}</span></div>
    <b>${money(i.price*i.quantity)}</b>
  </div>`).join('');
  side.innerHTML=checkoutItems.map(i=>`<div class="summary-product">
    <img src="${esc(i.image_url)}" alt="">
    <div><strong>${esc(i.name)}</strong><span>Qty ${i.quantity}${i.variation_options&&typeof i.variation_options==='object'?' · '+Object.entries(i.variation_options).map(([k,v])=>esc(k)+': '+esc(v)).join(' · '):''}</span></div>
    <b>${money(i.price*i.quantity)}</b>
  </div>`).join('');
  const sub=subtotal(),shipping=shippingForLocation(),discount=Number(referralState.discount||0),pointsDiscount=Number(rewardsVoucherState.discount||0),mysteryDiscount=Math.min(sub,sub*Number(mysteryState.discount||0)/100);
  $('checkoutSubtotal').textContent=money(sub);
  $('checkoutShipping').textContent=money(shipping);
  const breakdown=$('checkoutShippingBreakdown');
  if(breakdown){
    breakdown.hidden=!shippingBreakdown.length;
    breakdown.innerHTML=shippingBreakdown.map(x=>`<div style="display:flex;justify-content:space-between;gap:10px;font-size:11px;color:#666;padding:2px 0"><span>${esc(x.name)} delivery</span><b>${money(x.fee)}</b></div>`).join('');
  }
  $('checkoutDiscount').textContent='-'+money(discount);
  $('checkoutDiscountRow').hidden=discount<=0;
  const pointsRow=$('checkoutPointsRow');if(pointsRow)pointsRow.hidden=pointsDiscount<=0;const pointsEl=$('checkoutPointsDiscount');if(pointsEl)pointsEl.textContent='-'+money(pointsDiscount);
  const mysteryRow=$('checkoutMysteryRow');if(mysteryRow)mysteryRow.hidden=mysteryDiscount<=0;const mysteryEl=$('checkoutMysteryDiscount');if(mysteryEl)mysteryEl.textContent='-'+money(mysteryDiscount);
  $('checkoutTotal').textContent=money(Math.max(0,sub+shipping-discount-pointsDiscount-mysteryDiscount));
  renderDeliveryEta();
}
async function applyReferral(){
  const input=$('referralCode'),button=$('applyReferralBtn'),note=$('referralMessage');
  const code=input.value.trim().toUpperCase();
  if(!code){
    referralState={code:'',discount:0};
    note.textContent='Referral code cleared.';
    note.style.color='#858a88';
    render();return;
  }
  if(!d1){note.textContent='Referral service is not configured.';return}
  button.disabled=true;button.textContent='Checking…';
  try{
    const{data,error}=await d1.rpc('validate_referral_code',{p_code:code,p_subtotal:subtotal()});
    if(error)throw error;
    if(!data?.valid){
      referralState={code:'',discount:0};
      note.textContent=data?.message||'Invalid or inactive referral code.';
      note.style.color='#b42318';
    }else{
      referralState={code,discount:Number(data.discount||0)};
      note.textContent=`✓ ${data.label||'Referral benefit applied'} — ${money(data.discount)} off`;
      note.style.color='#08704f';
    }
    render();
  }catch(e){
    console.error(e);
    referralState={code:'',discount:0};
    note.textContent='Could not verify this referral code.';
    note.style.color='#b42318';
    render();
  }finally{
    button.disabled=false;button.textContent='Apply';
  }
}
async function loadSite(){
  if(!d1)return;
  const{data}=await d1.from('site_settings').select('store_name,logo_url').eq('id',1).maybeSingle();
  site=data||{};document.title='Checkout — '+(site.store_name||'GRABZONE');
  if(site.logo_url&&$('checkoutLogo'))$('checkoutLogo').src=site.logo_url;
}
async function hydrate(){
  const raw=getSource();
  if(!raw.length){render();return}
  if(!d1){checkoutItems=raw;render();return}
  const ids=[...new Set(raw.map(x=>x.product_id).filter(Boolean))];
  const{data,error}=await d1.from('products').select('id,name,price,image_url,published,vendor_id').in('id',ids);
  if(error){console.error(error);checkoutItems=raw;render();return}
  const map=new Map((data||[]).map(p=>[p.id,p]));
  checkoutItems=raw.map(x=>{
    const p=map.get(x.product_id);if(!p)return null;
    return{...x,product_id:p.id,name:p.name,image_url:p.image_url,price:Number(x.price??x.unit_price??p.price??0),quantity:Math.max(1,Number(x.quantity||1)),vendor_id:p.vendor_id,product_type:p.product_type}
  }).filter(Boolean);
  const variationItems=checkoutItems.filter(x=>x.variation_id);
  if(variationItems.length){
    await Promise.all(variationItems.map(async item=>{
      try{
        const r=await fetch('/api/marketplace/variations?product_id='+encodeURIComponent(item.product_id),{credentials:'include',cache:'no-store'});
        const d=await r.json().catch(()=>({}));
        const v=(d.variations||[]).find(x=>String(x.id)===String(item.variation_id));
        if(!v||String(v.status||'')!=='Available')throw new Error('This selected variation is no longer available.');
        const regular=Number(v.regular_price||v.price||0),sale=Number(v.sale_price||0);
        item.price=sale>0&&sale<regular?sale:regular;
        item.unit_price=item.price;
        item.image_url=v.image_url||item.image_url;
        item.sku=v.sku||item.sku||'';
        item.variation_options=v.options||item.variation_options||{};
      }catch(e){
        item.__variationError=e.message||'Selected variation is unavailable.';
      }
    }));
    const unavailable=checkoutItems.find(x=>x.__variationError);
    if(unavailable){
      msg(unavailable.__variationError,true);
      checkoutItems=checkoutItems.filter(x=>!x.__variationError);
      if(!checkoutItems.length){render();return}
    }
  }
  await loadMarketplaceShipping();
  render();
}
async function syncOrderToSheet(orderId){
  try{
    const response=await fetch((C.backendUrl||'')+'/api/sync-order-sheet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId})});
    if(!response.ok) console.warn('GrabZone Google Sheets sync:',await response.text().catch(()=>''));
  }catch(e){console.warn('GrabZone Google Sheets sync:',e)}
}

async function sendOrderEmail(orderNumber,type='order_created',orderData=null,itemsData=null){
  try{
    const response=await fetch((C.backendUrl||'')+'/api/send-order-email',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        orderNumber,
        type,
        order:orderData,
        items:Array.isArray(itemsData)?itemsData:[]
      })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Email could not be sent.');
    return true;
  }catch(e){
    console.error('GrabZone order email:',e);
    return false;
  }
}
function openOrderConfirm(d){
  return new Promise(resolve=>{
    const modal=$('orderConfirmModal');
    if(!modal){resolve(window.confirm('Please review your order details carefully before placing the order.'));return}
    const shipping=shippingForLocation();
    const total=Math.max(0,subtotal()+shipping-Number(referralState.discount||0)-Number(rewardsVoucherState.discount||0)-Math.min(subtotal(),subtotal()*Number(mysteryState.discount||0)/100));
    const address=[d.address,d.upazila,d.district,d.division].filter(Boolean).join(', ');
    $('confirmCustomer').textContent=d.customer_name||'—';
    $('confirmPhone').textContent=d.phone||'—';
    $('confirmAddress').textContent=address||'—';
    $('confirmTotal').textContent=money(total);
    const ok=modal.querySelector('[data-confirm-ok]');
    const cancel=modal.querySelectorAll('[data-confirm-cancel]');
    const finish=value=>{
      modal.hidden=true;
      modal.setAttribute('aria-hidden','true');
      document.body.style.overflow='';
      ok?.removeEventListener('click',onOk);
      cancel.forEach(x=>x.removeEventListener('click',onCancel));
      document.removeEventListener('keydown',onKey);
      resolve(value);
    };
    const onOk=()=>finish(true);
    const onCancel=()=>finish(false);
    const onKey=e=>{if(e.key==='Escape')finish(false)};
    ok?.addEventListener('click',onOk);
    cancel.forEach(x=>x.addEventListener('click',onCancel));
    document.addEventListener('keydown',onKey);
    modal.hidden=false;
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    requestAnimationFrame(()=>ok?.focus());
  });
}

async function submit(e){
  e.preventDefault();
  const d=formData(),bad=validate(d);
  if(bad){msg(bad,true);return}
  if(d.referral_code!==referralState.code){
    await applyReferral();
    if(d.referral_code&&!referralState.code){msg('Please apply a valid referral code or remove it.',true);return}
  }
  d.phone=d.phone.replace(/\D/g,'');
  const confirmed=await openOrderConfirm(d);
  if(!confirmed)return;
  const b=$('placeOrderBtn');b.disabled=true;b.textContent='Placing order…';msg('');
  const shipping=shippingForLocation();
  const payload={
    customer_name:d.customer_name,email:d.email,phone:d.phone,division:d.division,
    district:d.district,upazila:d.upazila,address:d.address,
    referral_code:d.referral_code||null,rewards_voucher_code:d.rewards_voucher_code||null,payment_method:'Cash on Delivery',
    shipping_charge:shipping,
    items:checkoutItems.map(i=>({product_id:i.product_id,product_name:i.name,image_url:i.image_url,quantity:Number(i.quantity),unit_price:Number(i.price),variation_id:i.variation_id||null,variation_options:i.variation_options||{} ,variation_sku:i.variation_sku||i.sku||''})),
    subtotal:subtotal(),referral_discount:Number(referralState.discount||0),mystery_token:mysteryState.token,grabpoints_opt_in:1,total:Math.max(0,subtotal()+shipping-Number(referralState.discount||0)-Number(rewardsVoucherState.discount||0)-Math.min(subtotal(),subtotal()*Number(mysteryState.discount||0)/100))
  };
  try{
    if(!d1)throw new Error('Order service is not configured.');
    const{data:order,error}=await d1.rpc('create_public_order',{payload});
    if(error)throw error;
    if(!order?.id||!order?.order_number)throw new Error('Order could not be created.');

    // Keep the customer record synchronized without making checkout fail if Google Sheets is temporarily unavailable.
    await syncOrderToSheet(order.id);

    // Some older create_public_order functions return only the order number.
    // Read the newly-created private tracking ID through the dedicated
    // SECURITY DEFINER RPC instead of exposing the orders table to customers.
    let privateTrackingId=String(order.public_tracking_id||'').trim();
    if(!privateTrackingId){
      const lookup=await d1.rpc('get_public_tracking_id',{p_order_id:order.id});
      if(!lookup.error) privateTrackingId=String(lookup.data||'').trim();
    }
    if(!privateTrackingId)throw new Error('Order was created, but the private Tracking ID could not be generated. Please contact GrabZone support.');

    localStorage.removeItem(CART_KEY);localStorage.removeItem(BUY_NOW_KEY);
    $('checkoutForm').hidden=true;$('checkoutSuccess').hidden=false;document.querySelector('.checkout-layout')?.classList.add('checkout-completed');const summaryCard=document.querySelector('.summary-card');if(summaryCard)summaryCard.hidden=true;
    $('successOrderNumber').textContent=order.order_number;
    $('successTrackingId').textContent=privateTrackingId;
    const trackLink=$('successTrackLink');
    if(trackLink) trackLink.href='https://grabzone.tech/track-order.html?tracking='+encodeURIComponent(privateTrackingId);
    const emailSent=await sendOrderEmail(
      order.order_number,
      'order_created',
      {
        ...order,
        customer_name:d.customer_name,
        email:d.email,
        phone:d.phone,
        division:d.division,
        district:d.district,
        upazila:d.upazila,
        address:d.address,
        payment_method:'Cash on Delivery',
        shipping_charge:shipping,
        subtotal:subtotal(),
        referral_discount:Number(referralState.discount||0),
        rewards_voucher_code:String(order.rewards_voucher_code||rewardsVoucherState.code||''),
        rewards_voucher_discount:Number(order.rewards_voucher_discount||rewardsVoucherState.discount||0),
        mystery_discount:Number(order.mystery_discount||0),
        total:Math.max(0,subtotal()+shipping-Number(referralState.discount||0)-Number(order.rewards_voucher_discount||rewardsVoucherState.discount||0)-Number(order.mystery_discount||0)),
        public_tracking_id:privateTrackingId
      },
      checkoutItems.map(i=>({
        product_name:i.name,
        quantity:Number(i.quantity||1),
        unit_price:Number(i.price||0),
        line_total:Number(i.price||0)*Number(i.quantity||1),
        image_url:i.image_url||''
      }))
    );
    $('successEmailNote').textContent=emailSent
      ?'A confirmation email has been sent to your email address. Our team will call you to verify the order.'
      :'Your order has been saved successfully. Our team will call you to verify the order.';

    // Keep customers on the checkout confirmation screen and show a complete, responsive order invoice.
    const invoiceBox=$('successInvoiceContent');
    if(invoiceBox){
      const invoiceSubtotal=subtotal();
      const invoiceReferral=Number(referralState.discount||0);
      const invoiceVoucher=Number(order.rewards_voucher_discount||rewardsVoucherState.discount||0);
      const invoiceMystery=Number(order.mystery_discount||Math.min(invoiceSubtotal,invoiceSubtotal*Number(mysteryState.discount||0)/100));
      const invoiceDiscount=invoiceReferral+invoiceVoucher+invoiceMystery;
      const invoiceTotal=Math.max(0,invoiceSubtotal+shipping-invoiceDiscount);
      const invoiceDate=new Date().toLocaleString('en-BD',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dhaka'});
      const invoiceItems=checkoutItems.map((item,index)=>'<tr><td class="success-invoice-product"><span class="success-invoice-index">'+(index+1)+'</span>'+(item.image_url?'<img src="'+esc(item.image_url)+'" alt="">':'')+'<div><strong>'+esc(item.name)+'</strong><small>🏬 Store: '+esc(item.vendor_name||item.brand_name||'GrabZone')+'</small><small>SKU: '+esc(item.variation_sku||item.sku||'—')+(item.variation_options&&typeof item.variation_options==='object'?' · '+Object.entries(item.variation_options).map(([k,v])=>esc(k)+': '+esc(v)).join(' · '):'')+'</small></div></td><td>'+money(item.price)+'</td><td>'+Number(item.quantity||1)+'</td><td><b>'+money(Number(item.price||0)*Number(item.quantity||1))+'</b></td></tr>').join('');
      invoiceBox.innerHTML='<div class="success-invoice-head"><div class="success-invoice-brand"><img src="'+esc(site.logo_url||'favicon.png')+'" alt="GrabZone"><span>Grab<strong>Zone</strong><small>GADGETS • FASHION • MORE FOR YOU</small></span></div><div class="success-invoice-title"><span>ORDER INVOICE</span><small>Thank you for shopping with GrabZone!</small><time>'+esc(invoiceDate)+'</time></div></div>'+
        '<div class="success-invoice-meta"><div><span>Order Number</span><b>'+esc(order.order_number)+'</b><span>Tracking ID</span><b>'+esc(privateTrackingId)+'</b></div><div><span>Payment Method</span><b>Cash on Delivery</b><span>Order Status</span><b class="success-invoice-status">● Processing</b></div></div>'+
        '<div class="success-invoice-customer"><div><h3>👤 Customer Information</h3><b>'+esc(d.customer_name)+'</b><p>☎ '+esc(d.phone)+'<br>✉ '+esc(d.email)+'</p></div><div><h3>📍 Shipping Address</h3><p>'+esc([d.address,d.upazila,d.district,d.division].filter(Boolean).join(', '))+'</p></div></div>'+
        '<div class="success-invoice-table-wrap"><table class="success-invoice-table"><thead><tr><th>Item</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead><tbody>'+invoiceItems+'</tbody></table></div>'+
        '<div class="success-invoice-summary"><div><span>Subtotal</span><b>'+money(invoiceSubtotal)+'</b></div><div><span>Shipping</span><b>'+money(shipping)+'</b></div>'+(invoiceDiscount?'<div><span>Discount</span><b>−'+money(invoiceDiscount)+'</b></div>':'')+'<div class="success-invoice-grand"><span>Total to Pay (Cash on Delivery)</span><b>'+money(invoiceTotal)+'</b></div></div>'+
        '<div class="success-invoice-thanks"><b>আপনার অর্ডারের জন্য ধন্যবাদ! 💚</b><span>আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে।</span></div>'+
        '<section class="success-invoice-barcodes"><div><h3>GrabZone Order Barcode</h3><svg id="successOrderBarcode" role="img" aria-label="Order barcode"></svg><small>'+esc(order.order_number)+'</small></div><div><h3>Tracking ID Barcode</h3><svg id="successTrackingBarcode" role="img" aria-label="Tracking ID barcode"></svg><small>'+esc(privateTrackingId)+'</small></div></section>'+
        '<section class="success-invoice-rewards"><div class="success-rewards-mark">GP</div><div class="success-rewards-copy"><strong>Grab<span>Points</span></strong><h3>কেনাকাটায় আরও বেশি সুবিধা পান!</h3><p>GrabPoints সংগ্রহ করুন এবং ভবিষ্যতের অর্ডারে রিওয়ার্ড ও সুবিধা উপভোগ করুন।</p><a href="https://grabzone.tech/grabpoints.html" target="_blank" rel="noopener noreferrer">🎁 Explore GrabPoints <span>→</span></a></div></section>'+
        '<footer class="success-invoice-footer"><div><b>🛟 Need Help?</b><a href="mailto:grabzonesupport@gmail.com">grabzonesupport@gmail.com</a></div><div><b>🌐 Visit Our Store</b><a href="https://grabzone.tech/" target="_blank" rel="noopener noreferrer">grabzone.tech</a></div><div><b>📲 Follow GrabZone</b><span class="success-social-links"><a href="https://www.facebook.com/grabzoneofficial/" target="_blank" rel="noopener noreferrer" aria-label="GrabZone Facebook"><span class="success-social-icon facebook">f</span> Facebook</a><a href="https://www.instagram.com/grabzoneofficial/" target="_blank" rel="noopener noreferrer" aria-label="GrabZone Instagram"><span class="success-social-icon instagram">◎</span> Instagram</a></span></div><small>© '+new Date().getFullYear()+' GrabZone. All rights reserved.</small></footer>';
    }
    if(window.JsBarcode){
      try{
        window.JsBarcode('#successOrderBarcode',String(order.order_number),{format:'CODE128',displayValue:false,lineColor:'#17284c',background:'#ffffff',width:1.6,height:48,margin:4});
        window.JsBarcode('#successTrackingBarcode',String(privateTrackingId),{format:'CODE128',displayValue:false,lineColor:'#17284c',background:'#ffffff',width:1.35,height:48,margin:4});
      }catch(barcodeError){console.warn('Order confirmation barcode could not be rendered:',barcodeError);}
    }
    const downloadInvoice=$('successDownloadInvoice');
    if(downloadInvoice)downloadInvoice.onclick=()=>window.print();
    // Keep the customer on this confirmation/invoice screen; tracking is available only by explicit button click.
    requestAnimationFrame(()=> $('checkoutSuccess')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }catch(err){
    console.error(err);msg(err.message||'Could not place your order. Please try again.',true);
    b.disabled=false;b.textContent='Confirm Order';
  }
}
loadGlobalShipping().then(()=>{try{render();renderDeliveryEta()}catch{}}).catch(()=>{});
document.addEventListener('DOMContentLoaded',async()=>{
  $('checkoutForm')?.addEventListener('submit',submit);
  $('division')?.addEventListener('change',onDivisionChange);
  $('district')?.addEventListener('change',onDistrictChange);
  bindLocationPickers();
  $('applyReferralBtn')?.addEventListener('click',applyReferral);
  async function applyRewardsVoucher(){
    const input=$('rewardsVoucherCode'),msgp=$('grabpointsMsg');
    const code=String(input?.value||'').trim().toUpperCase(),phone=String($('customerPhone')?.value||'').replace(/\D/g,'');
    if(!code){rewardsVoucherState={code:'',discount:0,value:0,expires_at:'',points_redeemed:0};if(msgp)msgp.textContent='Enter your reward voucher code.';render();return}
    if(!/^01[3-9]\d{8}$/.test(phone)){if(msgp)msgp.textContent='Enter your checkout phone number first.';return}
    if(!d1){if(msgp)msgp.textContent='Rewards service is not configured.';return}
    try{
      const{data,error}=await d1.rpc('validate_rewards_voucher',{p_code:code,p_phone:phone,p_subtotal:subtotal()});
      if(error)throw error;
      if(!data?.valid){rewardsVoucherState={code:'',discount:0,value:0,expires_at:'',points_redeemed:0};if(msgp)msgp.textContent='✕ '+(data?.message||'Invalid reward voucher.');render();return}
      rewardsVoucherState={code,discount:Number(data.discount||0),value:Number(data.value||0),expires_at:String(data.expires_at||''),points_redeemed:Number(data.points_redeemed||0)};
      if(msgp)msgp.textContent='✓ Reward applied — ৳'+Number(data.discount||0).toLocaleString('en-BD')+' off. One-time voucher.';
      render();
    }catch(e){rewardsVoucherState={code:'',discount:0,value:0,expires_at:'',points_redeemed:0};if(msgp)msgp.textContent='✕ '+(e.message||'Could not verify the reward voucher.');render()}
  }
  const rewardsLogin=$('grabpointsRewardsLogin');if(rewardsLogin){rewardsLogin.onclick=()=>window.GrabZoneRewards?.open?.();}
  $('applyRewardsVoucher')?.addEventListener('click',applyRewardsVoucher);
  $('rewardsVoucherCode')?.addEventListener('input',()=>{rewardsVoucherState={code:'',discount:0,value:0,expires_at:'',points_redeemed:0};const m=$('grabpointsMsg');if(m)m.textContent='Enter the code and press Apply Reward Voucher.';render()});
  $('customerPhone')?.addEventListener('input',()=>{rewardsVoucherState={code:'',discount:0,value:0,expires_at:'',points_redeemed:0};const b=$('grabpointsBalance');if(b)b.textContent='One-time reward vouchers';render()});
  $('grabpointsOptIn')?.addEventListener('change',()=>{const on=$('grabpointsOptIn').checked;const m=$('grabpointsMsg');if(m&&!on&&rewardsVoucherState.code)m.textContent='Your reward voucher can still be used; this checkbox only controls earning GP on this order.';render()});

  $('referralCode')?.addEventListener('input',()=>{referralState={code:'',discount:0};$('referralMessage').textContent='Enter the code and press Apply.';render()});
  loadMystery();await loadGrabPointsSettings();await loadLocations();await loadSite();await hydrate();await loadMarketplaceShipping();render();
});
})();