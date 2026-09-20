/* ===================================================================
   SENGOL LIBRARY — connects to the real Supabase "books" table.
   Books are managed from the Admin tab (visible only to admin users)
   or from the Supabase Table Editor. This reads whatever is in that table.

   Cart & Wishlist: guests use localStorage; logged-in users use the
   real Supabase `cart` / `wishlist` tables (synced across devices).
   Digital books = quantity is always 1 per book (no quantity picker).

   Reviews: public can read, logged-in users can post/update their own
   (one review per user per book) — via the `reviews` table.

   Book covers: uploaded by admin to the public `book-covers` storage
   bucket, URL stored in books.cover_url.

   Shareable book links: opening a book updates the URL to
   ?book=<id> (no page reload). Opening that URL directly (or a link
   someone shared) auto-opens that book's detail popup.
   =================================================================== */
const SUPABASE_URL = "https://ozyxzmucmjcxryctxsvu.supabase.co";
const SUPABASE_KEY = "sb_publishable_KeN1bq6b6t6kprxREVa6Iw_aR7Cl_qX";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let BOOKS = [];
let isAdmin = false;
let currentSession = null;

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
    description: row.description,
    coverUrl: row.cover_url || null
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

/* ---------------- cart / wishlist state ----------------
   Both are Sets of book ids. Logged-out = localStorage. Logged-in = Supabase. */
let wishlist = new Set();
let cart = new Set();

function loadGuestState(){
  wishlist = new Set(JSON.parse(localStorage.getItem("sl_wishlist") || "[]"));
  cart = new Set(JSON.parse(localStorage.getItem("sl_cart") || "[]"));
}
function saveGuestState(){
  localStorage.setItem("sl_wishlist", JSON.stringify([...wishlist]));
  localStorage.setItem("sl_cart", JSON.stringify([...cart]));
}
function clearGuestState(){
  localStorage.removeItem("sl_wishlist");
  localStorage.removeItem("sl_cart");
}

async function loadUserStateFromSupabase(userId){
  const [{ data: wishRows, error: wishErr }, { data: cartRows, error: cartErr }] = await Promise.all([
    supabaseClient.from("wishlist").select("book_id").eq("user_id", userId),
    supabaseClient.from("cart").select("book_id").eq("user_id", userId)
  ]);
  wishlist = new Set(wishErr ? [] : wishRows.map(r=>r.book_id));
  cart = new Set(cartErr ? [] : cartRows.map(r=>r.book_id));
}

async function mergeGuestStateIntoSupabase(userId){
  const guestWishlist = new Set(JSON.parse(localStorage.getItem("sl_wishlist") || "[]"));
  const guestCart = new Set(JSON.parse(localStorage.getItem("sl_cart") || "[]"));

  const wishRows = [...guestWishlist].map(book_id=>({ user_id:userId, book_id }));
  const cartRows = [...guestCart].map(book_id=>({ user_id:userId, book_id }));

  if(wishRows.length) await supabaseClient.from("wishlist").upsert(wishRows, { onConflict:"user_id,book_id" });
  if(cartRows.length) await supabaseClient.from("cart").upsert(cartRows, { onConflict:"user_id,book_id" });

  clearGuestState();
}

