/* ===================================================================
   SENGOL LIBRARY — connects to the real Supabase "books" table.
   Replace nothing here manually — add/edit books from the Supabase
   Table Editor instead. This just reads whatever is in that table.
   =================================================================== */
const SUPABASE_URL = "https://ozyxzmucmjcxryctxsvu.supabase.co";
const SUPABASE_KEY = "sb_publishable_KeN1bq6b6t6kprxREVa6Iw_aR7Cl_qX";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let BOOKS = [];

async function loadBooksFromSupabase(){
  const grid = document.getElementById("bookGrid");
  grid.innerHTML = `<p class="empty-state">Loading books…</p>`;
  const { data, error } = await supabaseClient
    .from("books")
    .select("*")
    .order("created_at", { ascending:false });

  if(error){
    console.error("Supabase error:", error);
    grid.innerHTML = `<p class="empty-state">Could not load books right now. Please try again shortly.</p>`;
    BOOKS = [];
    return;
  }

  BOOKS = data.map(row=>({
    id: row.id,
    title: row.title,
    author: row.author,
    lang: row.language,
    cat: row.category,
    price: row.price,
    description: row.description
  }));

  renderBooks();
}

const COVER_STYLES = [
  "linear-gradient(160deg,#1c2747,#0d1220)",
  "linear-gradient(160deg,#2a2013,#12100a)",
  "linear-gradient(160deg,#241a33,#100c1a)",
  "linear-gradient(160deg,#132a26,#0b1614)",
  "linear-gradient(160deg,#2e1c1c,#140b0b)",
];

let activeFilter = "all";
let searchQuery = "";

const wishlist = new Set(JSON.parse(localStorage.getItem("sl_wishlist") || "[]"));
const cart = JSON.parse(localStorage.getItem("sl_cart") || "{}"); // {id: qty}

function saveState(){
  localStorage.setItem("sl_wishlist", JSON.stringify([...wishlist]));
  localStorage.setItem("sl_cart", JSON.stringify(cart));
}

/* ---------------- rendering ---------------- */
function coverStyle(id){
  let hash = 0;
  const str = String(id);
  for(let i=0;i<str.length;i++){
    hash = (hash*31 + str.charCodeAt(i)) >>> 0;
  }
  return COVER_STYLES[hash % COVER_STYLES.length];
}

function renderBooks(){
  const grid = document.getElementById("bookGrid");
  const empty = document.getElementById("emptyState");
  const q = searchQuery.trim().toLowerCase();

  const filtered = BOOKS.filter(b=>{
    const matchesCat = activeFilter === "all" || b.cat === activeFilter;
    const matchesQuery = !q || [b.title,b.author,b.cat,b.lang].some(f=>f.toLowerCase().includes(q));
    return matchesCat && matchesQuery;
  });

  grid.innerHTML = "";
  empty.hidden = filtered.length !== 0;

  filtered.forEach(b=>{
    const card = document.createElement("div");
    card.className = "book-card";
    card.innerHTML = `
      <div class="book-cover" style="background:${coverStyle(b.id)}">
        <div class="book-lang">${b.lang}</div>
        <span>${b.title}</span>
      </div>
      <div class="book-title">${b.title}</div>
      <div class="book-author">${b.author}</div>
      <div class="book-cat">${b.cat}</div>
      <div class="book-price">₹${b.price}</div>
      <div class="book-actions">
        <button class="wish-btn ${wishlist.has(b.id)?"active":""}" data-id="${b.id}">${wishlist.has(b.id)?"♥ Wishlisted":"♡ Wishlist"}</button>
        <button class="add-btn" data-id="${b.id}">Add to Cart</button>
      </div>
    `;
    card.querySelector(".book-cover").addEventListener("click",()=>openBookModal(b.id));
    card.querySelector(".book-title").addEventListener("click",()=>openBookModal(b.id));
    card.querySelector(".wish-btn").addEventListener("click",(e)=>{e.stopPropagation();toggleWishlist(b.id);});
    card.querySelector(".add-btn").addEventListener("click",(e)=>{e.stopPropagation();addToCart(b.id);});
    grid.appendChild(card);
  });
}

