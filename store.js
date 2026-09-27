const galleryNavStyle = document.createElement("style");

galleryNavStyle.textContent = `
  .gallery-main {
    position: relative;
  }

  .gallery-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;

    width: 44px;
    height: 44px;

    border: none;
    border-radius: 50%;

    background: rgba(255,255,255,.92);
    color: #111;

    font-size: 32px;
    line-height: 1;

    display: flex;
    align-items: center;
    justify-content: center;

    cursor: pointer;

    box-shadow: 0 6px 20px rgba(0,0,0,.15);

    transition: transform .18s ease;
  }

  .gallery-nav:hover {
    transform: translateY(-50%) scale(1.06);
  }

  .gallery-nav:active {
    transform: translateY(-50%) scale(.94);
  }

  .gallery-nav-prev {
    left: 12px;
  }

  .gallery-nav-next {
    right: 12px;
  }

  @media (max-width: 600px) {
    .gallery-nav {
      width: 38px;
      height: 38px;
      font-size: 27px;
    }

    .gallery-nav-prev {
      left: 8px;
    }

    .gallery-nav-next {
      right: 8px;
    }
  }
`;

document.head.appendChild(galleryNavStyle);

let sb = null;
let allProducts = [];
let activeCategory = "All";
let SITE = {};

const C = window.GRABZONE_CONFIG || {};
sb = window.grabzoneD1 || null;

/* =========================================================
   HELPERS
========================================================= */

function esc(x) {
  return String(x ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m])
  );
}

