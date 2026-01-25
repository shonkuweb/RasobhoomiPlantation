// Authentication
function checkAuth() {
    // Always require authentication on load

    // Show Modal
    const modal = document.getElementById('auth-modal');
    const form = document.getElementById('auth-form');
    const input = document.getElementById('auth-pass');
    const errorMsg = document.getElementById('auth-error');

    if (modal) {
        modal.classList.add('active');
        input.focus();

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const pass = input.value;

            if (pass === '1234') {
                // Successfully authenticated for this session (in-memory only)
                modal.classList.remove('active');
            } else {
                errorMsg.textContent = 'Incorrect Passcode';
                input.value = '';
                input.classList.add('shake');
                setTimeout(() => input.classList.remove('shake'), 400);
            }
        });
    } else {
        // Fallback checks
        const pass = prompt('Enter Admin Passcode:');
        if (pass === '1234') {
            // Valid
        } else {
            alert('Incorrect Passcode');
            window.location.href = 'index.html';
        }
    }
}

// State
let products = JSON.parse(localStorage.getItem('products')) || [];

let orders = JSON.parse(localStorage.getItem('orders')) || [];

let currentView = 'products';
let currentFilter = 'new';
let editingId = null;

// Elements
const viewToggle = document.getElementById('view-toggle');
const productsBtn = document.getElementById('btn-products');
const ordersBtn = document.getElementById('btn-orders');
const filterSection = document.getElementById('admin-filters');
const listContainer = document.getElementById('admin-list');
const filterBtns = document.querySelectorAll('.filter-chip');
const addProductBtn = document.getElementById('add-product-btn');
const productModal = document.getElementById('product-modal');
const closeModalBtn = document.getElementById('close-modal');
const productForm = document.getElementById('product-form');
const modalTitle = document.getElementById('modal-title');
const productImagesInput = document.getElementById('product-images');
const imagePreviewContainer = document.getElementById('image-preview-container');
// Order Modal Elements
const orderModal = document.getElementById('order-modal');
const closeOrderModalBtn = document.getElementById('close-order-modal');
const modalUpdateStatusBtn = document.getElementById('modal-update-status-btn');

// State for image handling
let currentImages = [];

// Initialize
function init() {
    checkAuth();

    // Save initial default products if nothing in storage (first run)
    // Initial seeded data check removed.
    // if (!localStorage.getItem('products')) { ... }
    // if (!localStorage.getItem('orders')) { ... }

    render();
    setupListeners();
    checkAddButtonVisibility();
}

function setupListeners() {
    productsBtn.addEventListener('click', () => switchView('products'));
    ordersBtn.addEventListener('click', () => switchView('orders'));

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentFilter = e.target.dataset.filter;
            updateFilterUI();
            render();
        });
    });

    // Modal Handlers
    addProductBtn.addEventListener('click', () => openModal());
    closeModalBtn.addEventListener('click', () => closeModal());

    // Close modal on outside click
    productModal.addEventListener('click', (e) => {
        if (e.target === productModal) closeModal();
    });

    // Form Submit
    const form = document.getElementById('product-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('Form submitted');
            saveProduct();
        });
    } else {
        console.error('Product form not found');
    }

    // Image Upload
    const productImagesInput = document.getElementById('product-images');
    if (productImagesInput) {
        productImagesInput.addEventListener('change', handleImageUpload);
    } else {
        console.error('Product images input not found');
    }

    // Reset DB
    const resetBtn = document.getElementById('reset-db-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            showConfirm('WARNING: This will delete ALL products and orders permanently. Are you sure?', () => {
                products = [];
                orders = [];
                saveProductsToStorage();
                saveOrdersToStorage();
                render();
                alert('All data deleted (Products & Orders).');
            });
        });
    }

    // Event Delegation for List Actions (Edit, Delete, View Order)
    listContainer.addEventListener('click', (e) => {
        const target = e.target;

        // Delete Product
        if (target.closest('.delete-btn')) {
            const id = target.closest('.delete-btn').dataset.id;
            deleteProduct(id);
        }
        // Edit Product
        else if (target.closest('.edit-btn')) {
            const id = target.closest('.edit-btn').dataset.id;
            openModal(id);
        }
        // View Order Details
        else if (target.closest('.view-order-btn')) {
            const id = target.closest('.view-order-btn').dataset.id;
            openOrderModal(id);
        }
    });

    // Order Modal Listeners
    if (closeOrderModalBtn) {
        closeOrderModalBtn.addEventListener('click', closeOrderModal);
    }
    if (orderModal) {
        orderModal.addEventListener('click', (e) => {
            if (e.target === orderModal) closeOrderModal();
        });
    }
    if (modalUpdateStatusBtn) {
        modalUpdateStatusBtn.addEventListener('click', updateOrderStatus);
    }
}

