import './style.css'

// =========================================
// 1. DATA STATE MANAGEMENT
// =========================================
let products = [];
let cart = [];

function initData() {
  try {
    // Products
    products = JSON.parse(localStorage.getItem('products')) || [];
    // Data seeding removed per user request

    // Quantity Check normalize
    products = products.map(p => ({
      ...p,
      qty: p.qty !== undefined ? p.qty : 100
    }));

    // Cart
    cart = JSON.parse(localStorage.getItem('cart')) || [];

    console.log('[DATA] Loaded', products.length, 'products and', cart.length, 'cart items.');
  } catch (e) {
    console.error('[DATA] Init Error:', e);
  }
}

// Helpers
function getCategory(p) { return p.category || 'Uncategorized'; }
function getPrice(p) {
  const val = p.price || 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[^0-9.]/g, '');
  return parseFloat(str) || 0;
}
function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); }


// =========================================
// 2. GLOBAL UI LOGIC (Sidebar, Footer, Cart)
// =========================================
function updateCartBadge() {
  const btn = document.getElementById('cart-btn');
  if (!btn) return;

  // Remove existing badge
  const existing = btn.querySelector('.cart-badge');
  if (existing) existing.remove();

  const count = cart.reduce((acc, item) => acc + item.qty, 0);

  if (count > 0) {
    const badge = document.createElement('span');
    badge.className = 'cart-badge';
    badge.textContent = count > 99 ? '99+' : count;
    btn.appendChild(badge);
  }
}

function initGlobalUI() {
  console.log('Init Global UI');
  updateCartBadge(); // Initial render

  // Sidebar
  // --- Sidebar Logic ---
  const menuBtn = document.getElementById('menu-btn');
  const closeSidebarBtn = document.getElementById('close-sidebar');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');

  if (menuBtn && sidebar && overlay) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.add('active');
      overlay.classList.add('active');
    });
  }

  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', () => {
      if (sidebar) sidebar.classList.remove('active');
      if (overlay) overlay.classList.remove('active');
    });
  }

  // Global Overlay Close
  if (overlay) {
    overlay.addEventListener('click', () => {
      if (sidebar) sidebar.classList.remove('active');
      const cartSidebar = document.getElementById('cart-sidebar');
      if (cartSidebar) cartSidebar.classList.remove('active');
      const filterModal = document.getElementById('filter-modal');
      if (filterModal) filterModal.classList.remove('active');
      overlay.classList.remove('active');
    });
  }

  // Filter Modal Logic
  const filterBtn = document.getElementById('filter-btn');
  const filterModal = document.getElementById('filter-modal');
  const closeFilter = document.getElementById('close-filter');
  const applyFilter = document.getElementById('apply-filter');
  const resetFilter = document.getElementById('reset-filter');

  if (filterBtn && filterModal) {
    filterBtn.onclick = () => {
      filterModal.classList.add('active');
      overlay.classList.add('active');
      populateFilterCategories();
    };
  }

  if (closeFilter) {
    closeFilter.onclick = () => {
      filterModal.classList.remove('active');
      overlay.classList.remove('active');
    };
  }

  if (resetFilter) {
    resetFilter.onclick = () => {
      document.querySelector('input[name="sortPrice"][value="default"]').checked = true;
      document.querySelectorAll('#filter-categories input').forEach(c => c.checked = false);
      if (document.getElementById('filter-stock')) document.getElementById('filter-stock').checked = false;
    };
  }

  if (applyFilter) {
    applyFilter.onclick = () => {
      const sortVal = document.querySelector('input[name="sortPrice"]:checked').value;
      const catChecks = Array.from(document.querySelectorAll('#filter-categories input:checked')).map(c => c.value);
      const stockCheck = document.getElementById('filter-stock') ? document.getElementById('filter-stock').checked : false;

      filterModal.classList.remove('active');
      overlay.classList.remove('active');

      initProductGrid({ sort: sortVal, categories: catChecks, stock: stockCheck });
    };
  }

  function populateFilterCategories() {
    const container = document.getElementById('filter-categories');
    if (!container || container.children.length > 0) return;

    // Extract unique categories
    const cats = [...new Set(products.map(p => p.category || 'Uncategorized'))];
    container.innerHTML = cats.map(c => `
             <label style="display: flex; align-items: center; gap: 0.5rem;">
                <input type="checkbox" value="${c}">
                ${c}
             </label>
        `).join('');
  }

  // Inject Footer (if missing)
  if (!document.querySelector('footer') && !window.location.pathname.includes('admin.html') && !window.location.pathname.includes('checkout.html') && !window.location.pathname.includes('product_details.html')) {
    const footerCallback = () => {
      const footer = document.createElement('footer');
      footer.innerHTML = `
            <div class="footer-links">
            <a href="#" class="footer-link">terms & condition</a>
            <a href="https://wa.me/918972076182?text=Hi" target="_blank" class="footer-link">contact no.</a>
            <a href="#" class="footer-link">location by maps</a>
            </div>
            <div class="copyright">Maa Handloom. All rights reserved.</div>
           `;
      document.body.appendChild(footer);
    };
    // Simple append if body ready
    if (document.body) footerCallback();
  }
}

