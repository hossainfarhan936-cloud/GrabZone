/* =========================================================
   GRABZONE BILLBOARD
   Public storefront billboard carousel.
========================================================= */

let GZ_BILLBOARDS = [];
let GZ_BILLBOARD_SETTINGS = {
  autoplay: true,
  interval_ms: 5000,
  transition: "slide",
  show_arrows: true,
  show_dots: true
};
let GZ_BILLBOARD_INDEX = 0;
let GZ_BILLBOARD_TIMER = null;
let GZ_BILLBOARD_TOUCH_X = 0;

function gzBillboardEsc(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}

/*
  Billboard rows live in D1 and were authored before the domain moved.
  Rewrite the retired hosts to the live one so a stored link can never send a
  customer to a dead address again.
*/
function gzBillboardCanonicalHost(value){
  return String(value || "")
    .replace(/^https?:\/\/(?:www\.)?grab-zone-ten\.vercel\.app/i, "https://grabzone.tech")
    .replace(/^https?:\/\/(?:www\.)?grabzone\.store/i, "https://grabzone.tech");
}

function gzBillboardNormalizeUrl(url){
  const value = gzBillboardCanonicalHost(String(url || "").trim());
  if(!value) return "";
  if(/^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("#")) return value;
  if(/^[a-z0-9_-]+\.html(?:\?|#|$)/i.test(value)) return value;
  return "https://" + value;
}

async function loadBillboards(){
  if(!sb) return;
  const [
    {data:slides,error:slideError},
    {data:settings,error:settingsError},
    {data:siteSettings,error:siteSettingsError}
  ] = await Promise.all([
    sb.from("billboards").select("*").eq("active",true).order("sort_order",{ascending:true}).order("created_at",{ascending:true}),
    sb.from("billboard_settings").select("*").eq("id",1).maybeSingle(),
    sb.from("site_settings").select("hero_image_url").eq("id",1).maybeSingle()
  ]);

  if(slideError){
    console.warn("Billboard error:", slideError.message);
    renderBillboardFallback();
    return;
  }

  if(settingsError){
    console.warn("Billboard settings error:", settingsError.message);
  } else if(settings){
    GZ_BILLBOARD_SETTINGS = {
      ...GZ_BILLBOARD_SETTINGS,
      ...settings
    };
  }

  if(siteSettingsError){
    console.warn("Site hero image error:", siteSettingsError.message);
  }

  const activeSlides = Array.isArray(slides) ? slides : [];
  const heroImage = String(siteSettings?.hero_image_url || "").trim();

  GZ_BILLBOARDS = heroImage
    ? [{
        id: "__site_hero__",
        image_url: heroImage,
        title: "",
        eyebrow: "",
        message: "",
        button_text: "",
        link_url: "",
        active: true,
        sort_order: -1
      }, ...activeSlides]
    : activeSlides;
  GZ_BILLBOARD_INDEX = Math.min(GZ_BILLBOARD_INDEX, Math.max(0,GZ_BILLBOARDS.length-1));
  renderBillboard();
}

function renderBillboardFallback(){
  const root=document.getElementById("billboard");
  if(!root) return;
  root.innerHTML = `
    <div class="gz-billboard-empty">
      <span>GRABZONE</span>
      <strong>Fresh deals are coming.</strong>
    </div>
  `;
  root.classList.add("is-empty");
}

function renderBillboard(){
  const root=document.getElementById("billboard");
  if(!root) return;

  clearBillboardTimer();

  if(!GZ_BILLBOARDS.length){
    renderBillboardFallback();
    return;
  }

  root.classList.remove("is-empty");
  root.innerHTML = `
    <div class="gz-billboard-viewport" aria-live="polite">
      <div class="gz-billboard-track"></div>
      <button class="gz-billboard-arrow gz-billboard-prev" type="button" aria-label="Previous deal">‹</button>
      <button class="gz-billboard-arrow gz-billboard-next" type="button" aria-label="Next deal">›</button>
      <div class="gz-billboard-dots" aria-label="Billboard slides"></div>
    </div>
  `;

  const track=root.querySelector(".gz-billboard-track");
  const dots=root.querySelector(".gz-billboard-dots");

  GZ_BILLBOARDS.forEach((item,i)=>{
    const link=gzBillboardNormalizeUrl(item.link_url);
    /* The stored label often already ends in an arrow; the markup adds one too. */
    const buttonText=String(item.button_text||"").replace(/\s*(?:→|➜|➝|->|=>)\s*$/,"").trim();
    const card=document.createElement(link ? "a" : "div");
    card.className="gz-billboard-slide";
    card.dataset.index=String(i);
    if(link){
      card.href=link;
      if(/^https?:\/\//i.test(link)) {
        card.target="_blank";
        card.rel="noopener";
      }
      card.setAttribute("aria-label", item.title || "View deal");
    }
    card.innerHTML=`
      <img src="${gzBillboardEsc(item.image_url)}" alt="${gzBillboardEsc(item.title || "GrabZone deal")}" loading="${i===0?"eager":"lazy"}">
      <div class="gz-billboard-overlay">
        <div class="gz-billboard-copy">
          ${item.eyebrow ? `<span>${gzBillboardEsc(item.eyebrow)}</span>` : ""}
          ${item.title ? `<strong>${gzBillboardEsc(item.title)}</strong>` : ""}
          ${item.message ? `<p>${gzBillboardEsc(item.message)}</p>` : ""}
          ${buttonText && link ? `<b>${gzBillboardEsc(buttonText)} <i>→</i></b>` : ""}
        </div>
      </div>
    `;
    track.appendChild(card);

    const img = card.querySelector("img");
    if(img){
      img.addEventListener("error",()=>{
        img.remove();
        card.classList.add("gz-billboard-image-fallback");
        const fallback=document.createElement("div");
        fallback.className="gz-billboard-fallback";
        fallback.innerHTML='<span>GRABZONE</span><strong>Grab what\'s trending.</strong><small>Fresh deals • Cash on Delivery</small>';
        card.insertBefore(fallback, card.firstChild);
      },{once:true});
    }

    const dot=document.createElement("button");
    dot.type="button";
    dot.className="gz-billboard-dot";
    dot.dataset.index=String(i);
    dot.setAttribute("aria-label", "Show slide "+(i+1));
    dots.appendChild(dot);
  });

  root.querySelector(".gz-billboard-prev").hidden = !(GZ_BILLBOARD_SETTINGS.show_arrows !== false && GZ_BILLBOARDS.length>1);
  root.querySelector(".gz-billboard-next").hidden = !(GZ_BILLBOARD_SETTINGS.show_arrows !== false && GZ_BILLBOARDS.length>1);
  dots.hidden = !(GZ_BILLBOARD_SETTINGS.show_dots !== false && GZ_BILLBOARDS.length>1);

  root.querySelector(".gz-billboard-prev").addEventListener("click",()=>changeBillboard(-1));
  root.querySelector(".gz-billboard-next").addEventListener("click",()=>changeBillboard(1));
  dots.addEventListener("click",e=>{
    const dot=e.target.closest(".gz-billboard-dot");
    if(dot) setBillboard(Number(dot.dataset.index), true);
  });

  const viewport=root.querySelector(".gz-billboard-viewport");
  viewport.addEventListener("touchstart",e=>{ GZ_BILLBOARD_TOUCH_X=e.changedTouches[0].clientX; },{passive:true});
  viewport.addEventListener("touchend",e=>{
    const dx=e.changedTouches[0].clientX-GZ_BILLBOARD_TOUCH_X;
    if(Math.abs(dx)>45) changeBillboard(dx<0?1:-1);
  },{passive:true});
  viewport.addEventListener("mouseenter",clearBillboardTimer);
  viewport.addEventListener("mouseleave",startBillboardTimer);

  setBillboard(GZ_BILLBOARD_INDEX,false);
}

function setBillboard(index,userAction){
  if(!GZ_BILLBOARDS.length) return;
  GZ_BILLBOARD_INDEX=(index+GZ_BILLBOARDS.length)%GZ_BILLBOARDS.length;

  const root=document.getElementById("billboard");
  if(!root) return;

  const track=root.querySelector(".gz-billboard-track");
  const transition=String(GZ_BILLBOARD_SETTINGS.transition || "slide").toLowerCase();
  root.dataset.transition=transition;

  if(transition==="fade"){
    track.querySelectorAll(".gz-billboard-slide").forEach((el,i)=>el.classList.toggle("active",i===GZ_BILLBOARD_INDEX));
  } else {
    track.style.transform=`translate3d(-${GZ_BILLBOARD_INDEX*100}%,0,0)`;
  }

  root.querySelectorAll(".gz-billboard-dot").forEach((el,i)=>el.classList.toggle("active",i===GZ_BILLBOARD_INDEX));
  startBillboardTimer();
}

function changeBillboard(direction){
  if(GZ_BILLBOARDS.length<2) return;
  setBillboard(GZ_BILLBOARD_INDEX+direction,true);
}

function clearBillboardTimer(){
  if(GZ_BILLBOARD_TIMER){
    clearInterval(GZ_BILLBOARD_TIMER);
    GZ_BILLBOARD_TIMER=null;
  }
}

function startBillboardTimer(){
  clearBillboardTimer();
  if(GZ_BILLBOARD_SETTINGS.autoplay===false || GZ_BILLBOARDS.length<2) return;
  const interval=Math.max(2500,Number(GZ_BILLBOARD_SETTINGS.interval_ms)||5000);
  GZ_BILLBOARD_TIMER=setInterval(()=>changeBillboard(1),interval);
}

document.addEventListener("DOMContentLoaded",()=>{
  loadBillboards();
});

(function(){
  function inject(){
    if(document.getElementById('gzStaticMarketplace'))return;
    const anchor=document.getElementById('billboard')||document.querySelector('main')||document.body;
    if(!anchor)return;
    const section=document.createElement('section');
    section.id='gzStaticMarketplace';
    section.style.cssText='max-width:1180px;margin:34px auto 50px;padding:0 18px;';
    section.innerHTML='<div style="border:1px solid #e7e7e3;border-radius:22px;padding:22px;background:#fff;box-shadow:0 12px 35px rgba(0,0,0,.05)"><div style="display:flex;justify-content:space-between;align-items:end;gap:18px;flex-wrap:wrap"><div><div style="font-size:10px;font-weight:900;letter-spacing:.16em;color:#ff6b00">GRABZONE MARKETPLACE</div><h2 style="margin:5px 0;font-size:clamp(24px,4vw,38px)">Shop by Brands</h2><p style="margin:0;color:#667085">Discover GrabZone and future partner brands in one place.</p></div><a href="marketplace.html" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:11px 16px;border-radius:12px;font-weight:800">View Marketplace →</a></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:18px"><a href="marketplace.html" style="text-decoration:none;color:#111;border:1px solid #ecece8;border-radius:16px;padding:16px;background:#fff"><div style="width:54px;height:54px;border-radius:14px;background:#111;color:#fff;display:grid;place-items:center;font-weight:900;font-size:20px">GZ</div><h3 style="margin:12px 0 4px">GrabZone</h3><p style="margin:0;color:#777;font-size:13px">Official GrabZone store</p></a><div style="border:1px dashed #d7d7d2;border-radius:16px;padding:16px;background:#fafaf8"><div style="font-size:11px;font-weight:900;color:#888;letter-spacing:.08em">COMING SOON</div><h3 style="margin:12px 0 4px">Partner Brands</h3><p style="margin:0;color:#777;font-size:13px">More brands will appear here as vendors join.</p></div></div></div>';
    anchor.insertAdjacentElement('afterend',section);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
  setTimeout(inject,800);setTimeout(inject,1800);
})();