function escAttr(x) {
  return esc(x).replace(/`/g, "&#96;");
}

function dmLink(text) {
  const base = SITE.whatsapp || C?.whatsapp || "";

  if (!base) return "#";

  return base + "?text=" + encodeURIComponent(text);
}

/* =========================================================
   SOCIAL LINKS — USE ADMIN PANEL SETTINGS
========================================================= */

function getSocialUrl(type) {
  if (type === "whatsapp") {
    return (
      SITE.whatsapp ||
      SITE.whatsapp_url ||
      SITE.whatsapp_link ||
      C?.whatsapp ||
      ""
    );
  }

  if (type === "instagram") {
    return (
      SITE.instagram ||
      SITE.instagram_url ||
      SITE.instagram_link ||
      C?.instagram ||
      ""
    );
  }

  if (type === "facebook") {
    return (
      SITE.facebook ||
      SITE.facebook_url ||
      SITE.facebook_link ||
      SITE.messenger ||
      C?.facebook ||
      C?.messenger ||
      ""
    );
  }

  return "";
}

/* =========================================================
   FAVICON — USE THE SAME LOGO FROM ADMIN PANEL
========================================================= */

function applyFavicon() {
  const logo =
    SITE.logo_url ||
    C?.logoUrl ||
    "";

  if (!logo) return;

  let favicon =
    document.querySelector('link[data-grabzone-favicon]');

  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.type = "image/png";
    favicon.setAttribute(
      "data-grabzone-favicon",
      "true"
    );
    document.head.appendChild(favicon);
  }

  favicon.href = logo;

  let appleIcon =
    document.querySelector(
      'link[data-grabzone-apple-icon]'
    );

  if (!appleIcon) {
    appleIcon = document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    appleIcon.setAttribute(
      "data-grabzone-apple-icon",
      "true"
    );
    document.head.appendChild(appleIcon);
  }

  appleIcon.href = logo;
}

/* =========================================================
   DM ORDER CHOOSER
========================================================= */

function ensureDMChooser() {
  if (document.getElementById("gzOrderChooser")) return;

  const style = document.createElement("style");

  style.id = "gzOrderChooserStyle";

  style.textContent = `
    #gzOrderChooser {
      position: fixed;
      inset: 0;
      z-index: 999999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(7px);
      -webkit-backdrop-filter: blur(7px);
    }

    #gzOrderChooser.gz-show {
      display: flex;
    }

    .gz-order-box {
      position: relative;
      width: min(390px, 100%);
      padding: 28px;
      background: #fff;
      border-radius: 24px;
      box-shadow: 0 25px 80px rgba(0,0,0,.25);
      animation: gzOrderIn .18s ease-out;
    }

    @keyframes gzOrderIn {
      from {
        opacity: 0;
        transform: translateY(12px) scale(.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .gz-order-close {
      position: absolute;
      top: 14px;
      right: 14px;
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 50%;
      background: #f1f1f1;
      color: #111;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
    }

    .gz-order-title {
      margin: 0 40px 7px 0;
      font-size: 22px;
      font-weight: 800;
      color: #111;
    }

    .gz-order-subtitle {
      margin: 0 0 20px;
      color: #777;
      font-size: 13px;
      line-height: 1.5;
    }

    .gz-order-options {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .gz-order-option {
      width: 100%;
      min-height: 56px;
      display: flex;
      align-items: center;
      gap: 13px;
      padding: 8px 14px;
      border: 1px solid #e5e5e5;
      border-radius: 15px;
      background: #fff;
      color: #111;
      cursor: pointer;
      font-family: inherit;
      text-align: left;
      transition: transform .15s ease, background .15s ease,
                  border-color .15s ease;
    }

    .gz-order-option:hover {
      transform: translateY(-1px);
      background: #f7f7f7;
      border-color: #ccc;
    }

    .gz-order-icon {
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 38px;
      border-radius: 11px;
      background: #111;
      color: #fff;
      font-size: 11px;
      font-weight: 900;
    }

    .gz-order-icon svg {
      width: 22px;
      height: 22px;
      display: block;
      fill: currentColor;
    }

    .gz-order-icon svg rect {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
    }

    .gz-order-icon svg circle {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
    }

    .gz-order-icon svg .gz-ig-dot {
      fill: currentColor;
      stroke: none;
    }

    .gz-wa-icon {
      background: #25D366;
    }

    .gz-ig-icon {
      background: linear-gradient(135deg, #833AB4, #E1306C, #FCAF45);
    }

    .gz-fb-icon {
      background: #1877F2;
    }

    .gz-order-text {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .gz-order-text strong {
      font-size: 14px;
      font-weight: 800;
    }

    .gz-order-text small {
      margin-top: 2px;
      color: #888;
      font-size: 11px;
    }

    .gz-order-arrow {
      color: #999;
      font-size: 18px;
    }

    @media (max-width: 600px) {
      #gzOrderChooser {
        align-items: flex-end;
        padding: 12px;
      }

      .gz-order-box {
        width: 100%;
        padding: 24px 18px;
        border-radius: 22px;
      }
    }
  `;

  document.head.appendChild(style);

  const modal = document.createElement("div");

  modal.id = "gzOrderChooser";

  modal.innerHTML = `
    <div class="gz-order-box" role="dialog" aria-modal="true">

      <button
        type="button"
        class="gz-order-close"
        aria-label="Close"
        id="gzOrderClose"
      >×</button>

      <h2 class="gz-order-title">
        Where would you like to order?
      </h2>

      <p class="gz-order-subtitle">
        Choose your preferred platform to message GrabZone.
      </p>

      <div class="gz-order-options">

        <button
          type="button"
          class="gz-order-option"
          id="gzWhatsApp"
        >
          <span class="gz-order-icon gz-wa-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <path d="M20.5 3.5A11.5 11.5 0 0 0 2.4 17.1L1 22.8l5.8-1.5A11.5 11.5 0 1 0 20.5 3.5Zm-8.5 18a9.9 9.9 0 0 1-5-1.3l-.4-.2-3.4.9.9-3.3-.2-.4A9.9 9.9 0 1 1 12 21.5Zm5.5-7.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.2-.2.3-.7.9-.8 1.1-.2.2-.3.2-.6.1-1.5-.7-2.6-1.3-3.7-3-.3-.5.3-.5.8-1.7.1-.2 0-.4 0-.5l-.8-1.9c-.2-.5-.4-.4-.7-.4h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1 2.9 1.2 3.1c.2.2 2 3.1 4.9 4.2 1.8.7 2.5.8 3.4.7.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.2-.1-.4-.2-.7-.3Z"/>
      </svg>
    </span>
          <span class="gz-order-text">
            <strong>WhatsApp</strong>
            <small>Chat with us on WhatsApp</small>
          </span>
          <span class="gz-order-arrow">→</span>
        </button>

        <button
          type="button"
          class="gz-order-option"
          id="gzInstagram"
        >
          <span class="gz-order-icon gz-ig-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <rect x="3" y="3" width="18" height="18" rx="5"/>
        <circle cx="12" cy="12" r="4.2"/>
        <circle cx="17.4" cy="6.7" r="1.15" class="gz-ig-dot"/>
      </svg>
    </span>
          <span class="gz-order-text">
            <strong>Instagram</strong>
            <small>Message us on Instagram</small>
          </span>
          <span class="gz-order-arrow">→</span>
        </button>

        <button
          type="button"
          class="gz-order-option"
          id="gzFacebook"
        >
          <span class="gz-order-icon gz-fb-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <path d="M13.8 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5H17V3.9c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 4v2.2H8.3v3h2.6v8h2.9Z"/>
      </svg>
    </span>
          <span class="gz-order-text">
            <strong>Facebook</strong>
            <small>Message us on Facebook</small>
          </span>
          <span class="gz-order-arrow">→</span>
        </button>

      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    modal.classList.remove("gz-show");
    document.body.style.overflow = "";
  };

  const open = () => {
    modal.classList.add("gz-show");
    document.body.style.overflow = "hidden";
  };

  const go = type => {
    const url = getSocialUrl(type);

    if (!url) {
      alert(
        "This contact option is not available right now."
      );
      return;
    }

    /*
      WhatsApp gets the current product/referral message
      through the existing order button href.
    */
    let finalUrl = url;

    if (
      type === "whatsapp" &&
      window.__grabzoneOrderMessage
    ) {
      finalUrl =
        url +
        (url.includes("?") ? "&" : "?") +
        "text=" +
        encodeURIComponent(
          window.__grabzoneOrderMessage
        );
    }

    window.open(
      finalUrl,
      "_blank",
      "noopener,noreferrer"
    );

    close();
  };

  document
    .getElementById("gzOrderClose")
    ?.addEventListener("click", close);

  document
    .getElementById("gzWhatsApp")
    ?.addEventListener("click", () => go("whatsapp"));

  document
    .getElementById("gzInstagram")
    ?.addEventListener("click", () => go("instagram"));

  document
    .getElementById("gzFacebook")
    ?.addEventListener("click", () => go("facebook"));

  modal.addEventListener("click", event => {
    if (event.target === modal) close();
  });

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      modal.classList.contains("gz-show")
    ) {
      close();
    }
  });

  window.__grabzoneOpenDMChooser = open;
}