async function refreshCartWishlistUI(){
  renderBooks();
  renderWishlistDrawer();
  renderCartDrawer();
  updateBadges();
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

function coverInnerHtml(b){
  if(b.coverUrl){
    return `<img src="${b.coverUrl}" alt="${b.title}" style="width:100%;height:100%;object-fit:cover;">`;
  }
  return `<div class="book-lang">${b.lang}</div><span>${b.title}</span>`;
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
    const inCart = cart.has(b.id);
    const card = document.createElement("div");
    card.className = "book-card";
    card.innerHTML = `
      <div class="book-cover" style="${b.coverUrl ? "" : `background:${coverStyle(b.id)}`}">
        ${coverInnerHtml(b)}
      </div>
      <div class="book-title">${b.title}</div>
      <div class="book-author">${b.author}</div>
      <div class="book-cat">${b.cat}</div>
      <div class="book-price">₹${b.price}</div>
      <div class="book-actions">
        <button class="wish-btn ${wishlist.has(b.id)?"active":""}" data-id="${b.id}">${wishlist.has(b.id)?"♥ Wishlisted":"♡ Wishlist"}</button>
        <button class="add-btn" data-id="${b.id}">${inCart ? "In Cart" : "Add to Cart"}</button>
      </div>
    `;
    card.querySelector(".book-cover").addEventListener("click",()=>openBookModal(b.id));
    card.querySelector(".book-title").addEventListener("click",()=>openBookModal(b.id));
    card.querySelector(".wish-btn").addEventListener("click",(e)=>{e.stopPropagation();toggleWishlist(b.id);});
    card.querySelector(".add-btn").addEventListener("click",(e)=>{e.stopPropagation(); inCart ? removeFromCart(b.id) : addToCart(b.id);});
    grid.appendChild(card);
  });
}

/* ---------------- star helpers ---------------- */
function starString(rating){
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5-full);
}

/* ---------------- shareable book links ---------------- */
function bookLinkFor(id){
  return `${location.origin}${location.pathname}?book=${id}`;
}

function setBookInUrl(id){
  const url = new URL(location.href);
  url.searchParams.set("book", id);
  history.pushState({ book:id }, "", url);
}

function clearBookFromUrl(){
  const url = new URL(location.href);
  if(url.searchParams.has("book")){
    url.searchParams.delete("book");
    history.pushState({}, "", url);
  }
}

async function copyBookLink(id){
  const link = bookLinkFor(id);
  try{
    await navigator.clipboard.writeText(link);
    showToast("Link copied — share it anywhere.");
  } catch(err){
    showToast(link); // fallback: at least show it so they can select/copy manually
  }
}

function closeBookModal(){
  document.getElementById("bookModal").classList.remove("open");
  clearBookFromUrl();
}

async function openBookFromUrlIfPresent(){
  const params = new URLSearchParams(location.search);
  const id = params.get("book");
  if(id && BOOKS.some(b=>b.id===id)){
    await openBookModal(id, { updateUrl:false }); // URL already has it, don't push a duplicate entry
  }
}

/* ---------------- book detail modal (with reviews) ---------------- */
async function openBookModal(id, opts){
  const b = BOOKS.find(x=>x.id===id);
  if(!b) return;
  const inCart = cart.has(b.id);
  const updateUrl = !opts || opts.updateUrl !== false;

  document.getElementById("bookModalBody").innerHTML = `
    <button class="drawer-close" onclick="closeBookModal()">&times;</button>
    <div class="bm-grid">
      <div class="bm-cover" style="${b.coverUrl ? "" : `background:${coverStyle(b.id)}`}">${coverInnerHtml(b)}</div>
      <div>
        <p class="bm-meta">${b.lang} · ${b.cat}</p>
        <h3>${b.title}</h3>
        <p class="bm-meta">by ${b.author}</p>
        <p>${b.description ? b.description : "No description added yet for this book."}</p>
        <p class="book-price">₹${b.price}</p>
        <div class="hero-actions">
          <button class="btn btn-gold" onclick="${inCart ? `removeFromCart('${b.id}')` : `addToCart('${b.id}')`}">${inCart ? "Remove from Cart" : "Add to Cart"}</button>
          <button class="btn btn-outline" onclick="toggleWishlist('${b.id}');closeBookModal()">Add to Wishlist</button>
          <button class="btn btn-outline" onclick="copyBookLink('${b.id}')">Copy Link</button>
        </div>
      </div>
    </div>
    <div class="reviews-section" id="reviewsSection">
      <p class="modal-note">Loading reviews…</p>
    </div>
  `;
  document.getElementById("bookModal").classList.add("open");
  if(updateUrl) setBookInUrl(id);
  await renderReviewsSection(id);
}