// Confirmation helper
function showConfirm(msg, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-msg');
    const yesBtn = document.getElementById('confirm-yes');
    const cancelBtn = document.getElementById('confirm-cancel');

    if (!modal) {
        if (confirm(msg)) onConfirm();
        return;
    }

    msgEl.textContent = msg;
    modal.classList.add('active');

    const close = () => {
        modal.classList.remove('active');
        yesBtn.removeEventListener('click', handleYes);
        cancelBtn.removeEventListener('click', close);
    };

    const handleYes = () => {
        onConfirm();
        close();
    };

    yesBtn.addEventListener('click', handleYes);
    cancelBtn.addEventListener('click', close);
}

function handleImageUpload(e) {
    const files = Array.from(e.target.files);

    if (files.length + currentImages.length > 3) {
        alert('You can only upload up to 3 images.');
        return;
    }

    files.forEach(file => {
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            currentImages.push(event.target.result);
            renderPreviews();
        };
        reader.readAsDataURL(file);
    });

    // Reset inputs so same file can be selected again if valid logic allows (simple reset)
    e.target.value = '';
}

function renderPreviews() {
    imagePreviewContainer.innerHTML = '';
    currentImages.slice(0, 3).forEach((imgSrc, index) => {
        const div = document.createElement('div');
        div.style.cssText = 'width: 60px; height: 60px; border: 1px solid #ccc; position: relative; background-size: cover; background-position: center;';
        div.style.backgroundImage = `url(${imgSrc})`;

        const btn = document.createElement('button');
        btn.innerHTML = '&times;';
        btn.style.cssText = 'position: absolute; top: -5px; right: -5px; background: red; color: white; border: none; border-radius: 50%; width: 16px; height: 16px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;';
        btn.onclick = () => {
            currentImages.splice(index, 1);
            renderPreviews();
        };

        div.appendChild(btn);
        imagePreviewContainer.appendChild(div);
    });
}

function switchView(view) {
    currentView = view;

    if (view === 'products') {
        productsBtn.classList.add('active');
        ordersBtn.classList.remove('active');
        filterSection.style.display = 'none';
    } else {
        productsBtn.classList.remove('active');
        ordersBtn.classList.add('active');
        filterSection.style.display = 'flex';
    }

    checkAddButtonVisibility();
    render();
}

function checkAddButtonVisibility() {
    addProductBtn.style.display = currentView === 'products' ? 'block' : 'none';
}

