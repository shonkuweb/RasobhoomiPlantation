// Authentication - Redirect to login page if not authenticated
async function checkAuth() {
    const token = sessionStorage.getItem('adminToken');

    if (!token) {
        // No token, redirect to login
        window.location.href = '/admin-login';
        return;
    }

    // Verify token with server
    try {
        const res = await fetch('/api/auth/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            // Token is valid, fetch data
            fetchData();
        } else {
            // Token invalid, clear and redirect
            sessionStorage.removeItem('adminToken');
            window.location.href = '/admin-login';
        }
    } catch (err) {
        console.error('Auth verification failed:', err);
        sessionStorage.removeItem('adminToken');
        window.location.href = '/admin-login';
    }
}

// State
let products = [];
let orders = [];
let categories = [];

// Helper function to get auth headers
function getAuthHeaders() {
    const token = sessionStorage.getItem('adminToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

async function fetchData() {
    try {
        const [pRes, oRes, cRes] = await Promise.all([
            fetch('/api/products'),
            fetch('/api/orders'),
            fetch('/api/categories')
        ]);

        // Safe Parsing
        const pData = await pRes.json();
        const oData = await oRes.json();

        // Check if array
        if (Array.isArray(pData)) {
            products = pData;
        } else {
            console.error('Products API Error:', pData);
            window.showToast('Error loading Products', 'error');
            products = [];
        }

        if (cRes.ok) {
            categories = await cRes.json();
            renderCategories();
        }

        if (Array.isArray(oData)) {
            orders = oData;
        } else {
            console.error('Orders API Error:', oData);
            window.showToast('Error loading Orders', 'error');
            orders = [];
        }

        render(); // Re-render after fetch

        // Update counts in buttons (Safely)
        const btnOrders = document.getElementById('btn-orders');
        if (btnOrders) btnOrders.innerHTML = `ORDERS <span class="order-counter">${orders.length}</span>`;
        const btnProducts = document.getElementById('btn-products');
        if (btnProducts) btnProducts.innerHTML = `PRODUCTS <span class="order-counter">${products.length}</span>`;

    } catch (e) {
        console.error('Admin Fetch Failed', e);
        window.showToast('Failed to load data from server', 'error');
    }
}

let currentView = 'products';
let currentOrderFilter = 'new';
let currentProductFilter = 'all';
let editingId = null;

// Order Status Flow
const STATUS_FLOW = ['new', 'in-process', 'in-transit', 'completed'];

// Elements
const viewToggle = document.getElementById('view-toggle');
const productsBtn = document.getElementById('btn-products');
const ordersBtn = document.getElementById('btn-orders');
// Filter Containers
// Filter Containers
const productToolbar = document.getElementById('product-toolbar');
const orderFilterSection = document.getElementById('order-filters');
const listContainer = document.getElementById('admin-list');
const filterToggleBtn = document.getElementById('filter-toggle-btn');
const filterDropdown = document.getElementById('filter-dropdown');
const activeFilterLabel = document.getElementById('active-filter-label');
const filterBtns = document.querySelectorAll('.filter-chip');
const addProductBtn = document.getElementById('add-product-btn');
const productModal = document.getElementById('product-modal');
const closeModalBtn = document.getElementById('close-modal');
const productForm = document.getElementById('product-form');
const modalTitle = document.getElementById('modal-title');
const resetDbBtn = document.getElementById('reset-db-btn');
const delCompletedBtn = document.getElementById('delete-completed-btn');
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
    setupListeners();
    // switchView called after data load or defaults
    switchView('products');
}

function setupListeners() {
    // Sidebar Logic
    const menuBtn = document.getElementById('menu-btn');
    const sidebar = document.getElementById('sidebar');
    const closeSidebarBtn = document.getElementById('close-sidebar');
    const overlay = document.getElementById('overlay');

    if (menuBtn && sidebar && overlay) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.add('active');
            overlay.classList.add('active');
        });
    }

    function closeSidebar() {
        if (sidebar) sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    }

    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', closeSidebar);
    }
    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }

    productsBtn.addEventListener('click', () => switchView('products'));
    ordersBtn.addEventListener('click', () => switchView('orders'));

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                sessionStorage.removeItem('adminToken');
                window.location.href = '/admin-login';
            }
        });
    }

    // Filter Toggle Logic
    if (filterToggleBtn) {
        filterToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            filterDropdown.classList.toggle('active');
        });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (filterDropdown && filterDropdown.classList.contains('active')) {
            if (!filterDropdown.contains(e.target) && !filterToggleBtn.contains(e.target)) {
                filterDropdown.classList.remove('active');
            }
        }
    });

    // Determine Filter Click (Delegation for Dropdown Items)
    if (filterDropdown) {
        filterDropdown.addEventListener('click', (e) => {
            const target = e.target.closest('.dropdown-item');
            if (target) {
                currentProductFilter = target.dataset.filter;
                updateFilterUI();
                render();
                filterDropdown.classList.remove('active');
            }
        });
    }

    // Existing Order Filters (Chips)
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filterType = e.target.dataset.type; // 'order' only now
            if (!filterType) return;

            const filterValue = e.target.dataset.filter;
            currentOrderFilter = filterValue;
            updateFilterUI();
            render();
        });
    });

    // Danger Zone Listeners
    if (resetDbBtn) {
        resetDbBtn.addEventListener('click', () => {
            showConfirm('WARNING: This will delete ALL products. Are you sure?', () => {
                localStorage.removeItem('products');
                products = [];
                render();
                window.showToast('Database Reset Complete', 'success');
            });
        });
    }

    if (delCompletedBtn) {
        delCompletedBtn.addEventListener('click', () => {
            const completedCount = orders.filter(o => o.status === 'completed').length;
            if (completedCount === 0) {
                window.showToast('No completed orders found.', 'info');
                return;
            }

            showConfirm(`Delete ${completedCount} completed orders? This cannot be undone.`, () => {
                orders = orders.filter(o => o.status !== 'completed');
                saveOrdersToStorage();
                render();
                window.showToast('Completed history deleted.', 'success');
            });
        });
    }

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
            try {
                saveProduct();
                window.showToast('Product Saved Successfully!');
            } catch (err) {
                console.error(err);
                window.showToast('Error capturing product', 'error');
            }
        });
    } else {
        window.showToast('Internal Error: Product Form Missing', 'error');
        console.error('Product form not found');
    }

    // Image Upload
    if (productImagesInput) {
        productImagesInput.addEventListener('change', handleImageUpload);
    }

    // Camera Upload
    const cameraBtn = document.getElementById('btn-camera');
    const cameraInput = document.getElementById('camera-input');

    if (cameraBtn && cameraInput) {
        cameraBtn.addEventListener('click', () => {
            cameraInput.click();
        });
        cameraInput.addEventListener('change', handleImageUpload);
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
        window.showToast('You can only upload up to 3 images.', 'error');
        return;
    }

    files.forEach(file => {
        if (!file.type.startsWith('image/')) return;

        compressImage(file, 800, 0.7).then(compressedDataUrl => {
            currentImages.push(compressedDataUrl);
            renderPreviews();
        }).catch(err => {
            console.error('Compression failed', err);
            window.showToast('Failed to process image', 'error');
        });
    });

    e.target.value = '';
}