/* =========================================================
   INTERCEPT ALL DM / ORDER BUTTONS
   Capture phase stops old direct-WhatsApp handlers.
========================================================= */

function bindDMChooser(id) {
  const button = document.getElementById(id);

  if (!button || button.dataset.gzDmBound === "1") return;

  button.dataset.gzDmBound = "1";

  button.addEventListener(
    "click",
    event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (window.__grabzoneOpenDMChooser) {
        window.__grabzoneOpenDMChooser();
      } else {
        ensureDMChooser();
        window.__grabzoneOpenDMChooser?.();
      }
    },
    true
  );
}

function setupDMChooser() {
  /*
    GrabZone now uses the automated website checkout.
    The old DM chooser is intentionally not bound to any
    customer-facing order button.
  */
  return;
}

/* =========================================================
   MAIN LOAD
========================================================= */

async function load() {
  if (!sb) {
    console.error("Database service is not configured.");
    return;
  }

  try {
    await loadSettings();
    applySiteSettings();

    /*
      Render the catalogue and the product detail FIRST.
      loadNotices() animates the marquee and waits on requestAnimationFrame,
      which never fires in a backgrounded/hidden tab — sequencing it ahead of
      renderDetail() left every product page stuck on "Loading product...".
      Notices are cosmetic, so they now run last and never block.
    */
    await loadProducts();
    await renderDetail();

    loadNotices().catch(error => {
      console.warn("Notice load skipped:", error);
    });
  } catch (error) {
    console.error("Website loading error:", error);
  }
}

/* =========================================================
   SITE SETTINGS
========================================================= */

async function loadSettings() {
  const { data, error } = await sb
    .from("site_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("Settings error:", error);
    return;
  }

  if (data) SITE = data;

  applyFavicon();
}

/* =========================================================
   TEXT / LINK HELPERS
========================================================= */

function setText(id, value) {
  const element = document.getElementById(id);

  if (
    element &&
    value !== null &&
    value !== undefined
  ) {
    element.textContent = value;
  }
}