async function renderReviewsSection(bookId){
  const wrap = document.getElementById("reviewsSection");
  if(!wrap) return;

  const { data: reviews, error } = await supabaseClient
    .from("reviews")
    .select("rating, comment, created_at, user_id")
    .eq("book_id", bookId)
    .order("created_at", { ascending:false });

  if(error){
    wrap.innerHTML = `<p class="modal-note">Could not load reviews right now.</p>`;
    return;
  }

  const count = reviews.length;
  const avg = count ? (reviews.reduce((s,r)=>s+r.rating,0)/count) : 0;
  const myReview = currentSession ? reviews.find(r=>r.user_id === currentSession.user.id) : null;

  const listHtml = count === 0
    ? `<p class="modal-note">No reviews yet — be the first to share your thoughts.</p>`
    : reviews.map(r=>`
        <div class="review-item">
          <div class="review-stars">${starString(r.rating)}</div>
          ${r.comment ? `<p class="review-comment">${escapeHtml(r.comment)}</p>` : ""}
          <p class="review-date">${new Date(r.created_at).toLocaleDateString()}</p>
        </div>
      `).join("");

  const formHtml = currentSession ? `
    <div class="review-form">
      <h4>${myReview ? "Update your review" : "Write a review"}</h4>
      <label>Rating
        <select id="reviewRating">
          ${[5,4,3,2,1].map(n=>`<option value="${n}" ${myReview && myReview.rating===n ? "selected":""}>${n} — ${starString(n)}</option>`).join("")}
        </select>
      </label>
      <label>Comment (optional)<textarea id="reviewComment" rows="2" placeholder="What did you think?">${myReview && myReview.comment ? escapeHtml(myReview.comment) : ""}</textarea></label>
      <button class="btn btn-gold full" id="reviewSubmitBtn">${myReview ? "Update Review" : "Post Review"}</button>
      <p class="auth-message" id="reviewMessage"></p>
    </div>
  ` : `<p class="modal-note">Log in to write a review.</p>`;

  wrap.innerHTML = `
    <h4>Ratings &amp; Reviews ${count ? `— ${avg.toFixed(1)} <span class="review-stars">${starString(avg)}</span> (${count})` : ""}</h4>
    ${formHtml}
    <div class="review-list">${listHtml}</div>
  `;

  const submitBtn = document.getElementById("reviewSubmitBtn");
  if(submitBtn){
    submitBtn.addEventListener("click", ()=>handleReviewSubmit(bookId));
  }
}

