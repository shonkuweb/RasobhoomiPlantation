import './style.css'

// Sidebar Logic
const menuBtn = document.getElementById('menu-btn');
const closeSidebarBtn = document.getElementById('close-sidebar');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');

function closeAllMenus() {
  sidebar.classList.remove('active');
  const cartSidebar = document.getElementById('cart-sidebar');
  if (cartSidebar) cartSidebar.classList.remove('active');
  overlay.classList.remove('active');
}

function toggleSidebar() {
  // If cart is open, close it first
  const cartSidebar = document.getElementById('cart-sidebar');
  if (cartSidebar && cartSidebar.classList.contains('active')) {
    cartSidebar.classList.remove('active');
  }

  const isActive = sidebar.classList.toggle('active');
  overlay.classList.toggle('active', isActive);
}

menuBtn.addEventListener('click', toggleSidebar);
closeSidebarBtn.addEventListener('click', closeAllMenus);
overlay.addEventListener('click', closeAllMenus);

// Mock Product Data
// Product Data Logic
// Try to load from localStorage, otherwise fallback to defaults
let products = JSON.parse(localStorage.getItem('products')) || [
  { id: 1, name: '#product description', price: '#xxx' },
  { id: 2, name: '#product description', price: '#xxx' },
  { id: 3, name: '#product description', price: '#xxx' },
  { id: 4, name: '#product description', price: '#xxx' },
];

// If we used fallback defaults and nothing was in storage, we could opt to *not* save them 
// to avoid overwriting what Admin might Init, but Admin Init handles "if empty".
// Ideally, Admin is the source of truth. Main.js just reads.

// Context: Render Products into Grid
const grid = document.getElementById('product-grid');

if (grid) {
  // Clear existing content just in case
  grid.innerHTML = '';

  if (products.length === 0) {
    grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">No products available.</p>';
  } else {
    products.forEach(product => {
      const card = document.createElement('div');
      card.className = 'product-card';
      // Check for image
      let imageContent = '<span class="text-red">#IMAGE</span>';
      if (product.image) {
        imageContent = `<img src="${product.image}" style="width: 100%; height: 100%; object-fit: cover;">`;
      }

      card.innerHTML = `
          <div class="product-image-placeholder">
             ${imageContent}
          </div>
          <div class="cart-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
          </div>
          <button class="view-details-btn" data-id="${product.id}" style="position: absolute; bottom: 3rem; right: 0.75rem; background: black; color: white; border: none; padding: 0.25rem 0.5rem; font-size: 0.7rem; font-weight: bold; border-radius: 4px; cursor: pointer; z-index: 10;">VIEW</button>
          <div class="product-info">
            <h3>${product.name}</h3>
            <p>${product.price}</p>
          </div>
        `;
      grid.appendChild(card);
    });

    // Add listeners to VIEW buttons in grid
    grid.addEventListener('click', (e) => {
      if (e.target.classList.contains('view-details-btn')) {
        const id = e.target.dataset.id;
        window.location.href = `product_details.html?id=${id}`;
      }
    });
  }
}