/*
  site_settings stores the header links as bare in-page anchors ("#shop").
  Those anchors only exist on index.html, so on every other page the link did
  nothing. Prefix the homepage when the anchor is not present in this document.
*/
function gzResolveHeaderLink(value) {
  const url = String(value || "").trim();

  if (!url) return url;

  const anchor = url.match(/^#([A-Za-z0-9_-]+)$/);

  if (anchor && !document.getElementById(anchor[1])) {
    return "index.html" + url;
  }

  return url;
}

function setHref(id, value) {
  const element = document.getElementById(id);

  if (element && value) {
    element.href = value;
  }
}

/* =========================================================
   APPLY WEBSITE SETTINGS
========================================================= */

function applySiteSettings() {
  const storeName =
    SITE.store_name ||
    C?.storeName ||
    "GRABZONE";

  document.title = storeName;

  setText("storeName", storeName);
  setText("footerName", storeName);
  setText("heroBrand", storeName);

  setText("heroEyebrow", SITE.hero_eyebrow);
  setText("heroTitle", SITE.hero_title);
  setText("heroTitleEm", SITE.hero_title_em);
  setText("heroDescription", SITE.hero_description);

  setText("offerTitle", SITE.offer_title);
  setText("offerMessage", SITE.offer_message);
  setText("offerCode", SITE.offer_code);

  setText("collectionEyebrow", SITE.collection_eyebrow);
  setText("collectionTitle", SITE.collection_title);

  setText("howEyebrow", SITE.how_eyebrow);
  setText("howTitle", SITE.how_title);

  setText("step1Title", SITE.step1_title);
  setText("step1Body", SITE.step1_body);
  setText("step2Title", SITE.step2_title);
  setText("step2Body", SITE.step2_body);
  setText("step3Title", SITE.step3_title);
  setText("step3Body", SITE.step3_body);

  setText("referralEyebrow", SITE.referral_eyebrow);
  setText("referralTitle", SITE.referral_title);
  setText("referralBody", SITE.referral_body);
  setText("refDm", SITE.referral_button_text);
  setText("footerText", SITE.footer_text);

  setText("nav1", SITE.header_link1_label);
  setText("nav2", SITE.header_link2_label);
  setText("nav3", SITE.header_link3_label);

  setHref("nav1", gzResolveHeaderLink(SITE.header_link1_url));
  setHref("nav2", gzResolveHeaderLink(SITE.header_link2_url));
  setHref("nav3", SITE.header_link3_url);

  setText("heroButton", SITE.hero_button_text);
  setHref("heroButton", SITE.hero_button_link);

  setText("howButton", SITE.how_button_text);
  setHref("howButton", SITE.how_button_link);

  if (SITE.logo_url) {
    ["brandMark", "footerMark"].forEach(id => {
      const element = document.getElementById(id);

      if (!element) return;

      element.innerHTML = `
        <img
          src="${escAttr(SITE.logo_url)}"
          alt="${escAttr(storeName)}"
          style="
            width:100%;
            height:100%;
            object-fit:contain;
            border-radius:inherit;
          "
        >
      `;
      const logoImg = element.querySelector("img");
      if (logoImg) {
        logoImg.addEventListener("error",()=>{
          logoImg.remove();
          element.textContent = "GZ";
          element.style.fontWeight = "900";
          element.style.fontSize = "14px";
          element.style.color = "#fff";
          element.style.background = "#111";
        },{once:true});
      }
    });
  }

  /*
    Social footer links still use the Admin Panel settings.
    DM buttons are intentionally NOT assigned an href here,
    because setupDMChooser() controls them.
  */
  [
    ["wa", SITE.whatsapp || C?.whatsapp],
    ["ig", SITE.instagram || C?.instagram],
    ["ms", SITE.messenger || SITE.facebook || C?.messenger || C?.facebook]
  ].forEach(([id, url]) => {
    setHref(id, url || "#");
  });

  /*
    Remove any old direct destination from DM buttons.
    This prevents accidental direct WhatsApp navigation.
  */
  ["headerDm", "refDm", "orderBtn"].forEach(id => {
    const element = document.getElementById(id);

    if (!element) return;

    element.removeAttribute("href");
    element.removeAttribute("target");
    element.removeAttribute("rel");
    element.style.cursor = "pointer";
  });

  if (SITE.hero_image_url) {
    const hero = document.getElementById("heroCard");

    if (hero) {
      const heroUrl = String(SITE.hero_image_url || "").trim();
      hero.style.backgroundImage = "linear-gradient(135deg,#111820,#1b2630)";
      hero.style.backgroundSize = "cover";
      hero.style.backgroundPosition = "center";

      const probe = new Image();
      probe.onload = () => {
        hero.style.backgroundImage = `url("${escAttr(heroUrl)}")`;
      };
      probe.onerror = () => {
        hero.style.backgroundImage = "linear-gradient(135deg,#111820 0%,#1b2630 58%,#ff6b00 170%)";
      };
      probe.src = heroUrl;
    }
  }

  [
    ["noticeSection", SITE.show_notice],
    ["offers", SITE.show_offer],
    ["how", SITE.show_how],
    ["referralSection", SITE.show_referral]
  ].forEach(([id, value]) => {
    const element = document.getElementById(id);

    if (!element) return;

    element.style.display =
      value === false ? "none" : "";
  });
}

/* =========================================================
   PRODUCTS
========================================================= */

/* =========================================================
   PRODUCT DISPLAY ORDER
   Daily mode:
   - Same order for everyone during the same calendar day.
   - Order changes automatically on the next day.
   Manual mode:
   - Admin "Shuffle Now" changes the global seed.
========================================================= */

function gzDailyDateKey(){
  // GrabZone uses Bangladesh local calendar days for daily product rotation.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value || "";
  return get("year")+"-"+get("month")+"-"+get("day");
}

function gzHashString(value){
  let hash = 2166136261;

  const text = String(value ?? "");

  for(let i = 0; i < text.length; i++){
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function gzSeededRandom(seed){
  let state = gzHashString(seed) || 1;

  return function(){
    state = Math.imul(
      state ^ (state >>> 15),
      1 | state
    );

    state ^= state + Math.imul(
      state ^ (state >>> 7),
      61 | state
    );

    return (
      (state ^ (state >>> 14)) >>> 0
    ) / 4294967296;
  };
}

function gzShuffleProducts(products, seed){
  const result = [...products];
  const random = gzSeededRandom(seed);

  for(let i = result.length - 1; i > 0; i--){
    const j = Math.floor(
      random() * (i + 1)
    );

    [result[i], result[j]] =
      [result[j], result[i]];
  }

  return result;
}

function gzGetProductDisplaySeed(){
  const mode =
    String(
      SITE.product_display_mode || "daily"
    ).toLowerCase();

  const manualSeed =
    SITE.product_shuffle_seed ||
    "grabzone-manual";

  if(mode === "manual"){
    return `manual:${manualSeed}`;
  }

  return `daily:${gzDailyDateKey()}:${manualSeed}`;
}

async function loadProducts() {
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("published", true);

  if (error) {
    console.error("Products error:", error);
    allProducts = [];
    renderProducts();
    return;
  }

  const products = data || [];

  /*
    Shuffle before filtering so the homepage has a stable,
    deterministic daily order. Search/category filtering
    then preserves that order.
  */
  allProducts = gzShuffleProducts(
    products,
    gzGetProductDisplaySeed()
  );

  /* Phase 5 storefront features consume the live product list. */
  window.__grabzoneProducts = allProducts;

  renderProducts();
}

function renderProducts() {
  const grid = document.getElementById("products");

  if (!grid) return;

  const searchInput =
    document.getElementById("search");

  const query =
    (searchInput?.value || "")
      .trim()
      .toLowerCase();

  const selectedCategory =
    String(activeCategory || "All")
      .trim()
      .toLowerCase();

  /*
    Bangla search.
    The catalogue is named in English, so a Bangla query used to match nothing.
    Each Bangla term below maps to the English words the products actually use;
    a query token matches when any of its synonyms appears in the searchable
    text. English queries are untouched — they still go through the exact same
    substring test first.
  */
  const GZ_BN_SYNONYMS = {
    "ঘড়ি": ["watch", "smartwatch", "tissot", "combo"],
    "জুতা": ["shoe", "shoes", "sneaker", "sandal", "keds"],
    "শার্ট": ["shirt", "polo", "tshirt"],
    "পাঞ্জাবি": ["panjabi", "punjabi", "kurta"],
    "বোরকা": ["borkha", "burqa", "abaya", "koti", "gown", "hijab"],
    "বুর্কা": ["borkha", "burqa", "abaya", "koti", "gown", "hijab"],
    "হিজাব": ["hijab", "borkha", "abaya"],
    "ইয়ারফোন": ["earbuds", "earphone", "headphone", "buds", "plextone"],
    "ইয়ারফোনস": ["earbuds", "earphone", "headphone", "buds"],
    "হেডফোন": ["headphone", "headset", "earphone"],
    "স্পিকার": ["speaker", "sound", "boombox", "subwoofer"],
    "পাওয়ার ব্যাংক": ["power bank", "powerbank", "power", "baseus"],
    "পাওয়ারব্যাংক": ["power bank", "powerbank", "power"],
    "চার্জার": ["charger", "charging", "adapter"],
    "ফ্যান": ["fan", "cooler"],
    "কুলার": ["cooler", "fan"],
    "লাইট": ["light", "lamp", "led", "bulb"],
    "বাতি": ["light", "lamp", "led", "bulb"],
    "লাইটিং": ["light", "lamp", "led"],
    "সোলার": ["solar", "panel"],
    "কেটলি": ["kettle", "heater"],
    "গিমবাল": ["gimbal", "stabilizer"],
    "মাউস": ["mouse"],
    "কীবোর্ড": ["keyboard"],
    "ক্যামেরা": ["camera"],
    "পারফিউম": ["perfume", "attar"],
    "ব্যাগ": ["bag", "backpack"],
    "মোবাইল": ["mobile", "phone", "smartphone"],
    "ফোন": ["phone", "mobile", "smartphone"],
    "ল্যাপটপ": ["laptop", "notebook"],
    "স্ট্যান্ড": ["stand", "holder", "mount"],
    "চশমা": ["sunglasses", "sunglass", "glasses", "glass"],
    "ছাতা": ["umbrella"],
    "রাউটার": ["router", "hotspot", "wifi", "modem"],
    "ঘড়ির": ["watch", "smartwatch"],
    "পাওয়ার": ["power", "powerbank"],
    "ঘড়ি-ব্যান্ড": ["watch", "strap"],
    "খেলনা": ["toy", "toys"],
    "গেমিং": ["gaming", "game", "gamer"],
    "ইলেকট্রনিক্স": ["electronics"],
    "ফ্যাশন": ["fashion"],
    "এক্সেসরিজ": ["accessories", "accessory"],
    "বিউটি": ["beauty"],
    "কিচেন": ["kitchen"],
    "রান্নাঘর": ["kitchen"],
    "ডেকোরেটিং": ["decorating", "decor", "decoration"],
    "হোম": ["home", "household"],
    "অফার": ["offer", "sale", "discount"],
    "ছাড়": ["discount", "offer", "sale"]
  };

  const gzQueryTokens = query.split(/\s+/).filter(Boolean);

  /*
    English synonyms must match as whole words: a plain substring test made
    "light" hit "lightweight" and "power" hit "powerful", so a Bangla query for
    a lamp returned half the catalogue.
  */
  const gzWordPattern = (word) => {
    const escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const isAscii = /^[a-z0-9]+$/i.test(word);

    return isAscii
      ? new RegExp("(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)", "i")
      : new RegExp(escaped, "i");
  };

  const gzBanglaMatch = (haystack) =>
    gzQueryTokens.some(token => {
      const synonyms = GZ_BN_SYNONYMS[token];

      if (!synonyms) return false;

      return synonyms.some(word => gzWordPattern(word).test(haystack));
    });

  const filtered = allProducts.filter(product => {
    const category =
      String(product.category || "")
        .trim()
        .toLowerCase();

    const categoryMatches =
      selectedCategory === "all" ||
      category === selectedCategory;

    const searchableText = `
      ${product.name || ""}
      ${product.category || ""}
      ${product.description || ""}
      ${product.tag || ""}
    `.toLowerCase();

    return (
      categoryMatches &&
      (searchableText.includes(query) || gzBanglaMatch(searchableText))
    );
  });

  grid.innerHTML = filtered.map(product => {
    const now=Date.now();
    const starts=product.flash_starts_at ? Date.parse(product.flash_starts_at) : NaN;
    const ends=product.flash_ends_at ? Date.parse(product.flash_ends_at) : NaN;
    const flashActive=!!product.flash_enabled && Number(product.flash_price)>0 && Number(product.flash_price)<Number(product.price||0) && (!Number.isFinite(starts)||now>=starts) && Number.isFinite(ends) && now<ends;
    const displayPrice=flashActive ? Number(product.flash_price) : Number(product.price||0);
    const dropStart=product.drop_starts_at ? Date.parse(product.drop_starts_at) : NaN,dropEnd=product.drop_ends_at ? Date.parse(product.drop_ends_at) : NaN;const dropActive=!!product.drop_enabled&&Number.isFinite(dropEnd)&&Date.now()<dropEnd&&(!Number.isFinite(dropStart)||Date.now()>=dropStart);
    const price=displayPrice.toLocaleString();
    const oldPrice=flashActive
      ? '<span class="old">৳'+Number(product.price||0).toLocaleString()+'</span>'
      : (product.old_price ? '<span class="old">৳'+Number(product.old_price).toLocaleString()+'</span>' : "");

    const tag = product.tag
      ? `
        <span class="product-tag">
          ${esc(product.tag)}
        </span>
      `
      : "";

    return `
      <a
        class="product-card"
        href="product.html?id=${encodeURIComponent(product.id)}"
      >
        <div class="product-image">
          <img
            src="${escAttr(product.image_url)}"
            alt="${escAttr(product.name)}"
            loading="lazy"
            decoding="async"
          >
        </div>

        <div class="product-info">
          <div class="product-cat">
            ${esc(product.category)}
          </div>

          <div class="product-name">
            ${esc(product.name)}
          </div>

          ${tag}

          ${dropActive ? '<div class="gz-drop-badge" data-drop-end="'+escAttr(product.drop_ends_at)+'">⚡ NEW DROP <span class="gz-drop-countdown">--:--:--</span></div>' : ""}
${flashActive ? '<div class="gz-flash-sale" data-flash-end="'+escAttr(product.flash_ends_at)+'">🔥 FLASH SALE <span class="gz-flash-countdown">--:--:--</span></div>' : ""}

          <div class="price">
            ৳${price}
            ${oldPrice}
          </div>
        </div>
      </a>
    `;
  }).join("");

  const empty =
    document.getElementById("empty");

  if (empty) {
    empty.classList.toggle(
      "hidden",
      filtered.length > 0
    );
  }

  renderCategories();
  initFlashCountdowns();
  initDropCountdowns();
}

function initFlashCountdowns(){
  document.querySelectorAll('.gz-flash-sale[data-flash-end]').forEach(el=>{
    if(el.dataset.gzTimer==='1')return;
    el.dataset.gzTimer='1';
    const end=Date.parse(el.dataset.flashEnd);
    const tick=()=>{
      const left=Math.max(0,end-Date.now());
      if(left<=0){el.textContent='🔥 FLASH SALE ENDED';return;}
      const h=Math.floor(left/3600000),m=Math.floor(left%3600000/60000),sec=Math.floor(left%60000/1000);
      const pad=n=>String(n).padStart(2,'0');
      const cd=el.querySelector('.gz-flash-countdown');if(cd)cd.textContent=pad(h)+':'+pad(m)+':'+pad(sec);
      setTimeout(tick,1000);
    };tick();
  });
}

function initDropCountdowns(){document.querySelectorAll('.gz-drop-badge[data-drop-end]').forEach(function(el){if(el.dataset.gzTimer==='1')return;el.dataset.gzTimer='1';const end=Date.parse(el.dataset.dropEnd);const tick=()=>{const left=Math.max(0,end-Date.now());if(left<=0){el.textContent='⚡ DROP ENDED';return}const h=Math.floor(left/3600000),m=Math.floor(left%3600000/60000),sec=Math.floor(left%60000/1000),pad=n=>String(n).padStart(2,'0'),cd=el.querySelector('.gz-drop-countdown');if(cd)cd.textContent=pad(h)+':'+pad(m)+':'+pad(sec);setTimeout(tick,1000)};tick()})}
function renderCategories() {
  const container =
    document.getElementById("categories");

  if (!container) return;

  const categories = [
    "All",
    ...new Set(
      allProducts
        .map(product =>
          String(
            product.category || ""
          ).trim()
        )
        .filter(Boolean)
    )
  ];

  container.innerHTML = "";

  categories.forEach(category => {
    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "chip";

    if (
      String(category).toLowerCase() ===
      String(activeCategory).toLowerCase()
    ) {
      button.classList.add("active");
    }

    button.textContent = category;

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      activeCategory = category;
      renderProducts();
    });

    container.appendChild(button);
  });
}

function setupSearch() {
  const search =
    document.getElementById("search");

  if (!search) return;

  search.addEventListener(
    "input",
    renderProducts
  );
}

/* =========================================================
   NOTICE BOARD
   FINAL — single sequence, no clone, no CSS-keyframe conflict
========================================================= */

async function loadNotices() {
  const track = document.getElementById("noticeTrack");

  if (!track || !sb) return;

  const { data, error } = await sb
    .from("notices")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  if (error) {
    console.error("Notice error:", error);
    track.innerHTML = "";
    return;
  }

  const notices = data || [];

  if (!notices.length) {
    track.innerHTML = "";
    return;
  }

  /* Cancel any previous notice animation. */
  if (window.__grabzoneNoticeAnimation) {
    try {
      window.__grabzoneNoticeAnimation.cancel();
    } catch (e) {
      console.warn("Could not cancel previous notice animation:", e);
    }
    window.__grabzoneNoticeAnimation = null;
  }

  /* Cleanly replace only our notice styles. */
  document.getElementById("gzNoticeStyle")?.remove();

  const style = document.createElement("style");
  style.id = "gzNoticeStyle";

  style.textContent = `
    #noticeTrack {
      position: relative !important;
      overflow: hidden !important;
      width: 100% !important;
      min-width: 0 !important;
      height: 100% !important;
      display: block !important;
      white-space: nowrap !important;
    }

    #gzNoticeMoving {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;

      display: inline-flex !important;
      align-items: center !important;

      width: max-content !important;
      min-width: max-content !important;
      height: 100% !important;

      margin: 0 !important;
      padding: 0 !important;

      white-space: nowrap !important;

      /* Do NOT put transform here.
         Web Animations API controls it. */
      animation: none !important;
      transition: none !important;

      will-change: transform !important;
    }

    .gzNoticeItem {
      display: inline-flex !important;
      align-items: center !important;

      flex: 0 0 auto !important;
      width: max-content !important;
      min-width: max-content !important;

      margin: 0 100px 0 0 !important;
      padding: 0 !important;

      white-space: nowrap !important;

      font-size: 13px !important;
      line-height: 1 !important;
    }

    .gzNoticeItem b {
      display: inline-block !important;
      flex: 0 0 auto !important;

      margin: 0 12px 0 0 !important;
      padding: 0 !important;

      font-weight: 900 !important;
      white-space: nowrap !important;
    }

    .gzNoticeMessage {
      display: inline-block !important;
      flex: 0 0 auto !important;
      white-space: nowrap !important;
    }

    .gzNoticeItem::before,
    .gzNoticeItem::after {
      content: none !important;
      display: none !important;
    }

    @media (max-width: 600px) {
      .gzNoticeItem {
        margin-right: 60px !important;
        font-size: 10px !important;
      }

      .gzNoticeItem b {
        margin-right: 8px !important;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      #gzNoticeMoving {
        animation: none !important;
      }
    }
  `;

  document.head.appendChild(style);

  /*
    IMPORTANT:
    Only ONE copy of the database notices is rendered.
    We intentionally do NOT clone the list.
  */
  const html = notices.map(notice => `
    <span class="gzNoticeItem">
      <b>${esc(notice.title)}</b>
      <span class="gzNoticeMessage">${esc(notice.message)}</span>
    </span>
  `).join("");

  track.innerHTML = `
    <div id="gzNoticeMoving">${html}</div>
  `;

  const moving = document.getElementById("gzNoticeMoving");

  if (!moving) return;

  /*
    Wait for layout so the real rendered width can be measured.
  */
  await new Promise(resolve => {
    /*
      requestAnimationFrame does not fire in a backgrounded tab, so never
      wait on it without a fallback timer.
    */
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 150);
    requestAnimationFrame(() => requestAnimationFrame(finish));
  });

  const trackWidth = track.getBoundingClientRect().width;
  const noticeWidth = moving.getBoundingClientRect().width;

  if (!trackWidth || !noticeWidth) {
    console.warn("GrabZone notice could not be measured.");
    return;
  }

  /*
    Start completely outside the RIGHT edge.
    The first character therefore never starts in the middle.
  */
  const startX = trackWidth;

  /*
    Finish completely outside the LEFT edge.
  */
  const endX = -noticeWidth;

  const distance = startX - endX;

  /*
    Notice speed in pixels/second.
    Faster than the previous version.
  */
  const speed = window.innerWidth <= 600 ? 130 : 165;

  /*
    No artificial 30-second/long startup delay.
    The animation begins immediately.
  */
  const duration = Math.max(
    3000,
    (distance / speed) * 1000
  );

  /*
    Put the notice outside the right edge immediately.
    No -50% and no !important transform.
  */
  moving.style.transform =
    `translate3d(${startX}px, 0, 0)`;

  /*
    Animate ONE sequence.
    No duplicate/clone is created.
  */
  const startAnimation = () => {
    /*
      If another loadNotices() call replaced this animation,
      do not create another loop.
    */
    if (window.__grabzoneNoticeStopped) return;

    moving.style.transform =
      `translate3d(${startX}px, 0, 0)`;

    const animation = moving.animate(
      [
        {
          transform:
            `translate3d(${startX}px, 0, 0)`
        },
        {
          transform:
            `translate3d(${endX}px, 0, 0)`
        }
      ],
      {
        duration,
        iterations: 1,
        easing: "linear",
        fill: "forwards"
      }
    );

    window.__grabzoneNoticeAnimation = animation;

    /*
      Restart the SAME rendered list immediately after it
      has completely left the left edge.
    */
    animation.onfinish = () => {
      if (window.__grabzoneNoticeAnimation !== animation) return;
      startAnimation();
    };
  };

  window.__grabzoneNoticeStopped = false;
  startAnimation();
}