function escapeHtml(str){
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function handleReviewSubmit(bookId){
  if(!currentSession) return;
  const rating = parseInt(document.getElementById("reviewRating").value, 10);
  const comment = document.getElementById("reviewComment").value.trim();

  const msgEl = document.getElementById("reviewMessage");
  msgEl.textContent = "Saving…";
  msgEl.className = "auth-message";

  const { error } = await supabaseClient
    .from("reviews")
    .upsert(
      { user_id: currentSession.user.id, book_id: bookId, rating, comment: comment || null },
      { onConflict: "user_id,book_id" }
    );

  if(error){
    msgEl.textContent = error.message;
    msgEl.className = "auth-message error";
    return;
  }
  await renderReviewsSection(bookId);
}

/* ---------------- wishlist ---------------- */
async function toggleWishlist(id){
  const adding = !wishlist.has(id);
  adding ? wishlist.add(id) : wishlist.delete(id);
  refreshCartWishlistUI();

  if(currentSession){
    if(adding){
      const { error } = await supabaseClient.from("wishlist").insert({ user_id: currentSession.user.id, book_id: id });
      if(error){ wishlist.delete(id); refreshCartWishlistUI(); showToast("Could not update wishlist."); return; }
    } else {
      const { error } = await supabaseClient.from("wishlist").delete().eq("user_id", currentSession.user.id).eq("book_id", id);
      if(error){ wishlist.add(id); refreshCartWishlistUI(); showToast("Could not update wishlist."); return; }
    }
  } else {
    saveGuestState();
  }
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
      <div class="di-cover" style="${b.coverUrl ? `background-image:url('${b.coverUrl}');background-size:cover;` : `background:${coverStyle(b.id)}`}"></div>
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
async function addToCart(id){
  if(cart.has(id)){ openDrawer("cartDrawer"); return; }
  cart.add(id);
  refreshCartWishlistUI();
  openDrawer("cartDrawer");

  if(currentSession){
    const { error } = await supabaseClient.from("cart").insert({ user_id: currentSession.user.id, book_id: id });
    if(error){ cart.delete(id); refreshCartWishlistUI(); showToast("Could not add to cart."); return; }
  } else {
    saveGuestState();
  }
}

async function removeFromCart(id){
  cart.delete(id);
  refreshCartWishlistUI();

  if(currentSession){
    const { error } = await supabaseClient.from("cart").delete().eq("user_id", currentSession.user.id).eq("book_id", id);
    if(error){ cart.add(id); refreshCartWishlistUI(); showToast("Could not remove from cart."); return; }
  } else {
    saveGuestState();
  }
}

function renderCartDrawer(){
  const body = document.getElementById("cartBody");
  const foot = document.getElementById("cartFoot");
  const ids = [...cart];
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
    total += b.price;
    const row = document.createElement("div");
    row.className = "drawer-item";
    row.innerHTML = `
      <div class="di-cover" style="${b.coverUrl ? `background-image:url('${b.coverUrl}');background-size:cover;` : `background:${coverStyle(b.id)}`}"></div>
      <div class="di-info">
        <div class="di-title">${b.title}</div>
        <div class="di-meta">₹${b.price}</div>
        <div style="display:flex;gap:10px;margin-top:4px;">
          <button class="remove-cart" data-id="${b.id}">Remove</button>
        </div>
      </div>
    `;
    row.querySelector(".remove-cart").addEventListener("click",()=>removeFromCart(id));
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
  document.getElementById("cartCount").textContent = cart.size;
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
  if(tab === "admin") renderAdminBookList();
}

/* ---------------- auth (Supabase) ---------------- */
function showAuthMessage(id, text, type){
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = "auth-message " + (type||"");
}

async function handleRegister(){
  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;

  if(!name || !email || !password){
    showAuthMessage("registerMessage","Please fill in all fields.","error");
    return;
  }
  if(password.length < 8){
    showAuthMessage("registerMessage","Password should be at least 8 characters.","error");
    return;
  }

  showAuthMessage("registerMessage","Creating your account…","");
  const { data, error } = await supabaseClient.auth.signUp({
    email, password,
    options:{ data:{ full_name:name } }
  });

  if(error){
    showAuthMessage("registerMessage", error.message, "error");
    return;
  }
  showAuthMessage("registerMessage","Account created! Check your email to confirm, then log in.","success");
  setTimeout(()=>document.getElementById("accountModal").classList.remove("open"), 1400);
}

async function handleLogin(){
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if(!email || !password){
    showAuthMessage("loginMessage","Please enter your email and password.","error");
    return;
  }

  showAuthMessage("loginMessage","Logging in…","");
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if(error){
    showAuthMessage("loginMessage", error.message, "error");
    return;
  }
  showAuthMessage("loginMessage","Logged in!","success");
  setTimeout(()=>document.getElementById("accountModal").classList.remove("open"), 700);
}

async function handleLogout(){
  await supabaseClient.auth.signOut();
  showToast("You've been logged out.");
}

function updateAuthUI(session){
  const loggedIn = !!session;
  const email = loggedIn ? session.user.email : "";

  document.getElementById("loginFormView").hidden = loggedIn;
  document.getElementById("loggedInView").hidden = !loggedIn;
  if(loggedIn) document.getElementById("loggedInEmail").textContent = email;

  const label = loggedIn ? email.split("@")[0] : "My Account";
  document.getElementById("accountToggle").textContent = label;
  document.getElementById("accountToggleMobile").textContent = label;
}

/* ---------------- admin ---------------- */
async function checkAdmin(session){
  if(!session){ isAdmin = false; updateAdminUI(); return; }
  const { data, error } = await supabaseClient.rpc('is_admin');
  isAdmin = !error && data === true;
  updateAdminUI();
}

function updateAdminUI(){
  const tabBtn = document.getElementById("adminTabBtn");
  if(tabBtn) tabBtn.hidden = !isAdmin;
}

async function uploadBookCover(file){
  const ext = file.name.split(".").pop();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabaseClient
    .storage.from("book-covers")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if(uploadError) throw uploadError;

  const { data } = supabaseClient.storage.from("book-covers").getPublicUrl(path);
  return data.publicUrl;
}

async function handleAdminAddBook(){
  const title = document.getElementById("adminTitle").value.trim();
  const author = document.getElementById("adminAuthor").value.trim();
  const description = document.getElementById("adminDescription").value.trim();
  const language = document.getElementById("adminLanguage").value;
  const category = document.getElementById("adminCategory").value;
  const price = parseFloat(document.getElementById("adminPrice").value) || 0;
  const coverFile = document.getElementById("adminCover").files[0];

  if(!title || !author){
    showAuthMessage("adminMessage","Title and author are required.","error");
    return;
  }

  showAuthMessage("adminMessage", coverFile ? "Uploading cover…" : "Saving…", "");

  let cover_url = null;
  if(coverFile){
    try{
      cover_url = await uploadBookCover(coverFile);
    } catch(err){
      showAuthMessage("adminMessage","Cover upload failed: " + err.message, "error");
      return;
    }
  }

  showAuthMessage("adminMessage","Saving…","");
  const { error } = await supabaseClient.from("books").insert({ title, author, description, language, category, price, cover_url });

  if(error){
    showAuthMessage("adminMessage", error.message, "error");
    return;
  }
  showAuthMessage("adminMessage","Book added!","success");
  document.getElementById("adminTitle").value = "";
  document.getElementById("adminAuthor").value = "";
  document.getElementById("adminDescription").value = "";
  document.getElementById("adminPrice").value = "";
  document.getElementById("adminCover").value = "";
  await loadBooksFromSupabase();
  renderAdminBookList();
}

function renderAdminBookList(){
  const list = document.getElementById("adminBookList");
  if(!list) return;
  if(BOOKS.length === 0){
    list.innerHTML = `<p class="drawer-empty">No books yet.</p>`;
    return;
  }
  list.innerHTML = "";
  BOOKS.forEach(b=>{
    const row = document.createElement("div");
    row.className = "drawer-item";
    row.innerHTML = `
      <div class="di-info">
        <div class="di-title">${b.title}</div>
        <div class="di-meta">₹${b.price} · ${b.cat} · ${b.lang}</div>
        <button data-id="${b.id}" class="admin-copy-link">Copy Link</button>
        <button data-id="${b.id}" class="admin-delete-book">Delete</button>
      </div>
    `;
    row.querySelector(".admin-copy-link").addEventListener("click",()=>copyBookLink(b.id));
    row.querySelector(".admin-delete-book").addEventListener("click",()=>handleAdminDeleteBook(b.id));
    list.appendChild(row);
  });
}

async function handleAdminDeleteBook(id){
  if(!confirm("Delete this book? This cannot be undone.")) return;
  const { error } = await supabaseClient.from("books").delete().eq("id", id);
  if(error){ showToast("Could not delete: " + error.message); return; }
  await loadBooksFromSupabase();
  renderAdminBookList();
}

/* ---------------- interests onboarding ---------------- */
let selectedInterests = new Set();

async function checkOnboarding(session){
  if(!session) return;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("onboarding_completed, interests")
    .eq("id", session.user.id)
    .single();

  if(error || !data) return;
  if(!data.onboarding_completed){
    selectedInterests = new Set(data.interests || []);
    document.querySelectorAll("#onboardingChips .filter-chip").forEach(chip=>{
      chip.classList.toggle("active", selectedInterests.has(chip.dataset.cat));
    });
    document.getElementById("onboardingModal").classList.add("open");
  }
}

async function saveOnboarding(skip){
  if(!currentSession) return;

  const { error } = await supabaseClient
    .from("profiles")
    .update({
      interests: skip ? [] : [...selectedInterests],
      onboarding_completed: true
    })
    .eq("id", currentSession.user.id);

  if(error){ showToast("Could not save: " + error.message); return; }
  document.getElementById("onboardingModal").classList.remove("open");
}

/* ---------------- auth state change: the single place that reacts to login/logout ---------------- */
let lastUserId = null;

supabaseClient.auth.onAuthStateChange(async (_event, session)=>{
  currentSession = session;
  updateAuthUI(session);
  checkAdmin(session);

  const newUserId = session ? session.user.id : null;
  if(newUserId === lastUserId) return; // avoid re-running merge/load on token refresh etc.
  lastUserId = newUserId;

  if(session){
    await mergeGuestStateIntoSupabase(session.user.id);
    await loadUserStateFromSupabase(session.user.id);
    checkOnboarding(session);
  } else {
    loadGuestState();
  }
  refreshCartWishlistUI();
});

/* react to browser back/forward so the modal follows the URL */
window.addEventListener("popstate", ()=>{
  const params = new URLSearchParams(location.search);
  const id = params.get("book");
  if(id && BOOKS.some(b=>b.id===id)){
    openBookModal(id, { updateUrl:false });
  } else {
    document.getElementById("bookModal").classList.remove("open");
  }
});

/* ===================================================================
   EVENT WIRING
   =================================================================== */
document.addEventListener("DOMContentLoaded", async ()=>{
  loadGuestState(); // shows instantly for guests; overwritten by Supabase state if already logged in
  await loadBooksFromSupabase();
  refreshCartWishlistUI();

  // check if already logged in (existing session) — onAuthStateChange above also fires on
  // load with the initial session, so this just ensures BOOKS is loaded before first render
  const { data } = await supabaseClient.auth.getSession();
  currentSession = data.session;

  // if the page was opened via a shared book link (?book=<id>), open that book now
  await openBookFromUrlIfPresent();

  // auth buttons
  document.getElementById("registerSubmit").addEventListener("click", handleRegister);
  document.getElementById("loginSubmit").addEventListener("click", handleLogin);
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("adminAddBookBtn").addEventListener("click", handleAdminAddBook);

  // interests onboarding
  document.querySelectorAll("#onboardingChips .filter-chip").forEach(chip=>{
    chip.addEventListener("click",()=>{
      chip.classList.toggle("active");
      const cat = chip.dataset.cat;
      selectedInterests.has(cat) ? selectedInterests.delete(cat) : selectedInterests.add(cat);
    });
  });
  document.getElementById("onboardingSaveBtn").addEventListener("click", ()=>saveOnboarding(false));
  document.getElementById("onboardingSkipBtn").addEventListener("click", ()=>saveOnboarding(true));

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

  // close modals on outside click (book modal also clears the URL)
  document.querySelectorAll(".modal").forEach(modal=>{
    modal.addEventListener("click",(e)=>{
      if(e.target===modal){
        if(modal.id === "bookModal") closeBookModal();
        else modal.classList.remove("open");
      }
    });
  });
});