/* ---------------- book detail modal ---------------- */
function openBookModal(id){
  const b = BOOKS.find(x=>x.id===id);
  if(!b) return;
  document.getElementById("bookModalBody").innerHTML = `
    <button class="drawer-close" onclick="document.getElementById('bookModal').classList.remove('open')">&times;</button>
    <div class="bm-grid">
      <div class="bm-cover" style="background:${coverStyle(b.id)}"><span>${b.title}</span></div>
      <div>
        <p class="bm-meta">${b.lang} · ${b.cat}</p>
        <h3>${b.title}</h3>
        <p class="bm-meta">by ${b.author}</p>
        <p>${b.description ? b.description : "No description added yet for this book."}</p>
        <p class="book-price">₹${b.price}</p>
        <div class="hero-actions">
          <button class="btn btn-gold" onclick="addToCart('${b.id}')">Add to Cart</button>
          <button class="btn btn-outline" onclick="toggleWishlist('${b.id}');document.getElementById('bookModal').classList.remove('open')">Add to Wishlist</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("bookModal").classList.add("open");
}

/* ---------------- wishlist ---------------- */
function toggleWishlist(id){
  wishlist.has(id) ? wishlist.delete(id) : wishlist.add(id);
  saveState();
  renderBooks();
  renderWishlistDrawer();
  updateBadges();
}

function renderWishlistDrawer(){
  const body = document.getElementById("wishlistBody");
  if(wishlist.size === 0){
    body.innerHTML = `<p class="drawer-empty">Your wishlist is empty. Tap the heart on any book to save it here.</p>`;
    return;
  }
  body.innerHTML = "";
  [...wishlist].forEach(id=>{
    const b = BOOKS.find(x=>x.id===id);
    if(!b) return;
    const row = document.createElement("div");
    row.className = "drawer-item";
    row.innerHTML = `
      <div class="di-cover" style="background:${coverStyle(b.id)}"></div>
      <div class="di-info">
        <div class="di-title">${b.title}</div>
        <div class="di-meta">₹${b.price} · ${b.cat}</div>
        <button data-id="${b.id}" class="remove-wish">Remove</button>
      </div>
    `;
    row.querySelector(".remove-wish").addEventListener("click",()=>toggleWishlist(b.id));
    body.appendChild(row);
  });
}

/* ---------------- cart ---------------- */
function addToCart(id){
  cart[id] = (cart[id]||0)+1;
  saveState();
  renderCartDrawer();
  updateBadges();
  openDrawer("cartDrawer");
}

function changeQty(id,delta){
  if(!cart[id]) return;
  cart[id]+=delta;
  if(cart[id]<=0) delete cart[id];
  saveState();
  renderCartDrawer();
  updateBadges();
}

function renderCartDrawer(){
  const body = document.getElementById("cartBody");
  const foot = document.getElementById("cartFoot");
  const ids = Object.keys(cart);
  if(ids.length === 0){
    body.innerHTML = `<p class="drawer-empty">Your cart is empty. Add a few books from the catalogue.</p>`;
    foot.innerHTML = "";
    return;
  }
  body.innerHTML = "";
  let total = 0;
  ids.forEach(id=>{
    const b = BOOKS.find(x=>x.id===id);
    if(!b) return;
    const qty = cart[id];
    total += qty*b.price;
    const row = document.createElement("div");
    row.className = "drawer-item";
    row.innerHTML = `
      <div class="di-cover" style="background:${coverStyle(b.id)}"></div>
      <div class="di-info">
        <div class="di-title">${b.title}</div>
        <div class="di-meta">₹${b.price} × ${qty}</div>
        <div style="display:flex;gap:10px;margin-top:4px;">
          <button class="qty-minus" data-id="${b.id}">−</button>
          <button class="qty-plus" data-id="${b.id}">+</button>
          <button class="remove-cart" data-id="${b.id}">Remove</button>
        </div>
      </div>
    `;
    row.querySelector(".qty-minus").addEventListener("click",()=>changeQty(id,-1));
    row.querySelector(".qty-plus").addEventListener("click",()=>changeQty(id,1));
    row.querySelector(".remove-cart").addEventListener("click",()=>{delete cart[id];saveState();renderCartDrawer();updateBadges();});
    body.appendChild(row);
  });
  foot.innerHTML = `
    <div class="cart-total-row"><span>Total</span><span>₹${total}</span></div>
    <button class="btn btn-gold full" id="checkoutBtn">Proceed to Checkout</button>
    <p class="modal-note" style="margin-top:10px;">Secure checkout and payment will be connected in a later phase.</p>
  `;
  document.getElementById("checkoutBtn").addEventListener("click",()=>{
    showToast("Checkout is not connected yet — this is a preview of the cart flow only.");
  });
}

function updateBadges(){
  document.getElementById("wishlistCount").textContent = wishlist.size;
  document.getElementById("cartCount").textContent = Object.values(cart).reduce((a,b)=>a+b,0);
}

/* ---------------- drawers / scrim ---------------- */
function openDrawer(id){
  document.getElementById(id).classList.add("open");
  document.getElementById("scrim").classList.add("show");
}
function closeAllDrawers(){
  document.querySelectorAll(".drawer").forEach(d=>d.classList.remove("open"));
  document.getElementById("scrim").classList.remove("show");
}

/* ---------------- toast ---------------- */
let toastTimer;
function showToast(msg){
  const toast = document.getElementById("legalToast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toast.classList.remove("show"),3200);
}

/* ---------------- account modal ---------------- */
function openAccountModal(tab){
  document.getElementById("accountModal").classList.add("open");
  setAccountTab(tab || "login");
}
function setAccountTab(tab){
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  document.querySelectorAll(".tab-panel").forEach(p=>p.classList.toggle("active", p.id === "tab-"+tab));
}

/* ===================================================================
   EVENT WIRING
   =================================================================== */
document.addEventListener("DOMContentLoaded", ()=>{
  loadBooksFromSupabase();
  renderWishlistDrawer();
  renderCartDrawer();
  updateBadges();

  // category filter chips
  document.querySelectorAll(".filter-chip").forEach(chip=>{
    chip.addEventListener("click",()=>{
      activeFilter = chip.dataset.filter;
      document.querySelectorAll(".filter-chip").forEach(c=>c.classList.remove("active"));
      chip.classList.add("active");
      renderBooks();
    });
  });

  // category cards jump + filter
  document.querySelectorAll(".category-card").forEach(card=>{
    card.addEventListener("click",()=>{
      const f = card.dataset.filter;
      activeFilter = f;
      document.querySelectorAll(".filter-chip").forEach(c=>c.classList.toggle("active", c.dataset.filter===f));
      document.getElementById("catalogue").scrollIntoView({behavior:"smooth"});
      renderBooks();
    });
  });

  // search
  const searchBar = document.getElementById("searchBar");
  document.getElementById("searchToggle").addEventListener("click",()=>{
    searchBar.classList.add("open");
    setTimeout(()=>document.getElementById("searchInput").focus(),200);
  });
  document.getElementById("searchClose").addEventListener("click",()=>searchBar.classList.remove("open"));
  document.getElementById("searchInput").addEventListener("input",(e)=>{
    searchQuery = e.target.value;
    renderBooks();
    document.getElementById("catalogue").scrollIntoView({behavior:"smooth"});
  });

  // wishlist / cart drawers
  document.getElementById("wishlistToggle").addEventListener("click",()=>openDrawer("wishlistDrawer"));
  document.getElementById("cartToggle").addEventListener("click",()=>openDrawer("cartDrawer"));
  document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",closeAllDrawers));
  document.getElementById("scrim").addEventListener("click",closeAllDrawers);

  // account modal
  document.getElementById("accountToggle").addEventListener("click",()=>openAccountModal("login"));
  document.getElementById("accountToggleMobile").addEventListener("click",()=>openAccountModal("login"));
  document.querySelectorAll("[data-close-modal]").forEach(btn=>{
    btn.addEventListener("click",()=>document.getElementById(btn.dataset.closeModal).classList.remove("open"));
  });
  document.querySelectorAll(".tab-btn").forEach(btn=>{
    btn.addEventListener("click",()=>setAccountTab(btn.dataset.tab));
  });
  document.querySelectorAll("[data-goto]").forEach(link=>{
    link.addEventListener("click",(e)=>{
      e.preventDefault();
      openAccountModal(link.dataset.goto);
    });
  });

  // legal placeholder links
  document.querySelectorAll(".legal-link").forEach(link=>{
    link.addEventListener("click",(e)=>{
      e.preventDefault();
      showToast("This legal page is a placeholder and will be published before commercial launch.");
    });
  });

  // mobile menu
  const mobileMenu = document.getElementById("mobileMenu");
  document.getElementById("hamburger").addEventListener("click",()=>mobileMenu.classList.toggle("open"));
  document.querySelectorAll("#mobileMenu a").forEach(a=>a.addEventListener("click",()=>mobileMenu.classList.remove("open")));

  // close modals on outside click
  document.querySelectorAll(".modal").forEach(modal=>{
    modal.addEventListener("click",(e)=>{ if(e.target===modal) modal.classList.remove("open"); });
  });
});