/* =========================================================
   PRODUCT DETAIL
========================================================= */

async function renderDetail() {
  const element =
    document.getElementById(
      "productDetail"
    );

  if (!element || !sb) return;

  const params =
    new URLSearchParams(
      window.location.search
    );

  const productId =
    params.get("id");

  if (!productId) return;

  const {
    data: product,
    error
  } = await sb
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("published", true)
    .maybeSingle();

  if (error || !product) {
    element.innerHTML =
      "<h1>Product not found</h1>";
    return;
  }

  const { data: images } =
    await sb
      .from("product_images")
      .select("*")
      .eq("product_id", productId)
      .order("sort_order");

  // Also read the public marketplace API so the storefront gallery uses the
  // same complete image set as the vendor/admin product editor.
  let marketplaceImages = [];
  try {
    const mr = await fetch("/api/marketplace/variations?product_id=" + encodeURIComponent(productId), {
      credentials: "include",
      cache: "no-store"
    });
    const md = await mr.json().catch(() => ({}));
    const apiUrls = Array.isArray(md?.product?.image_urls) ? md.product.image_urls : [];
    marketplaceImages = apiUrls.filter(Boolean).map(image_url => ({ image_url }));
  } catch {}

  /*
    Vendor editor stores the complete gallery in products.image_urls.
    Older products may not have product_images rows, so always use
    image_urls as the fallback (and merge it with any DB gallery rows).
  */
  const storedUrls = Array.isArray(product.image_urls)
    ? product.image_urls.filter(Boolean)
    : (typeof product.image_urls === "string"
        ? (() => { try { const x = JSON.parse(product.image_urls); return Array.isArray(x) ? x.filter(Boolean) : []; } catch { return []; } })()
        : []);

  const dbGallery = Array.isArray(images)
    ? images.filter(x => x && x.image_url)
    : [];

  const seenGallery = new Set();
  const gallery = [...dbGallery, ...marketplaceImages, ...storedUrls.map((image_url, i) => ({
    image_url,
    is_main: i === 0
  }))]
    .filter(x => {
      const url = String(x.image_url || "").trim();
      if (!url || seenGallery.has(url)) return false;
      seenGallery.add(url);
      return true;
    });

  if (!gallery.length && product.image_url) {
    gallery.push({
      image_url: product.image_url,
      is_main: true
    });
  }

  const currency =
    SITE.currency || "৳";

  document.title =
    product.name +
    " — " +
    (
      SITE.store_name ||
      "GRABZONE"
    );

  element.innerHTML = `
    <div class="detail-grid">

      <div class="gallery">

        <div class="gallery-thumbs">

          ${gallery.map(
            (image, index) => `
              <button
                type="button"
                class="gallery-thumb ${
                  index === 0
                    ? "active"
                    : ""
                }"
                onclick="
                  showGalleryImage(${index});
                  return false;
                "
              >
                <img
                  src="${escAttr(
                    image.image_url
                  )}"
                  alt="${escAttr(
                    product.name
                  )} ${index + 1}"
                >
              </button>
            `
          ).join("")}

        </div>

       <div class="gallery-main">

  <button
    type="button"
    class="gallery-nav gallery-nav-prev"
    aria-label="Previous image"
    onclick="galleryPrevious(); return false;"
  >
    ‹
  </button>

  <img
    id="mainProductImage"
    src="${escAttr(
      gallery[0].image_url
    )}"
    alt="${escAttr(
      product.name
    )}"
  >

  <button
    type="button"
    class="gallery-nav gallery-nav-next"
    aria-label="Next image"
    onclick="galleryNext(); return false;"
  >
    ›
  </button>

</div>

      </div>

      <div>

        <div class="eyebrow">
          ${esc(product.category)}
        </div>

        <h1>
          ${esc(product.name)}
        </h1>

        ${
          product.tag
            ? `
              <span class="tag">
                ${esc(product.tag)}
              </span>
            `
            : ""
        }

        <div class="detail-price">

          ${esc(currency)}
          ${Number(
            product.price
          ).toLocaleString()}

          ${
            product.old_price
              ? `
                <span class="old">

                  ${esc(currency)}
                  ${Number(
                    product.old_price
                  ).toLocaleString()}

                </span>
              `
              : ""
          }

        </div>

        <div class="detail-desc">
          ${esc(
            product.description || ""
          )}
        </div>

        <div class="dm-box">
          <button
            type="button"
            class="btn btn-dark btn-full"
            id="orderBtn"
          >
            View Cart
          </button>
        </div>

      </div>

    </div>
  `;

  window.__gallery =
    gallery;
  window.__gzProductRendered = true;
  window.dispatchEvent(new Event('grabzone:product-rendered'));
  if(typeof window.GZMountCustomerVariations==='function') window.GZMountCustomerVariations();

  const orderButton =
    document.getElementById(
      "orderBtn"
    );

  function updateOrderLink() {
    if (orderButton) orderButton.textContent = "View Cart";
  }

  if (orderButton) {
    updateOrderLink();
    orderButton.addEventListener("click", event => {
      event.preventDefault();
      if (window.GrabZoneCart?.open) {
        window.GrabZoneCart.open();
      } else {
        window.location.href = "index.html";
      }
    });
  }

  // Marketplace variable-product UI is mounted here, after the real product
  // has rendered. This is intentionally self-contained so Buy Now/Add to Cart
  // never depends on a secondary injected script winning a race.
}

