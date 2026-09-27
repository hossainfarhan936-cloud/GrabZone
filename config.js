var _gzHost = String(window.location.hostname || '').toLowerCase();
var _gzDevWorker = _gzHost === 'vendor-system-dev-grabzone.nemesiseditzx984.workers.dev';
window.GRABZONE_CONFIG = {
  backendUrl: _gzDevWorker ? window.location.origin : "https://grabzone.nemesiseditzx984.workers.dev",
  storeName: "GRABZONE",
  tagline: "Grab What's Trending.",
  currency: "৳",
  /*
    One flat, vendor-configured delivery charge for the whole country.
    The old dhakaShippingCharge / outsideDhakaShippingCharge keys are gone on
    purpose: shipping must never be adjusted by the customer's city, district
    or division. Each vendor's own shipping_fee is what applies, and it is the
    same for every delivery address in Bangladesh.
  */
  shippingCharge: 130,
  /*
    Performance switch for the oversized R2 images (one banner alone is 888 KB).
    Leave false until Cloudflare Image Resizing is enabled on the grabzone.tech
    zone; then set it true and the card renderers will request
    /cdn-cgi/image/width=... ,format=auto/ variants instead of the originals.
    Enabling the feature on the zone is a Cloudflare configuration change and
    needs the owner's approval.
  */
  imageTransform: false,
  whatsapp: "https://wa.me/8801XXXXXXXXX",
  messenger: "https://m.me/yourpage",
  instagram: "https://instagram.com/yourstore"
};

/* Visual-only UI loader. Existing settings and application/business logic are untouched. */
(function(){
  function addCss(href, attr){
    if(document.querySelector('link['+attr+']')) return;
    var link=document.createElement('link');
    link.rel='stylesheet'; link.href=href; link.setAttribute(attr,'1');
    document.head.appendChild(link);
  }
  function addJs(src, attr){
    if(document.querySelector('script['+attr+']')) return;
    var s=document.createElement('script'); s.src=src; s.defer=true; s.setAttribute(attr,'1');
    document.head.appendChild(s);
  }
  addCss('grabzone-pro-commerce-ui.css','data-gz-pro-commerce-ui');
  addJs('grabzone-pro-commerce-ui.js','data-gz-pro-commerce-ui-js');
})();