function updateFilterUI() {
    filterBtns.forEach(btn => {
        if (btn.dataset.filter === currentFilter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Persist Helper
function saveProductsToStorage() {
    localStorage.setItem('products', JSON.stringify(products));
}

function saveOrdersToStorage() {
    localStorage.setItem('orders', JSON.stringify(orders));
}

// CRUD Operations
function deleteProduct(id) {
    showConfirm('Are you sure you want to delete this product?', () => {
        products = products.filter(p => p.id !== id);
        saveProductsToStorage();
        render();
    });
}

function openModal(id = null) {
    productModal.style.display = 'flex';
    // Small delay to allow display:flex to apply before adding class for potential transition (if any), 
    // but mainly to ensure opacity rule takes effect if active class is added.
    // Actually, simply adding the class is enough if display:flex is set.
    productModal.classList.add('active'); // Ensure opacity is 1
    editingId = id;

    if (id) {
        const product = products.find(p => p.id === id);
        modalTitle.textContent = 'EDIT PRODUCT';
        document.getElementById('product-name').value = product.name;
        document.getElementById('product-desc').value = product.description || '';
        document.getElementById('product-price').value = product.price;
        document.getElementById('product-category').value = product.category || '';
        document.getElementById('product-qty').value = product.qty;
        currentImages = product.images || (product.image ? [product.image] : []);
    } else {
        modalTitle.textContent = 'ADD PRODUCT';
        productForm.reset();
        currentImages = [];
    }
    renderPreviews();
}

function closeModal() {
    productModal.style.display = 'none';
    productModal.classList.remove('active');
    editingId = null;
    currentImages = [];
}

function saveProduct() {
    const name = document.getElementById('product-name').value;
    const description = document.getElementById('product-desc').value;
    const price = document.getElementById('product-price').value;
    const category = document.getElementById('product-category').value;
    const qty = document.getElementById('product-qty').value;
    // Use first image as main, store all in images array
    const image = currentImages.length > 0 ? currentImages[0] : '';
    const images = currentImages;

    if (editingId) {
        // Update
        const index = products.findIndex(p => p.id === editingId);
        if (index !== -1) {
            products[index] = { ...products[index], name, description, price, category, qty, image, images };
        }
    } else {
        // Create
        const newId = 'P' + String(Date.now()).slice(-4);
        products.push({ id: newId, name, description, price, category, qty, image, images });
    }

    saveProductsToStorage();
    closeModal();
    render();
}

// Order Modal Functions
function openOrderModal(id) {
    const order = orders.find(o => o.id === id);
    if (!order) return;

    editingId = id; // reuse this variable to track which order is being viewed
    orderModal.style.display = 'flex';
    orderModal.classList.add('active');

    // Populate Data
    document.getElementById('view-order-id').textContent = order.id;
    document.getElementById('view-order-date').textContent = new Date(order.date).toLocaleString();

    // Status Badge Color
    const statusEl = document.getElementById('view-order-status');
    statusEl.textContent = order.status;
    statusEl.className = ''; // reset
    if (order.status === 'new') statusEl.style.color = 'blue';
    else if (order.status === 'in-process') statusEl.style.color = 'orange';
    else if (order.status === 'completed') statusEl.style.color = 'green';

    // Customer Info (Handle missing data gracefully)
    document.getElementById('view-customer-name').textContent = order.name || 'Guest';
    document.getElementById('view-customer-phone').textContent = order.phone || 'N/A';
    const loc = [order.address, order.city, order.zip].filter(Boolean).join(', ');
    document.getElementById('view-customer-location').textContent = loc || 'N/A';

    // Items
    const itemsContainer = document.getElementById('view-order-items');
    itemsContainer.innerHTML = (order.items || []).map(item => {
        // Find product details if possible, or use item data
        // item usually has name, qty, id. 
        // We can look up current product description if needed, but item snapshot is safer if product changed.
        // For "About product", we'll check the product list for match.
        const productRef = products.find(p => p.id == item.id);
        const description = productRef ? (productRef.description || '') : '';
        const category = productRef ? (productRef.category || '') : '';

        return `
            <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem; background: white; padding: 0.5rem; border-radius: 4px; border: 1px solid #eee;">
                <div style="flex: 1;">
                    <div style="font-weight: bold; font-size: 0.9rem;">${item.name}</div>
                    <div style="font-size: 0.8rem; color: #666;">Qty: ${item.qty}</div>
                    ${category ? `<div style="font-size: 0.75rem; color: #888;">${category}</div>` : ''}
                    ${description ? `<div style="font-size: 0.75rem; color: #555; margin-top:0.2rem;">${description.substring(0, 50)}${description.length > 50 ? '...' : ''}</div>` : ''}
                </div>
                <div style="font-weight: bold;">₹${item.price || 0}</div>
            </div>
        `;
    }).join('');

    document.getElementById('view-order-total').textContent = '₹' + (order.total || 0);

    // Set Status Dropdown
    document.getElementById('modal-status-select').value = order.status;
}

function closeOrderModal() {
    orderModal.style.display = 'none';
    orderModal.classList.remove('active');
    editingId = null;
}

function updateOrderStatus() {
    if (!editingId) return;

    const newStatus = document.getElementById('modal-status-select').value;
    const orderIndex = orders.findIndex(o => o.id === editingId);

    if (orderIndex !== -1) {
        orders[orderIndex].status = newStatus;
        saveOrdersToStorage();

        // Reflect change in modal UI instantly?
        const statusEl = document.getElementById('view-order-status');
        statusEl.textContent = newStatus;
        if (newStatus === 'new') statusEl.style.color = 'blue';
        else if (newStatus === 'in-process') statusEl.style.color = 'orange';
        else if (newStatus === 'completed') statusEl.style.color = 'green';

        // Also re-render background list (it might disappear if filtered)
        render();

        // Optional: Alert or small feedback
        alert('Order status updated');
    }
}

function render() {
    listContainer.innerHTML = '';

    // Inject Count Badge logic
    const btnOrders = document.getElementById('btn-orders');
    if (btnOrders) {
        btnOrders.innerHTML = `ORDERS <span class="order-counter">${orders.length}</span>`;
    }

    const btnProducts = document.getElementById('btn-products');
    if (btnProducts) {
        btnProducts.innerHTML = `PRODUCTS <span class="order-counter">${products.length}</span>`;
    }

    let itemsToRender = [];

    if (currentView === 'products') {
        itemsToRender = products;
    } else {
        itemsToRender = orders.filter(o => o.status === currentFilter);
    }

    itemsToRender.forEach(item => {
        const el = document.createElement('div');
        el.className = 'admin-list-item';

        let actionButtons = '';

        if (currentView === 'products') {
            actionButtons = `
            <div class="view-btn-container" style="flex-direction:row; gap:0.5rem;">
                <button class="view-btn edit-btn" data-id="${item.id}" style="background:#333; font-size: 0.7rem;">EDIT</button>
                <button class="view-btn delete-btn" data-id="${item.id}" style="background:red; font-size: 0.7rem;">DEL</button>
            </div>
        `;
        } else {
            // View Button replacement
            actionButtons = `
            <div class="view-btn-container">
                <button class="view-btn view-order-btn" data-id="${item.id}" style="background: #2C1B10;">VIEW</button>
            </div>
         `;
        }

        let imageHtml = '';
        if (item.image) {
            imageHtml = `<img src="${item.image}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        } else {
            imageHtml = `<span class="text-xs text-red">#IMAGE</span>`;
        }

        el.innerHTML = `
      <div class="admin-item-image">
        ${imageHtml}
      </div>
      <div class="admin-item-details">
        <p><strong>${currentView === 'products' ? 'ID' : 'ORD'} :</strong> ${item.id}</p>
        <p><strong>NAME :</strong> ${item.name}</p>
        <p><strong>QTY :</strong> ${item.qty}</p>
        ${currentView === 'products' ? `<p><strong>PRICE :</strong> ${item.price}</p>` : ''}
      </div>
      ${actionButtons}
    `;
        listContainer.appendChild(el);
    });

    if (itemsToRender.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; padding: 2rem;">No items found.</p>';
    }
}

// Real-time updates
window.addEventListener('storage', (e) => {
    if (e.key === 'orders' || e.key === 'products') {
        console.log('Storage changed: refreshing view');
        products = JSON.parse(localStorage.getItem('products')) || [];
        orders = JSON.parse(localStorage.getItem('orders')) || [];
        render();
    }
});

init();