// Context: Render Product Details (Detail Page)
const detailContainer = document.getElementById('product-detail-container');
if (detailContainer) {
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');

  // loose comparison for ID match
  const product = products.find(p => p.id == productId);

  if (product) {
    let mainImage = product.image ? `<img src="${product.image}" style="width: 100%; height: 300px; object-fit: cover; border-radius: 8px;">` : '<div style="width:100%; height:300px; background:#ddd; display:flex; align-items:center; justify-content:center;">No Image</div>';

    // If multiple images
    let galleryHtml = '';
    if (product.images && product.images.length > 0) {
      galleryHtml = '<div style="display:flex; gap:0.5rem; margin-top:1rem; overflow-x:auto;">';
      product.images.forEach(img => {
        galleryHtml += `<img src="${img}" style="width:80px; height:80px; object-fit:cover; border-radius:4px; cursor:pointer; border:1px solid #ccc;" onclick="document.querySelector('#main-detail-img').src = this.src">`;
      });
      galleryHtml += '</div>';
    }

    detailContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                <div style="width: 100%; margin: 0 auto;">
                    <div id="main-image-wrapper">
                        ${product.image ? `<img id="main-detail-img" src="${product.image}" style="width: 100%; height: 300px; object-fit: cover; border-radius: 8px;">` : '<div style="width:100%; height:300px; background:#ddd; display:flex; align-items:center; justify-content:center; border-radius: 8px;">No Image</div>'}
                    </div>
                    ${galleryHtml}
                </div>
                <div>
                    <h1 class="text-red" style="margin-bottom: 0.5rem; font-size: 1.5rem;">${product.name}</h1>
                    <p style="font-size: 1.25rem; font-weight: bold; margin-bottom: 1rem;">${product.price}</p>
                    <p style="margin-bottom: 1rem;">Stock Available: ${product.qty}</p>
                    
                    <button id="add-to-cart-detail-btn" style="width: 100%; background: black; color: white; padding: 1rem; border: none; font-weight: bold; font-size: 1rem; cursor: pointer; border-radius: 8px;">ADD TO CART</button>
                    
                    <div style="margin-top: 2rem;">
                        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 0.5rem; margin-bottom: 0.5rem;">Description</h3>
                        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                    </div>
                </div>
            </div>
        `;

    document.getElementById('add-to-cart-detail-btn').addEventListener('click', () => {
      // Here you would add to cart logic (state management)
      // For now just open the cart sidebar
      const cartSidebar = document.getElementById('cart-sidebar');
      const overlay = document.getElementById('overlay');
      if (cartSidebar) cartSidebar.classList.add('active');
      if (overlay) overlay.classList.add('active');
    });

  } else {
    detailContainer.innerHTML = '<p style="text-align:center; padding: 2rem;">Product not found.</p>';
  }
}
// Footer Injection
function injectFooter() {
  // Don't inject on Admin Panel if not desired, but user didn't specify exclusion. 
  // Let's assume global footer for now.

  if (document.querySelector('footer')) return; // Prevent duplicate
  if (window.location.pathname.includes('admin.html')) return; // No footer on admin

  const footer = document.createElement('footer');
  footer.innerHTML = `
    <div class="footer-links">
      <a href="#" class="footer-link">terms & condition</a>
      <a href="#" class="footer-link">contact no.</a>
      <a href="#" class="footer-link">location by maps</a>
    </div>
    <div class="social-icons">
      <a href="#" class="social-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
      </a>
      <a href="#" class="social-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
      </a>
      <a href="#" class="social-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon></svg>
      </a>
    </div>
    <div class="copyright">
      Maa Handloom. All rights reserved.
    </div>
  `;
  document.body.appendChild(footer);
}

// Cart Injection & Logic
// Cart Injection & Logic
function injectCart() {
  if (document.getElementById('cart-sidebar')) return;

  const cartItemsHTML = products.map(product => `
          <div class="cart-item">
            <div class="cart-item-img">
                <span class="text-red" style="font-size: 0.5rem; display: flex; justify-content: center; align-items: center; height: 100%;">#IMAGE</span>
            </div>
            <div class="cart-item-details">
              <span class="cart-item-title">${product.name}</span>
              <span class="cart-item-text">PRICE : ${product.price}</span>
              <span class="cart-item-text">STOCK : ${product.qty}</span>
            </div>
            <div class="qty-selector">
              <button class="qty-btn" data-id="${product.id}">-</button>
              <span>1</span>
              <button class="qty-btn" data-id="${product.id}">+</button>
            </div>
          </div>
  `).join('');

  const cartHTML = `
    <aside id="cart-sidebar" class="cart-sidebar">
      <div class="cart-header">
        <button id="cart-close-btn" class="cart-close-btn">
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        CART
        <svg style="margin-left: 0.5rem;" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
      </div>
      <div class="cart-items">
        ${products.length ? cartItemsHTML : '<p style="text-align:center; padding:1rem;">Cart is empty</p>'}
      </div>
    </aside>
  `;
  document.body.insertAdjacentHTML('beforeend', cartHTML);

  // Logic
  const cartBtn = document.getElementById('cart-btn');
  const cartSidebar = document.getElementById('cart-sidebar');
  const overlay = document.getElementById('overlay'); // Reuse existing overlay

  if (cartBtn && cartSidebar) {
    cartBtn.addEventListener('click', () => {
      cartSidebar.classList.toggle('active');
      overlay.classList.toggle('active');
      // If sidebar is open, close it (optional UX choice, usually mutually exclusive)
      const sidebar = document.getElementById('sidebar');
      if (sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
      }
    });

    const cartCloseBtn = document.getElementById('cart-close-btn');
    if (cartCloseBtn) {
      cartCloseBtn.addEventListener('click', closeAllMenus);
    }

    const cartItemsContainer = document.querySelector('.cart-items');
    if (cartItemsContainer) {
      cartItemsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('qty-btn')) {
          const btn = e.target;
          const isPlus = btn.textContent.trim() === '+';
          const qtySpan = isPlus ? btn.previousElementSibling : btn.nextElementSibling;
          let qty = parseInt(qtySpan.textContent);

          const productId = btn.dataset.id;
          // Loose comparison because ID might be string/number depending on source
          const product = products.find(p => p.id == productId);

          if (isPlus) {
            if (product && qty < product.qty) {
              qty++;
            } else {
              alert(`Max stock available is ${product ? product.qty : 0}`);
            }
          } else {
            if (qty > 1) qty--;
          }
          qtySpan.textContent = qty;
        }
      });
    }

    // Close on overlay click listener is handled globally or via the toggleSidebar function
    // But specific close for cart:
    overlay.addEventListener('click', () => {
      if (cartSidebar.classList.contains('active')) {
        cartSidebar.classList.remove('active');
      }
    });
  }
}

// Initialize Cart
injectCart();