// Helper: Compress Image using Canvas
function compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
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
        productsBtn.classList.add('active');
        ordersBtn.classList.remove('active');
        if (productToolbar) productToolbar.style.display = 'flex';
        orderFilterSection.style.display = 'none';
        if (resetDbBtn) resetDbBtn.style.display = 'block';
        if (delCompletedBtn) delCompletedBtn.style.display = 'none';
    } else {
        productsBtn.classList.remove('active');
        ordersBtn.classList.add('active');
        if (productToolbar) productToolbar.style.display = 'none';
        orderFilterSection.style.display = 'flex';
        if (resetDbBtn) resetDbBtn.style.display = 'none';
        if (delCompletedBtn) delCompletedBtn.style.display = 'block';
    }

    checkAddButtonVisibility();
    render();
}

function checkAddButtonVisibility() {
    addProductBtn.style.display = currentView === 'products' ? 'block' : 'none';
}

function renderCategories() {
    // 1. Populate Dropdown
    if (filterDropdown) {
        filterDropdown.innerHTML = '';

        // Add "All"
        const allItem = document.createElement('div');
        allItem.className = `dropdown-item ${currentProductFilter === 'all' ? 'active' : ''}`;
        allItem.dataset.filter = 'all';
        allItem.textContent = 'ALL';
        filterDropdown.appendChild(allItem);

        // Add Categories
        categories.forEach(cat => {
            const item = document.createElement('div');
            item.className = `dropdown-item ${currentProductFilter === cat.name ? 'active' : ''}`;
            item.dataset.filter = cat.name;
            item.textContent = cat.name.toUpperCase();
            filterDropdown.appendChild(item);
        });

        // Add "Out of Stock"
        const outItem = document.createElement('div');
        outItem.className = `dropdown-item ${currentProductFilter === 'out-of-stock' ? 'active' : ''}`;
        outItem.dataset.filter = 'out-of-stock';
        outItem.textContent = 'OUT OF STOCK';
        outItem.style.color = 'red';
        filterDropdown.appendChild(outItem);
    }

    // 2. Populate Modal Dropdown
    const categorySelect = document.getElementById('product-category');
    if (categorySelect) {
        categorySelect.innerHTML = '<option value="" disabled selected>Select Category</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.name;
            option.textContent = cat.name;
            categorySelect.appendChild(option);
        });
    }
}