function addToCart(productId) {
  console.log('[CART] Add:', productId);
  const product = products.find(p => p.id == productId);
  if (!product) return alert('Product not found');
  if (product.qty <= 0) return alert('Out of stock');

  const existing = cart.find(i => i.id == productId);
  if (existing) {
    if (existing.qty < product.qty) existing.qty++;
    else alert('Max stock reached');
  } else {
    cart.push({ ...product, qty: 1, maxQty: product.qty });
  }
  saveCart();
  // Refresh Cart UI if open or injected
  renderCartItems();
  updateCartBadge(); // Ensure header badge updates immediately

  // Auto open cart if sidebar exists
  const cartSidebar = document.getElementById('cart-sidebar');
  const overlay = document.getElementById('overlay');
  if (cartSidebar && overlay) {
    cartSidebar.classList.add('active');
    overlay.classList.add('active');
  } else if (!window.location.pathname.includes('checkout.html')) {
    // If cart sidebar not injected yet, maybe we interpret this as "Go to cart"
    // But usually we inject cart.
  }
}

function renderCartItems() {
  const container = document.querySelector('.cart-items');
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding:1rem;">Cart is empty</p>';
    return;
  }

  container.innerHTML = cart.map(item => {
    const product = products.find(p => p.id == item.id) || item;
    const price = getPrice(product);
    const img = product.image ? `<img src="${product.image}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : `<div style="background:#eee;height:100%;display:flex;align-items:center;justify-content:center;font-size:0.6rem;">NO IMG</div>`;

    return `
        <div class="cart-item">
            <div class="cart-item-img">${img}</div>
            <div class="cart-item-details">
                <span class="cart-item-title">${product.name}</span>
                <span class="cart-item-text">₹${price}</span>
            </div>
            <div class="qty-selector">
                <button class="qty-btn" onclick="updateCartQty('${item.id}', -1)">-</button>
                <span>${item.qty}</span>
                <button class="qty-btn" onclick="updateCartQty('${item.id}', 1)">+</button>
            </div>
        </div>`;
  }).join('');
}

window.updateCartQty = function (id, change) {
  const item = cart.find(i => i.id == id);
  if (!item) return;
  const product = products.find(p => p.id == id) || item;

  const newQty = item.qty + change;
  if (newQty < 1) cart = cart.filter(i => i.id != id);
  else if (newQty > (product.qty || 100)) return alert('Max limit');
  else item.qty = newQty;

  saveCart();
  renderCartItems();

  // Live update total if on checkout page
  if (window.location.pathname.includes('checkout.html')) initCheckoutPage();
};

function injectCart() {
  if (document.getElementById('cart-sidebar')) return;
  const html = `
    <aside id="cart-sidebar" class="cart-sidebar">
      <div class="cart-header">
        CART
        <button id="cart-close-btn" style="position:absolute;right:1rem;background:none;border:none;color:white;font-size:1.5rem;cursor:pointer;">&times;</button>
      </div>
      <div class="cart-items"></div>
      <div class="cart-footer" style="padding:1rem;border-top:1px solid #ddd;">
        <button id="checkout-btn" class="btn-buy-now-large" style="width:100%;">CHECKOUT</button>
      </div>
    </aside>
    `;
  document.body.insertAdjacentHTML('beforeend', html);
  renderCartItems();

  // Bind Events
  const closeBtn = document.getElementById('cart-close-btn');
  if (closeBtn) closeBtn.onclick = () => {
    document.getElementById('cart-sidebar').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
  };

  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) checkoutBtn.onclick = () => window.location.href = 'checkout.html';

  const cartIconBtn = document.getElementById('cart-btn');
  if (cartIconBtn) cartIconBtn.onclick = () => {
    document.getElementById('cart-sidebar').classList.add('active');
    document.getElementById('overlay').classList.add('active');
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('active');
  };
}


// =========================================
// 3. PAGE SPECIFIC LOGIC
// =========================================

// --- ADVANCED SEARCH ---
// --- NAVBAR SEARCH TRANSFORMATION LOGIC ---
function initSearch() {
  const toggleBtn = document.getElementById('search-toggle');
  const closeBtn = document.getElementById('close-navbar-search');
  const navbar = document.querySelector('.navbar');
  const input = document.getElementById('navbar-search-input');

  // Results Container - Create dynamic dropdown if not exists
  let resultsGrid = document.getElementById('search-results-dropdown');
  if (!resultsGrid) {
    resultsGrid = document.createElement('div');
    resultsGrid.id = 'search-results-dropdown';
    resultsGrid.className = 'search-results-dropdown';
    document.body.appendChild(resultsGrid);
  }

  if (!toggleBtn || !navbar || !input) return;

  // Open Search
  toggleBtn.onclick = () => {
    navbar.classList.add('search-active');
    setTimeout(() => input.focus(), 100);
  };

  // Close Search
  const closeSearch = () => {
    navbar.classList.remove('search-active');
    resultsGrid.classList.remove('active');
    input.value = '';
    resultsGrid.innerHTML = '';
  };

  if (closeBtn) closeBtn.onclick = closeSearch;

  // Close on Escape or click outside
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navbar.classList.contains('search-active')) {
      closeSearch();
    }
  });

  // Search Logic (Real-time)
  input.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    if (query.length < 1) {
      resultsGrid.classList.remove('active');
      resultsGrid.innerHTML = '';
      return;
    }

    resultsGrid.classList.add('active');

    // Filter Logic
    const matches = products.filter(p => {
      const nameMatch = p.name.toLowerCase().includes(query);
      const catMatch = getCategory(p).toLowerCase().includes(query);
      const priceMatch = String(getPrice(p)).includes(query);
      return nameMatch || catMatch || priceMatch;
    });

    renderSearchResults(matches, resultsGrid);
  });
}

function renderSearchResults(items, container) {
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p style="text-align:center;width:100%;grid-column:1/-1;">No results found.</p>';
    return;
  }

  items.forEach(p => {
    const card = document.createElement('div');
    card.className = 'search-card';
    card.onclick = () => window.location.href = `product_details.html?id=${p.id}`;

    const img = (p.images && p.images.length) ? p.images[0] : (p.image || 'https://via.placeholder.com/200');

    card.innerHTML = `
      <img src="${img}" class="search-card-img" alt="${p.name}">
      <div class="search-card-info">
        <div class="search-card-title">${p.name}</div>
        <div class="search-card-price">₹${getPrice(p)}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

// --- HOME PAGE & CATEGORY (Grid) ---
// Initialize search on load
document.addEventListener('DOMContentLoaded', () => {
  // Other init functions called at bottom of file, but this one needs to register if elements exist
  // We'll call it from the main listener at the bottom.
});

// --- HOME PAGE & CATEGORY (Grid) ---
function initProductGrid(filters = {}) {
  const grid = document.getElementById('product-grid');
  const catContainer = document.getElementById('category-grid'); // Category page
  const targetGrid = grid || catContainer;

  if (!targetGrid) return;

  // Filter Logic
  let displayProducts = [...products];

  // If Category Page
  if (catContainer) {
    const urlParams = new URLSearchParams(window.location.search);
    let catParam = urlParams.get('cat');
    const path = window.location.pathname;
    if (!catParam) {
      if (path.includes('surat-silk.html')) catParam = 'Surat Silk Special';
      else if (path.includes('handloom-special.html')) catParam = 'Handloom Special';
      else if (path.includes('shantipuri-special.html')) catParam = 'Shantipuri Special';
      else if (path.includes('cotton-varieties.html')) catParam = 'Cotton Varieties';
    }

    if (catParam) {
      displayProducts = displayProducts.filter(p => p.category === catParam || (p.category && p.category.includes(catParam)));
      const titleEl = document.getElementById('selected-cat-title');
      if (titleEl) titleEl.textContent = catParam;
    }
  }

  // Custom Filters (Modal)
  if (filters.stock) {
    displayProducts = displayProducts.filter(p => p.qty > 0);
  }
  if (filters.categories && filters.categories.length > 0) {
    displayProducts = displayProducts.filter(p => filters.categories.includes(p.category));
  }
  if (filters.sort) {
    if (filters.sort === 'lowHigh') displayProducts.sort((a, b) => getPrice(a) - getPrice(b));
    else if (filters.sort === 'highLow') displayProducts.sort((a, b) => getPrice(b) - getPrice(a));
  }

  // Render
  if (displayProducts.length === 0) {
    targetGrid.innerHTML = '<p style="text-align:center;grid-column:1/-1;">No products found.</p>';
  } else {
    targetGrid.innerHTML = displayProducts.map(p => {
      const price = getPrice(p);
      const img = p.image ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="background:#ef4444;height:100%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:2rem;">${p.id}</div>`;
      return `
             <div class="product-card">
                <div class="product-image-placeholder view-details-btn" data-id="${p.id}" style="cursor:pointer;flex:1;">
                    ${img}
                </div>
                <div class="product-info">
                    <h3>${p.name}</h3>
                    <div class="product-row">
                        <span class="product-price">₹${price}</span>
                        <button class="add-cart-pill" data-id="${p.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                            ADD CART
                        </button>
                    </div>
                </div>
             </div>
             `;
    }).join('');
  }

  // Events delegation
  targetGrid.addEventListener('click', (e) => {
    const detailsBtn = e.target.closest('.view-details-btn');
    if (detailsBtn) window.location.href = `product_details.html?id=${detailsBtn.dataset.id}`;

    const addBtn = e.target.closest('.add-cart-pill');
    if (addBtn) addToCart(addBtn.dataset.id);
  });
}


// --- PRODUCT DETAILS PAGE ---
function initProductDetails() {
  const container = document.getElementById('product-detail-container');
  if (!container) return;

  // 1. Loading Skeleton
  container.innerHTML = `
        <div class="product-detail-wrapper" style="padding:0;">
             <div class="skeleton sk-img"></div>
             <div class="detail-content">
                  <div class="skeleton sk-text sk-short"></div>
                  <div class="skeleton sk-title"></div>
                  <div class="skeleton sk-text sk-med"></div>
                  <div class="skeleton sk-text sk-long" style="height:100px;margin-top:1rem;"></div>
             </div>
        </div>`;

  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');

  // Simulate Fetch
  setTimeout(() => {
    const product = products.find(p => p.id == id);

    if (!product) {
      container.innerHTML = '<p style="text-align:center;padding:2rem;">Product not found.</p>';
      return;
    }

    const images = (product.images && product.images.length) ? product.images : [product.image || null];
    const price = getPrice(product);
    const mrp = Math.round(price * 1.4);

    container.innerHTML = `
            <div class="product-detail-wrapper">
                <div class="detail-gallery" id="detail-slider" style="position:relative;">
                    <div class="pagination-dots" id="dots-container" style="position:absolute;bottom:1rem;width:100%;display:flex;justify-content:center;gap:0.5rem;z-index:10;"></div>
                    <button onclick="history.back()" style="position:absolute;top:1rem;left:1rem;z-index:10;background:rgba(255,255,255,0.8);border:none;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    </button>
                    <!-- Img injected via JS -->
                </div>

                <div class="detail-content">
                    <span class="detail-category-tag">${product.category || 'Handloom'}</span>
                    <h1 class="detail-title">${product.name}</h1>
                    <div class="detail-price-row">
                        <span class="detail-price">₹${price}</span>
                        <span class="detail-price-mrp">₹${mrp}</span>
                        <span class="detail-discount">40% OFF</span>
                    </div>
                    <p class="detail-desc">${product.description || 'Authentic handloom product.'}</p>
                    
                     <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:2rem;">
                         <div style="background:#F5F5F5;padding:0.5rem 1rem;border-radius:8px;font-size:0.8rem;display:flex;align-items:center;gap:0.5rem;">
                            <span>Authentic</span>
                         </div>
                         <div style="background:#F5F5F5;padding:0.5rem 1rem;border-radius:8px;font-size:0.8rem;display:flex;align-items:center;gap:0.5rem;">
                            <span>Fast Delivery</span>
                         </div>
                    </div>
                </div>

                <div class="sticky-action-bar">
                    <button id="detail-add-btn" class="btn-action btn-secondary">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                        ADD TO CART
                    </button>
                    <button id="detail-buy-btn" class="btn-action btn-primary">Buy Now</button>
                </div>
            </div>
        `;

    // Image Slider logic
    const slider = document.getElementById('detail-slider');
    const dotsCtx = document.getElementById('dots-container');
    let curSlide = 0;

    function renderSlide(idx) {
      curSlide = idx;
      const existing = slider.querySelector('img.slide-img');
      if (existing) existing.remove();

      const src = images[idx];
      if (src) {
        const img = document.createElement('img');
        img.src = src;
        img.className = 'slide-img';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;z-index:1;';
        slider.prepend(img);
      } else {
        const d = document.createElement('div');
        d.className = 'slide-img';
        d.style.cssText = 'width:100%;height:100%;background:#ddd;position:absolute;top:0;left:0;z-index:1;display:flex;align-items:center;justify-content:center;';
        d.textContent = 'NO IMAGE';
        slider.prepend(d);
      }

      dotsCtx.innerHTML = images.map((_, i) => `
                <div style="width:8px;height:8px;border-radius:50%;background:${i === curSlide ? '#2C1B10' : '#ccc'};cursor:pointer;"></div>
            `).join('');

      Array.from(dotsCtx.children).forEach((d, i) => d.onclick = () => renderSlide(i));
    }
    renderSlide(0);

    // Bind Events
    document.getElementById('detail-add-btn').onclick = () => {
      addToCart(product.id);
      updateCartBadge();
      const btn = document.getElementById('detail-add-btn');
      btn.textContent = 'Added!';
      btn.style.background = '#22c55e';
      setTimeout(() => {
        btn.textContent = 'Add to Cart';
        btn.style.background = '';
      }, 2000);
    };
    document.getElementById('detail-buy-btn').onclick = () => {
      addToCart(product.id);
      window.location.href = 'checkout.html';
    };

  }, 800);
}


// --- CHECKOUT PAGE ---
function initCheckout() {
  console.log('Init Checkout Page');
  const list = document.getElementById('checkout-items');
  const form = document.getElementById('checkout-form');
  if (!list) console.error('Checkout items list not found');
  if (!form) console.error('Checkout form not found');

  if (!list || !form) return;

  function renderCheckoutList() {
    if (cart.length === 0) {
      list.innerHTML = '<p>Cart is Empty</p>';
      const tEl = document.getElementById('checkout-total');
      const btEl = document.getElementById('btn-total');
      if (tEl) tEl.textContent = '0';
      if (btEl) btEl.textContent = '0';
      return;
    }

    const total = cart.reduce((acc, item) => {
      const product = products.find(p => p.id == item.id) || item;
      return acc + (getPrice(product) * item.qty);
    }, 0);

    list.innerHTML = cart.map(item => {
      const product = products.find(p => p.id == item.id) || item;
      return `
             <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:0.5rem;">
                <div style="display:flex;align-items:center;gap:0.5rem;">
                   <span style="background:#eee;padding:2px 6px;border-radius:4px;font-size:0.8rem;font-weight:bold;">x${item.qty}</span>
                   <span>${product.name}</span>
                </div>
                <strong>₹${getPrice(product) * item.qty}</strong>
             </div>
             `;
    }).join('');

    const totalRow = document.getElementById('checkout-total');
    const btnTotal = document.getElementById('btn-total');
    if (totalRow) totalRow.textContent = '₹' + total;
    if (btnTotal) btnTotal.textContent = '₹' + total;
  }

  renderCheckoutList();

  form.onsubmit = (e) => {
    console.log('Checkout Form Submitting...');
    e.preventDefault();

    if (cart.length === 0) {
      alert('Cart is empty');
      return;
    }

    // Deduct Stock Logic Check
    const stockIssues = cart.filter(item => {
      const product = products.find(p => p.id === item.id);
      return !product || product.qty < item.qty;
    });

    if (stockIssues.length > 0) {
      alert('Some items are out of stock. Please update cart.');
      return;
    }

    const overlay = document.getElementById('processing-overlay');
    if (overlay) overlay.style.display = 'flex';

    // Prepare Order Data
    const name = document.getElementById('name') ? document.getElementById('name').value : 'Guest';
    // Add other fields if needed, simplified for now

    setTimeout(() => {
      // 1. Create Order
      const orderId = 'ORD-' + Date.now().toString().slice(-6);
      const newOrder = {
        id: orderId,
        name: name,
        items: [...cart], // clone
        total: cart.reduce((acc, item) => {
          const product = products.find(p => p.id == item.id) || item;
          return acc + (getPrice(product) * item.qty);
        }, 0),
        status: 'new',
        date: new Date().toISOString()
      };

      // 2. Save Order
      let currentOrders = JSON.parse(localStorage.getItem('orders')) || [];
      currentOrders.unshift(newOrder);
      localStorage.setItem('orders', JSON.stringify(currentOrders));

      // 3. Update Stock
      cart.forEach(item => {
        const pIdx = products.findIndex(p => p.id === item.id);
        if (pIdx !== -1) {
          products[pIdx].qty -= item.qty;
        }
      });
      localStorage.setItem('products', JSON.stringify(products));

      // 4. Clear Cart
      cart = [];
      saveCart();

      console.log('Order Placed:', orderId);

      if (overlay) overlay.style.display = 'none';

      const successModal = document.getElementById('success-modal');
      if (successModal) {
        const idSpan = document.getElementById('success-order-id');
        if (idSpan) idSpan.textContent = orderId;
        successModal.style.display = 'flex';
        successModal.style.opacity = '1'; // Force visibility

        // Copy Logic
        const copyBtn = document.getElementById('btn-copy-id');
        if (copyBtn) {
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(orderId).then(() => {
              alert('Order ID Copied!');
            }).catch(err => {
              console.error('Failed to copy', err);
              // Fallback
              prompt("Copy Order ID:", orderId);
            });
          };
        }

        const contBtn = document.getElementById('success-continue-btn');
        if (contBtn) contBtn.onclick = () => window.location.href = 'index.html';
      } else {
        alert('Order Placed: ' + orderId);
        window.location.href = 'index.html';
      }
    }, 2000);
  };
}


// --- MAIN ENTRY POINT ---
// --- TRACK ORDER PAGE ---
function initTrackOrder() {
  const btn = document.getElementById('track-btn');
  const input = document.getElementById('track-id');
  const resultContainer = document.getElementById('tracking-result');

  if (!btn || !input || !resultContainer) return;

  btn.onclick = () => {
    const id = input.value.trim();
    if (!id) return alert('Please enter an Order ID');

    const orders = JSON.parse(localStorage.getItem('orders')) || [];
    const order = orders.find(o => o.id === id);

    if (!order) {
      alert('Order ID not found.');
      resultContainer.style.display = 'none';
      return;
    }

    // Render Status
    resultContainer.style.display = 'block';
    resultContainer.style.opacity = '1'; /* Ensure visibility */
    document.getElementById('display-order-id').textContent = '#' + order.id;
    document.getElementById('display-status').textContent = 'PREPARING'; // Default status for demo
    document.getElementById('display-date').textContent = new Date(order.date).toLocaleDateString();
    document.getElementById('display-total').textContent = '₹' + order.total;

    // Reset Steps
    ['step-1', 'step-2', 'step-3', 'step-4'].forEach(s => {
      document.getElementById(s).classList.remove('active');
    });
    ['line-1', 'line-2', 'line-3'].forEach(l => {
      document.getElementById(l).classList.remove('active');
    });

    // Simple Status Logic (Mockup)
    // For now, freshly placed orders are just "Placed" -> "Processing"
    document.getElementById('step-1').classList.add('active');
    document.getElementById('step-2').classList.add('active'); // Assume processing immediately
    document.getElementById('line-1').classList.add('active');
  };
}

document.addEventListener('DOMContentLoaded', () => {
  initData();
  initGlobalUI();

  const path = window.location.pathname;

  if (path.includes('product_details.html')) {
    initProductDetails();
    injectCart(); // Ensure cart sidebar exists
  } else if (path.includes('checkout.html')) {
    initCheckout();
  } else if (path.includes('track-order.html')) {
    initTrackOrder();
    injectCart();
  } else if (path.includes('index.html') || path.includes('categories') || path.includes('special') || path.includes('varieties') || path.includes('silk') || path === '/') {
    initProductGrid();
    initSearch(); // Initialize Search on Home/Browsing pages
    injectCart();
  } else {
    injectCart();
  }
});