/* =========================================================
   PRODUCT GALLERY
========================================================= */


/* =========================================================
   PRODUCT GALLERY NEXT / PREVIOUS
========================================================= */

let currentGalleryIndex = 0;

function galleryNext() {
  const gallery = window.__gallery || [];

  if (gallery.length <= 1) return;

  currentGalleryIndex =
    (currentGalleryIndex + 1) % gallery.length;

  showGalleryImage(currentGalleryIndex);
}

function galleryPrevious() {
  const gallery = window.__gallery || [];

  if (gallery.length <= 1) return;

  currentGalleryIndex =
    (currentGalleryIndex - 1 + gallery.length) %
    gallery.length;

  showGalleryImage(currentGalleryIndex);
}

function showGalleryImage(index) {
    const gallery =
        window.__gallery || [];

    if (!gallery[index]) return;

    currentGalleryIndex = index;

    const mainImage =
        document.getElementById(
            "mainProductImage"
        );

    if (mainImage) {
        mainImage.src =
            gallery[index].image_url;
    }

    document
        .querySelectorAll(
            ".gallery-thumb"
        )
        .forEach((thumb, i) => {
            thumb.classList.toggle(
                "active",
                i === index
            );
        });
}

/* =========================================================
   RESET CATEGORY
========================================================= */

function resetCategory() {
  activeCategory = "All";
  renderProducts();
}

/* =========================================================
   DOM READY
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    setupSearch();
    setupDMChooser();
    load();
  }
);