function updateFilterUI() {
    // Update Dropdown Items
    if (filterDropdown) {
        const items = filterDropdown.querySelectorAll('.dropdown-item');
        items.forEach(item => {
            if (item.dataset.filter === currentProductFilter) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // Update Toggle Label
    if (activeFilterLabel) {
        activeFilterLabel.style.display = 'block';
        activeFilterLabel.textContent = currentProductFilter === 'all' ? 'ALL' : currentProductFilter.toUpperCase();
    }

    // Update Order Chips
    filterBtns.forEach(btn => {
        const type = btn.dataset.type;
        const val = btn.dataset.filter;
        if (type === 'order' && val === currentOrderFilter) {
            btn.classList.add('active');
        } else if (type === 'order') {
            btn.classList.remove('active');
        }
    });
}

// Persist Helper - API handles this now
// function saveProductsToStorage() ... 
// function saveOrdersToStorage() ...

// CRUD Operations
function deleteProduct(id) {
    showConfirm('Are you sure you want to delete this product?', async () => {
        try {
            const res = await fetch(`/api/products/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
            if (res.ok) {
                fetchData();
            } else {
                window.showToast('Failed to delete', 'error');
            }
        } catch (e) {
            console.error(e);
            window.showToast('Error deleting product', 'error');
        }
    });
}

function openModal(id = null) {
    productModal.style.display = 'flex';
    productModal.classList.add('active');
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

async function saveProduct() {
    const saveBtn = document.querySelector('#product-form button[type="submit"]');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'SAVING...';
    }

    try {
        const name = document.getElementById('product-name').value;
        const description = document.getElementById('product-desc').value;
        const price = parseFloat(document.getElementById('product-price').value) || 0;
        const category = document.getElementById('product-category').value;
        const qty = parseInt(document.getElementById('product-qty').value) || 0;
        const image = currentImages.length > 0 ? currentImages[0] : '';
        const images = currentImages;

        const payload = { name, description, price, category, qty, image, images };
        console.log('Sending Payload:', payload);

        let res;
        if (editingId) {
            // Update
            res = await fetch(`/api/products/${editingId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
        } else {
            // Create
            res = await fetch('/api/products', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
        }

        const data = await res.json();

        if (res.ok) {
            console.log('Save Success:', data);
            closeModal();
            fetchData();
            window.showToast('Product Saved Successfully!', 'success');
        } else {
            console.error('Save Failed:', data);
            window.showToast(data.error || 'Failed to save', 'error');
        }
    } catch (e) {
        console.error('Save Exception:', e);
        window.showToast('Error saving product: ' + e.message, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'SAVE';
        }
    }
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
    else if (order.status === 'in-transit') statusEl.style.color = '#8B4513'; // SaddleBrown
    else if (order.status === 'completed') statusEl.style.color = 'green';

    // Customer Info (Handle missing data gracefully)
    document.getElementById('view-customer-name').textContent = order.name || 'Guest';
    document.getElementById('view-customer-phone').textContent = order.phone || 'N/A';
    const loc = [order.address, order.city, order.zip].filter(Boolean).join(', ');
    document.getElementById('view-customer-location').textContent = loc || 'N/A';

    // Transaction ID if available
    const tid = order.transaction_id || 'N/A';
    // Add logic to show it if UI supports it, otherwise log
    console.log('Transaction ID:', tid);

    // Items
    const itemsContainer = document.getElementById('view-order-items');
    itemsContainer.innerHTML = (order.items || []).map(item => {
        // Find product details if possible, or use item data
        const productRef = products.find(p => p.id == item.id);
        const category = productRef ? (productRef.category || '') : '';

        return `
            <div class="order-item-row">
                <div style="flex: 1;">
                    <div style="font-weight: 800; font-size: 0.95rem; color: #2C1B10; margin-bottom: 0.2rem;">${item.name}</div>
                    <div style="font-size: 0.8rem; color: #666; font-weight: 600;">Qty: ${item.qty}</div>
                    ${category ? `<div style="font-size: 0.75rem; color: #888; text-transform:uppercase; letter-spacing:0.5px; margin-top:0.2rem;">${category}</div>` : ''}
                </div>
                <div style="font-weight: 800; color: #2C1B10;">₹${item.price || 0}</div>
            </div>
        `;
    }).join('');

    document.getElementById('view-order-total').textContent = '₹' + (order.total || 0);

    // Set Status Dropdown
    const select = document.getElementById('modal-status-select');
    select.value = order.status;

    // Disable options that are backward in the flow
    const currentIdx = STATUS_FLOW.indexOf(order.status);
    Array.from(select.options).forEach(option => {
        const optionIdx = STATUS_FLOW.indexOf(option.value);
        if (optionIdx < currentIdx) {
            option.disabled = true;
        } else {
            option.disabled = false;
        }
    });

    const delBtn = document.getElementById('delete-order-btn');
    // Ensure we handle delete button event properly if it exists in modal
    if (delBtn) {
        delBtn.onclick = () => deleteOrder(order.id);
    }
}

function closeOrderModal() {
    orderModal.style.display = 'none';
    orderModal.classList.remove('active');
    editingId = null;
}

async function updateOrderStatus() {
    if (!editingId) return;

    const newStatus = document.getElementById('modal-status-select').value;

    try {
        const res = await fetch(`/api/orders/${editingId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: newStatus })
        });

        if (res.ok) {
            const statusEl = document.getElementById('view-order-status');
            if (statusEl) {
                statusEl.textContent = newStatus;
                // color update logic...
            }
            closeOrderModal();
            fetchData();
        } else {
            window.showToast('Failed to update status', 'error');
        }

    } catch (e) {
        console.error(e);
        window.showToast('Error updating status', 'error');
    }
}

function deleteOrder(id) {
    showConfirm('Delete this order?', async () => {
        try {
            const res = await fetch(`/api/orders/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
            if (res.ok) {
                closeOrderModal();
                fetchData();
            } else {
                window.showToast('Failed to delete order', 'error');
            }
        } catch (e) {
            console.error(e);
            window.showToast('Error deleting order', 'error');
        }
    });
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
        if (currentProductFilter === 'all') {
            itemsToRender = [...products];
        } else if (currentProductFilter === 'out-of-stock') {
            itemsToRender = products.filter(p => Number(p.qty) <= 0);
        } else {
            // Category Match (Partial include match to be safe)
            itemsToRender = products.filter(p => (p.category || '').includes(currentProductFilter));
        }
    } else {
        itemsToRender = orders.filter(o => o.status === currentOrderFilter);
    }

    // LIFO (Last In First Out) - Newest First
    itemsToRender.reverse();

    itemsToRender.forEach(item => {
        const el = document.createElement('div');
        el.className = 'admin-list-item';

        let actionButtons = '';
        let detailsHtml = '';

        if (currentView === 'products') {
            // PRODUCT SPECIFIC UI
            actionButtons = `
            <div class="view-btn-container" style="flex-direction:row; gap:0.5rem;">
                <button class="view-btn edit-btn" data-id="${item.id}">EDIT</button>
                <button class="view-btn delete-btn" data-id="${item.id}">DEL</button>
            </div>
            `;

            detailsHtml = `
                <div class="admin-item-details">
                    <p class="item-id">#${item.id}</p>
                    <p style="font-size:0.75rem; color:#8B6F47; font-weight:bold; text-transform:uppercase; margin-bottom:2px;">${item.category || 'Uncategorized'}</p>
                    <h3 class="item-name">${item.name}</h3>
                    <div class="item-meta">
                        <span>Qty: ${item.qty}</span>
                        <span>₹${item.price}</span>
                    </div>
                </div>
            `;
        } else {
            // ORDER SPECIFIC UI
            actionButtons = `
            <div class="view-btn-container">
                <button class="view-btn view-order-btn" data-id="${item.id}">VIEW</button>
            </div>
            `;

            // Calculate total items for order
            const totalItems = (item.items || []).reduce((sum, i) => sum + Number(i.qty), 0);

            detailsHtml = `
                <div class="admin-item-details">
                    <p class="item-id">ORD #${item.id}</p>
                    <h3 class="item-name">${item.name || 'Guest'}</h3>
                    <div class="item-meta">
                        <span>Items: ${totalItems}</span>
                        <span>₹${item.total || 0}</span>
                    </div>
                    <div class="status-badge status-${item.status}">${item.status}</div>
                </div>
            `;
        }

        let imageHtml = '';
        if (item.image) {
            imageHtml = `<img src="${item.image}" alt="Product">`;
        } else {
            imageHtml = `<div class="no-image">IMG</div>`;
        }

        el.innerHTML = `
            <div class="admin-item-image">
                ${imageHtml}
            </div>
            ${detailsHtml}
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
