import { sortProductsWithMangoFirst, sortCategoriesWithMangoFirst } from './storefrontMangoSort.js';

function getAdminToken() {
    return localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
}

function setAdminToken(token) {
    if (token) {
        localStorage.setItem('adminToken', token);
        sessionStorage.setItem('adminToken', token);
    }
}

function clearAdminToken() {
    localStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminToken');
}

let adminAiTranslationsMap = {};

async function fetchAdminAiTranslations(lang) {
    if (lang === 'en') return;
    try {
        const res = await fetch(`/api/products/translations?lang=${lang}`);
        if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.products)) {
                const map = {};
                data.products.forEach(p => { if (p && p.id) map[p.id] = p; });
                adminAiTranslationsMap[lang] = map;
                render();
            }
        }
    } catch (e) {
        console.error('Admin AI translation fetch failed:', e);
    }
}

function translateProductAdmin(p, lang = 'en') {
    if (!p) return p;
    if (lang === 'en') return p;
    if (adminAiTranslationsMap[lang] && adminAiTranslationsMap[lang][p.id]) {
        const aiTrans = adminAiTranslationsMap[lang][p.id];
        return {
            ...p,
            name: aiTrans.name || p.name,
            description: aiTrans.description || p.description,
            category: aiTrans.category || p.category
        };
    }
    const categoryTranslations = {
        "Indian Mangoes": { hi: "भारतीय आम", bn: "ভারতীয় আম" },
        "Foreigner Mango": { hi: "विदेशी आम", bn: "विदेशী আম" },
        "Fruit Plants": { hi: "फलदार पौधे", bn: "ফল গাছ" },
        "Guava": { hi: "अमरूद", bn: "পেয়ারা" },
        "Lemon": { hi: "नींबू", bn: "লেবু" },
        "Jackfruit": { hi: "कटहल", bn: "কাঁঠাল" }
    };
    const productTranslations = {
        "P1": {
            name: { hi: "आम का पौधा (आम्रपाली)", bn: "আম গাছ (আম্রপালী)" },
            category: { hi: "भारतीय आम", bn: "ভারতীয় আম" }
        },
        "P2": {
            name: { hi: "लाल अमरूद का पौधा", bn: "लाल पेय़ारा গাছ" },
            category: { hi: "अमरूद", bn: "পেয়ারা" }
        },
        "P3": {
            name: { hi: "कोलकाता पाती नींबू", bn: "কলকাতা পাতি লেবু" },
            category: { hi: "नींबू", bn: "লেবু" }
        },
        "P4": {
            name: { hi: "थाई पिंक कटहल", bn: "থাই পিঙ্ক কাঁঠাল" },
            category: { hi: "कटहल", bn: "কাঁঠাল" }
        }
    };
    if (p.id && productTranslations[p.id]) {
        const trans = productTranslations[p.id];
        return {
            ...p,
            name: (trans.name && trans.name[lang]) || p.name,
            category: (trans.category && trans.category[lang]) || p.category
        };
    }
    let translatedName = p.name || '';
    let translatedCategory = p.category || '';
    if (p.category && categoryTranslations[p.category] && categoryTranslations[p.category][lang]) {
        translatedCategory = categoryTranslations[p.category][lang];
    }
    if (lang === 'hi') {
        translatedName = translatedName.replace(/Mango Plant/gi, "आम का पौधा").replace(/Mango/gi, "आम").replace(/Guava Plant/gi, "अमरूद का पौधा").replace(/Lemon Plant/gi, "नींबू का पौधा").replace(/Jackfruit/gi, "कटहल").replace(/Plant/gi, "पौधा").replace(/test2/gi, "परीक्षण २").replace(/test/gi, "परीक्षण");
    } else if (lang === 'bn') {
        translatedName = translatedName.replace(/Mango Plant/gi, "আম গাছ").replace(/Mango/gi, "আম").replace(/Guava Plant/gi, "পেয়ারা গাছ").replace(/Lemon Plant/gi, "লেবু গাছ").replace(/Jackfruit/gi, "কাঁঠাল").replace(/Plant/gi, "গাছ").replace(/test2/gi, "পরীক্ষা ২").replace(/test/gi, "পরীক্ষা");
    }
    return { ...p, name: translatedName, category: translatedCategory };
}

// Authentication - Redirect to login page if not authenticated
async function checkAuth() {
    const token = getAdminToken();

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
            setAdminToken(token);
            fetchData();
        } else if (res.status === 401) {
            clearAdminToken();
            window.location.href = '/admin-login';
        } else {
            fetchData();
        }
    } catch (err) {
        console.error('Auth verification network failed:', err);
        fetchData();
    }
}

// State
let products = [];
let orders = [];
let categories = [];
let currentProductSearch = '';
let currentOrderSearch = '';
let orderSettingsRefreshTimer = null;
let currentOrderSettings = null;

// Helper function to get auth headers
function getAuthHeaders() {
    const token = getAdminToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

const ORDER_SETTINGS_POLL_MS = 15000;

let productTotalCount = 0;
let productTotalKnown = false;
let productsHasMore = false;
let productsLoadingBatch = false;
let productsPage = 0;

function getDisplayProductCount() {
    if (!productTotalKnown) {
        return products.length;
    }
    return productTotalCount;
}

function updateProductCounterBadge() {
    const btnProducts = document.getElementById('btn-products');
    if (btnProducts) {
        btnProducts.innerHTML = `PRODUCTS <span class="order-counter">${getDisplayProductCount()}</span>`;
    }
}

async function fetchData() {
    try {
        // Fetch orders and categories in parallel
        const [oRes, cRes] = await Promise.all([
            fetch('/api/orders'),
            fetch('/api/categories')
        ]);

        const oData = await oRes.json();

        if (cRes.ok) {
            categories = await cRes.json();
            renderCategories();
        }

        if (Array.isArray(oData)) {
            // Admin order list should include only successfully paid orders.
            orders = oData.filter(o => String(o.payment_status || '').toLowerCase() === 'paid');
        } else {
            console.error('Orders API Error:', oData);
            window.showToast('Error loading Orders', 'error');
            orders = [];
        }

        // Update order count button
        const btnOrders = document.getElementById('btn-orders');
        if (btnOrders) btnOrders.innerHTML = `ORDERS <span class="order-counter">${orders.length}</span>`;

        // Load all products in one request (server-cached)
        products = [];
        productTotalCount = 0;
        productTotalKnown = false;
        productsHasMore = false;
        productsPage = 0;
        updateProductCounterBadge();
        await fetchAllProducts();

    } catch (e) {
        console.error('Admin Fetch Failed', e);
        window.showToast('Failed to load data from server', 'error');
    }
}

async function fetchAllProducts() {
    if (productsLoadingBatch) return;
    productsLoadingBatch = true;
    try {
        const res = await fetch('/api/products');
        if (!res.ok) return;
        const raw = await res.json();
        const data = Array.isArray(raw) ? raw : (raw.products || []);

        products = sortProductsWithMangoFirst(data);
        productTotalCount = products.length;
        productTotalKnown = true;
        productsHasMore = false;
        productsPage = 1;

        updateProductCounterBadge();
        if (currentView === 'products') render();
    } catch (e) {
        console.error('Product fetch failed', e);
    } finally {
        productsLoadingBatch = false;
    }
}

async function fetchOrders() {
    try {
        const res = await fetch('/api/orders');
        const data = await res.json();
        if (Array.isArray(data)) {
            // Keep refresh behavior consistent: show only paid orders.
            orders = data.filter(o => String(o.payment_status || '').toLowerCase() === 'paid');
            if (currentView === 'orders') render();
            const btnOrders = document.getElementById('btn-orders');
            if (btnOrders) btnOrders.innerHTML = `ORDERS <span class="order-counter">${orders.length}</span>`;
        }
    } catch (e) {
        console.error('Order refresh failed', e);
    }
}

function startOrdersAutoRefresh() {
    if (ordersRefreshTimer) clearInterval(ordersRefreshTimer);
    ordersRefreshTimer = setInterval(fetchOrders, 30000); // Refresh every 30 seconds
}

let currentView = 'products';
let currentOrderFilter = 'all';
let currentProductFilter = 'all';
let editingId = null;
let ordersRefreshTimer = null;

// Order Status Flow
const STATUS_FLOW = ['new', 'in-process', 'in-transit', 'completed'];

// Elements
const viewToggle = document.getElementById('view-toggle');
const productsBtn = document.getElementById('btn-products');
const ordersBtn = document.getElementById('btn-orders');
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
// Search Elements
const productSearchInput = document.getElementById('product-search');
const orderSearchInput = document.getElementById('order-search');

// Order Modal Elements
const orderModal = document.getElementById('order-modal');
const closeOrderModalBtn = document.getElementById('close-order-modal');
const modalUpdateStatusBtn = document.getElementById('modal-update-status-btn');

// Settings Elements
const settingsBtn = document.getElementById('btn-settings');
const settingsView = document.getElementById('settings-view');
const settingsPasswordForm = document.getElementById('settings-password-form');
const settingsPasswordError = document.getElementById('settings-password-error');
const settingsPasswordSuccess = document.getElementById('settings-password-success');
const settingsOrderForm = document.getElementById('settings-order-form');
const settingsMinOrderQty = document.getElementById('settings-min-order-qty');
const settingsDeliveryPerPlant = document.getElementById('settings-delivery-per-plant');
const settingsDrumMultiplier = document.getElementById('settings-drum-multiplier');
const settingsFreeDeliveryEnabled = document.getElementById('settings-free-delivery-enabled');
const settingsFreeStart = document.getElementById('settings-free-start');
const settingsFreeEnd = document.getElementById('settings-free-end');
const settingsOrderError = document.getElementById('settings-order-error');
const settingsOrderSuccess = document.getElementById('settings-order-success');
const settingsOrderSaveBtn = document.getElementById('settings-order-save-btn');

const settingsHeroVideoForm = document.getElementById('settings-hero-video-form');
const settingsHeroVideoUrl = document.getElementById('settings-hero-video-url');
const settingsHeroVideoError = document.getElementById('settings-hero-video-error');
const settingsHeroVideoSuccess = document.getElementById('settings-hero-video-success');
const settingsHeroVideoSaveBtn = document.getElementById('settings-hero-video-save-btn');


// Discount Elements
const discountsBtn = document.getElementById('btn-discounts');
const discountsView = document.getElementById('discounts-view');
const addDiscountBtn = document.getElementById('add-discount-btn');
const discountsTable = document.getElementById('discounts-table');
const discountsTableBody = document.getElementById('discounts-table-body');
const discountsLoading = document.getElementById('discounts-loading');
const discountsEmpty = document.getElementById('discounts-empty');
const discountModal = document.getElementById('discount-modal');
const closeDiscountModalBtn = document.getElementById('close-discount-modal');
const cancelDiscountBtn = document.getElementById('cancel-discount-btn');
const discountForm = document.getElementById('discount-form');
const discountModalTitle = document.getElementById('discount-modal-title');
const discountNameInput = document.getElementById('discount-name');
const discountAmount1Input = document.getElementById('discount-amount1');
const discountOperatorSelect = document.getElementById('discount-operator');
const discountAmount2Input = document.getElementById('discount-amount2');
const discountTypeSelect = document.getElementById('discount-type');
const discountValueWrapper = document.getElementById('discount-value-wrapper');
const discountValueLabel = document.getElementById('discount-value-label');
const discountValueInput = document.getElementById('discount-value');
const discountEnabledCheckbox = document.getElementById('discount-enabled');
const discountFormError = document.getElementById('discount-form-error');

let discounts = [];
let editingDiscountId = null;

// State for image handling
let currentImages = [];

// Initialize
function init() {
    checkAuth();
    setupListeners();
    fetchOrderSettings();
    fetchHeroVideoSetting();
    // switchView called after data load or defaults
    switchView('products');
    startOrdersAutoRefresh();
    startOrderSettingsAutoRefresh();
}

function toDateTimeLocal(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${y}-${m}-${d}T${hh}:${mm}`;
}

function fromDateTimeLocal(localString) {
    if (!localString) return null;
    const date = new Date(localString);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function applyOrderSettingsToForm(settings) {
    if (!settings) return;
    currentOrderSettings = settings;
    if (settingsMinOrderQty) settingsMinOrderQty.value = settings.minimumOrderQty ?? 3;
    if (settingsDeliveryPerPlant) settingsDeliveryPerPlant.value = settings.deliveryPerPlant ?? 150;
    if (settingsDrumMultiplier) settingsDrumMultiplier.value = settings.drumDeliveryMultiplier ?? 0.5;
    if (settingsFreeDeliveryEnabled) settingsFreeDeliveryEnabled.checked = Boolean(settings.freeDeliveryEnabled);
    if (settingsFreeStart) settingsFreeStart.value = toDateTimeLocal(settings.freeDeliveryStartsAt);
    if (settingsFreeEnd) settingsFreeEnd.value = toDateTimeLocal(settings.freeDeliveryEndsAt);
}

async function fetchOrderSettings() {
    try {
        const res = await fetch('/api/settings/order');
        if (!res.ok) return;
        const data = await res.json();
        applyOrderSettingsToForm(data);
    } catch (err) {
        console.error('Failed to fetch order settings', err);
    }
}

function startOrderSettingsAutoRefresh() {
    if (orderSettingsRefreshTimer) clearInterval(orderSettingsRefreshTimer);
    orderSettingsRefreshTimer = setInterval(fetchOrderSettings, ORDER_SETTINGS_POLL_MS);
}

async function saveOrderSettings(e) {
    e.preventDefault();
    if (!settingsOrderForm) return;

    if (settingsOrderError) settingsOrderError.textContent = '';
    if (settingsOrderSuccess) settingsOrderSuccess.textContent = '';
    if (settingsOrderSaveBtn) {
        settingsOrderSaveBtn.disabled = true;
        settingsOrderSaveBtn.textContent = 'SAVING...';
    }

    try {
        const payload = {
            minimumOrderQty: Number(settingsMinOrderQty?.value || 3),
            deliveryPerPlant: Number(settingsDeliveryPerPlant?.value || 150),
            drumDeliveryMultiplier: Number(settingsDrumMultiplier?.value || 0.5),
            freeDeliveryEnabled: Boolean(settingsFreeDeliveryEnabled?.checked),
            freeDeliveryStartsAt: fromDateTimeLocal(settingsFreeStart?.value),
            freeDeliveryEndsAt: fromDateTimeLocal(settingsFreeEnd?.value)
        };

        const res = await fetch('/api/admin/settings/order', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to update order settings');
        }

        applyOrderSettingsToForm(data.settings);
        if (settingsOrderSuccess) settingsOrderSuccess.textContent = 'Order settings updated successfully.';
    } catch (err) {
        console.error('Order settings save failed:', err);
        if (settingsOrderError) settingsOrderError.textContent = err.message || 'Network error. Try again.';
    } finally {
        if (settingsOrderSaveBtn) {
            settingsOrderSaveBtn.disabled = false;
            settingsOrderSaveBtn.textContent = 'SAVE ORDER SETTINGS';
        }
    }
}

async function fetchHeroVideoSetting() {
    try {
        const res = await fetch('/api/settings/hero-video');
        if (!res.ok) return;
        const data = await res.json();
        if (settingsHeroVideoUrl) {
            settingsHeroVideoUrl.value = data.heroVideoUrl || '';
        }
    } catch (err) {
        console.error('Failed to fetch hero video setting', err);
    }
}

async function saveHeroVideoSettings(e) {
    e.preventDefault();
    if (!settingsHeroVideoForm) return;

    if (settingsHeroVideoError) settingsHeroVideoError.textContent = '';
    if (settingsHeroVideoSuccess) settingsHeroVideoSuccess.textContent = '';
    if (settingsHeroVideoSaveBtn) {
        settingsHeroVideoSaveBtn.disabled = true;
        settingsHeroVideoSaveBtn.textContent = 'SAVING...';
    }

    try {
        const payload = {
            heroVideoUrl: settingsHeroVideoUrl?.value?.trim() || ''
        };

        const res = await fetch('/api/admin/settings/hero-video', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to update hero video settings');
        }

        if (settingsHeroVideoSuccess) settingsHeroVideoSuccess.textContent = 'Hero video settings updated successfully.';
    } catch (err) {
        console.error('Hero video settings save failed:', err);
        if (settingsHeroVideoError) settingsHeroVideoError.textContent = err.message || 'Network error. Try again.';
    } finally {
        if (settingsHeroVideoSaveBtn) {
            settingsHeroVideoSaveBtn.disabled = false;
            settingsHeroVideoSaveBtn.textContent = 'SAVE HERO VIDEO SETTINGS';
        }
    }
}

function setupListeners() {
    const adminLangSelect = document.getElementById('admin-lang-select');
    if (adminLangSelect) {
        const initialLang = localStorage.getItem('app_language') || 'en';
        adminLangSelect.value = initialLang;
        if (initialLang !== 'en') fetchAdminAiTranslations(initialLang);

        adminLangSelect.addEventListener('change', (e) => {
            const selectedLang = e.target.value;
            localStorage.setItem('app_language', selectedLang);
            if (selectedLang !== 'en') {
                fetchAdminAiTranslations(selectedLang);
            }
            render();
        });
    }

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
    if (settingsBtn) settingsBtn.addEventListener('click', () => switchView('settings'));
    if (discountsBtn) discountsBtn.addEventListener('click', () => switchView('discounts'));

    // Mobile Bottom Navigation Buttons
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
    mobileNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab) switchView(tab);
        });
    });

    // Mobile Floating Action Button (FAB)
    const mobileFab = document.getElementById('mobile-fab');
    if (mobileFab) {
        mobileFab.addEventListener('click', () => {
            if (currentView === 'products') {
                openModal();
            } else if (currentView === 'discounts') {
                openDiscountModal();
            } else if (currentView === 'orders') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    if (addDiscountBtn) addDiscountBtn.addEventListener('click', () => openDiscountModal());
    if (closeDiscountModalBtn) closeDiscountModalBtn.addEventListener('click', closeDiscountModal);
    if (cancelDiscountBtn) cancelDiscountBtn.addEventListener('click', closeDiscountModal);
    if (discountTypeSelect) discountTypeSelect.addEventListener('change', handleDiscountTypeChange);
    if (discountForm) discountForm.addEventListener('submit', saveDiscount);

    // Modal Courier Dropdown Change Listener
    const modalCourierSelect = document.getElementById('modal-courier-select');
    if (modalCourierSelect) {
        modalCourierSelect.addEventListener('change', (e) => {
            updateCourierFields(e.target.value);
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                clearAdminToken();
                window.location.href = '/admin-login';
            }
        });
    }

    // Password Visibility Toggles
    const pwdToggles = document.querySelectorAll('.pwd-toggle-btn');
    pwdToggles.forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling;
            if (input && input.tagName === 'INPUT') {
                if (input.type === 'password') {
                    input.type = 'text';
                    // Show eye-off icon
                    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-off-icon"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
                } else {
                    input.type = 'password';
                    // Show typical eye icon
                    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
                }
            }
        });
    });

    // Change Password Form Logic (Settings Tab)
    if (settingsPasswordForm) {
        settingsPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveBtn = settingsPasswordForm.querySelector('button[type="submit"]');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'SAVING...';
            }
            if (settingsPasswordError) settingsPasswordError.textContent = '';
            if (settingsPasswordSuccess) settingsPasswordSuccess.textContent = '';

            const oldPass = document.getElementById('settings-old-pass').value;
            const newPass = document.getElementById('settings-new-pass').value;
            const confirmNewPass = document.getElementById('settings-confirm-new-pass').value;

            if (newPass !== confirmNewPass) {
                if (settingsPasswordError) settingsPasswordError.textContent = 'New passwords do not match.';
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'CHANGE PASSWORD'; }
                return;
            }

            try {
                const token = sessionStorage.getItem('adminToken');
                const res = await fetch('/api/admin/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    if (settingsPasswordSuccess) settingsPasswordSuccess.textContent = 'Password updated. Redirecting to login...';
                    setTimeout(() => {
                        sessionStorage.removeItem('adminToken');
                        window.location.href = '/admin-login';
                    }, 2000);
                } else {
                    if (settingsPasswordError) settingsPasswordError.textContent = data.message || 'Error updating password';
                    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'CHANGE PASSWORD'; }
                }
            } catch (err) {
                console.error('Password change error:', err);
                if (settingsPasswordError) settingsPasswordError.textContent = 'Network error. Try again.';
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'CHANGE PASSWORD'; }
            }
        });
    }

    if (settingsOrderForm) {
        settingsOrderForm.addEventListener('submit', saveOrderSettings);
    }

    if (settingsHeroVideoForm) {
        settingsHeroVideoForm.addEventListener('submit', saveHeroVideoSettings);
    }

    // Filter Toggle Logic
    if (filterToggleBtn) {
        filterToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            filterDropdown.classList.toggle('active');
        });
    }

    // Search Listeners
    if (productSearchInput) {
        productSearchInput.addEventListener('input', (e) => {
            currentProductSearch = e.target.value.toLowerCase();
            render();
        });
    }
    if (orderSearchInput) {
        orderSearchInput.addEventListener('input', (e) => {
            currentOrderSearch = e.target.value.toLowerCase();
            render();
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
            // API based reset not implemented yet, or hazardous.
            // For now, just show message or remove button.
            window.showToast('Reset DB not available in API mode.', 'info');
        });
    }

    if (delCompletedBtn) {
        delCompletedBtn.style.display = 'none';
        delCompletedBtn.addEventListener('click', deleteCompletedOrderHistory);
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

    // Removed auto-calculate event listeners since there is only one price input now

    // Drag and Drop Logic
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });

        function highlight(e) {
            dropZone.classList.add('drag-over');
        }

        function unhighlight(e) {
            dropZone.classList.remove('drag-over');
        }

        dropZone.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            handleFiles(files);
        }
    }

    function handleFiles(files) {
        if (files.length + currentImages.length > 3) {
            window.showToast('You can only upload up to 3 images.', 'error');
            return;
        }

        ([...files]).forEach(file => { // Convert FileList to Array
            if (!file.type.startsWith('image/')) return;

            compressImage(file, 800, 0.7).then(compressedDataUrl => {
                currentImages.push(compressedDataUrl);
                renderPreviews();
            }).catch(err => {
                console.error('Compression failed', err);
                window.showToast('Failed to process image', 'error');
            });
        });
    }

    // Image Upload
    if (productImagesInput) {
        productImagesInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }

    // Camera Upload
    const cameraBtn = document.getElementById('btn-camera');
    const cameraInput = document.getElementById('camera-input');

    if (cameraBtn && cameraInput) {
        cameraBtn.addEventListener('click', () => {
            cameraInput.click();
        });
        cameraInput.addEventListener('change', (e) => handleFiles(e.target.files));
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
        // Mark Order as Paid
        else if (target.closest('.mark-paid-btn')) {
            const id = target.closest('.mark-paid-btn').dataset.id;
            markOrderPaid(id);
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

    const btnGenerateReport = document.getElementById('btn-generate-report');
    if (btnGenerateReport) {
        btnGenerateReport.addEventListener('click', async () => {
            const startDate = document.getElementById('report-start-date').value;
            const endDate = document.getElementById('report-end-date').value;
            if (!startDate || !endDate) {
                window.showToast('Please select both Start and End Dates', 'error');
                return;
            }
            btnGenerateReport.disabled = true;
            btnGenerateReport.textContent = 'GENERATING...';
            try {
                const token = sessionStorage.getItem('adminToken');
                const res = await fetch(`/api/orders/report?startDate=${startDate}&endDate=${endDate}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('Failed to fetch report data');
                const data = await res.json();
                
                if (data.length === 0) {
                    window.showToast('No orders found in this date range', 'error');
                    return;
                }

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('landscape');
                
                doc.setFontSize(18);
                doc.text('PDF Report of RasobhoomiPlantation', 14, 22);
                
                doc.setFontSize(11);
                doc.text(`Date Range: ${startDate} to ${endDate}`, 14, 30);
                
                const tableColumn = ["Date", "Order ID", "Customer Name", "Phone", "Total (Rs)", "Status"];
                const tableRows = [];
                let totalAmount = 0;
                
                data.forEach(order => {
                    totalAmount += Number(order.total) || 0;
                    const orderDate = new Date(order.created_at).toLocaleDateString();
                    const rowData = [
                        orderDate,
                        order.id.slice(-6).toUpperCase(),
                        order.name,
                        order.phone,
                        order.total,
                        order.status.toUpperCase()
                    ];
                    tableRows.push(rowData);
                });

                const tableFoot = [
                    ["", "", "", `TOTAL ORDERS: ${data.length}`, `${totalAmount}`, ""]
                ];
                
                doc.autoTable({
                    head: [tableColumn],
                    body: tableRows,
                    foot: tableFoot,
                    startY: 35,
                    theme: 'striped',
                    styles: { fontSize: 9 },
                    headStyles: { fillColor: [37, 99, 235] },
                    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
                });
                
                const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
                const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
                doc.setFontSize(10);
                doc.setTextColor(150, 150, 150);
                doc.text('Developed by ShonkuWEB', pageWidth / 2, pageHeight - 10, { align: 'center' });
                
                doc.save(`Rasobhoomi_Sales_Report_${startDate}_${endDate}.pdf`);
                window.showToast('Report downloaded successfully!', 'success');
            } catch (err) {
                console.error(err);
                window.showToast('Error generating report', 'error');
            } finally {
                btnGenerateReport.disabled = false;
                btnGenerateReport.textContent = 'GENERATE PDF REPORT';
            }
        });
    }

    const btnPrintProductListPdf = document.getElementById('btn-print-product-list-pdf');
    if (btnPrintProductListPdf) {
        btnPrintProductListPdf.addEventListener('click', async () => {
            const originalBtnText = btnPrintProductListPdf.innerHTML;
            btnPrintProductListPdf.disabled = true;
            btnPrintProductListPdf.innerHTML = `<span>⏳ GENERATING PDF...</span>`;
            try {
                const res = await fetch('/api/products');
                if (!res.ok) throw new Error('Failed to fetch updated products list');
                const raw = await res.json();
                const productList = Array.isArray(raw) ? raw : (raw.products || []);

                if (!productList || productList.length === 0) {
                    window.showToast('No products available to print', 'error');
                    return;
                }

                // Group products by category
                const categoryMap = {};
                productList.forEach(p => {
                    const cat = (p.category && String(p.category).trim()) ? String(p.category).trim() : 'General / Uncategorized';
                    if (!categoryMap[cat]) categoryMap[cat] = [];
                    categoryMap[cat].push(p);
                });

                // Sort categories (Mangoes first, then alphabetical)
                const categoryNames = Object.keys(categoryMap).sort((a, b) => {
                    if (a.toLowerCase().includes('mango') && !b.toLowerCase().includes('mango')) return -1;
                    if (!a.toLowerCase().includes('mango') && b.toLowerCase().includes('mango')) return 1;
                    return a.localeCompare(b);
                });

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('portrait', 'mm', 'a4');
                const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();

                // Colors
                const PRIMARY_COLOR = [22, 101, 52]; // Dark Green
                const TEXT_DARK = [30, 41, 59]; // Slate Dark
                const MUTED_GRAY = [100, 116, 139]; // Slate Muted

                // Document Header
                let currentY = 16;

                doc.setFillColor(22, 101, 52);
                doc.rect(14, currentY, pageWidth - 28, 22, 'F');

                doc.setTextColor(255, 255, 255);
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text('RASOBHOOMI PLANTATION', 20, currentY + 9);

                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.text('Product Catalog & Official Price List', 20, currentY + 16);

                const dateStr = new Date().toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric'
                });
                doc.setFontSize(9);
                doc.text(`Date: ${dateStr}`, pageWidth - 20, currentY + 9, { align: 'right' });
                doc.text(`Total Products: ${productList.length}`, pageWidth - 20, currentY + 16, { align: 'right' });

                currentY += 28;

                // Loop over categories
                categoryNames.forEach((catName) => {
                    const catProducts = categoryMap[catName];
                    if (!catProducts || catProducts.length === 0) return;

                    // Check remaining vertical space before rendering category banner & headers
                    if (currentY + 35 > pageHeight - 20) {
                        doc.addPage();
                        currentY = 20;
                    }

                    // Category Banner Header
                    doc.setFillColor(240, 253, 244);
                    doc.setDrawColor(187, 247, 208);
                    doc.roundedRect(14, currentY, pageWidth - 28, 9, 2, 2, 'FD');

                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(22, 101, 52);
                    doc.text(`CATEGORY: ${catName.toUpperCase()}`, 18, currentY + 6.5);

                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(71, 85, 105);
                    doc.text(`(${catProducts.length} item${catProducts.length === 1 ? '' : 's'})`, pageWidth - 18, currentY + 6.5, { align: 'right' });

                    currentY += 12;

                    // Table rows
                    const tableColumn = ["Product Name", "Current Price", "Discount %", "Market Price"];
                    const tableRows = catProducts.map(p => {
                        const price = Number(p.price || 0);
                        const comparePrice = Number(p.compare_price || 0);
                        let marketPrice = price;
                        let discountPercent = 0;

                        if (comparePrice > price) {
                            marketPrice = comparePrice;
                            discountPercent = Math.round(((comparePrice - price) / comparePrice) * 100);
                        }

                        const priceFormatted = `₹${price.toLocaleString('en-IN')}`;
                        const marketPriceFormatted = `₹${marketPrice.toLocaleString('en-IN')}`;
                        const discountFormatted = discountPercent > 0 ? `${discountPercent}%` : '0%';

                        return [
                            p.name || 'Unnamed Product',
                            priceFormatted,
                            discountFormatted,
                            marketPriceFormatted
                        ];
                    });

                    doc.autoTable({
                        head: [tableColumn],
                        body: tableRows,
                        startY: currentY,
                        theme: 'striped',
                        margin: { left: 14, right: 14 },
                        styles: {
                            fontSize: 9,
                            cellPadding: 3,
                            textColor: TEXT_DARK,
                            font: 'helvetica'
                        },
                        headStyles: {
                            fillColor: PRIMARY_COLOR,
                            textColor: [255, 255, 255],
                            fontStyle: 'bold',
                            fontSize: 9
                        },
                        columnStyles: {
                            0: { cellWidth: 'auto', fontStyle: 'bold' },
                            1: { cellWidth: 35, halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] },
                            2: { cellWidth: 30, halign: 'center' },
                            3: { cellWidth: 35, halign: 'right', textColor: MUTED_GRAY }
                        },
                        alternateRowStyles: {
                            fillColor: [248, 250, 252]
                        }
                    });

                    currentY = doc.lastAutoTable.finalY + 10;
                });

                // Add footer page numbers to all pages
                const totalPages = doc.internal.getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                    doc.setPage(i);
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(148, 163, 184);

                    doc.setDrawColor(226, 232, 240);
                    doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);

                    doc.text('Rasobhoomi Plantation • Quality Plants & Nursery Services', 14, pageHeight - 8);
                    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
                }

                // Open blob URL for instant preview & printing
                const blobUrl = doc.output('bloburl');
                window.open(blobUrl, '_blank');

                // Save PDF file download
                const todayStr = new Date().toISOString().slice(0, 10);
                doc.save(`Rasobhoomi_Product_Price_List_${todayStr}.pdf`);

                window.showToast('Product price list PDF generated successfully!', 'success');
            } catch (err) {
                console.error('Error generating product list PDF:', err);
                window.showToast('Error generating product price list PDF', 'error');
            } finally {
                btnPrintProductListPdf.disabled = false;
                btnPrintProductListPdf.innerHTML = originalBtnText;
            }
        });
    }
}

// Confirmation helper
function showConfirm(msg, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-msg');
    const yesBtn = document.getElementById('confirm-yes');
    const cancelBtn = document.getElementById('confirm-cancel');

    if (!modal) {
        if (window.confirm(msg)) onConfirm();
        return;
    }

    if (msgEl) msgEl.textContent = msg;
    modal.style.display = 'flex';
    modal.classList.add('active');

    const close = () => {
        modal.style.display = 'none';
        modal.classList.remove('active');
        if (yesBtn) yesBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
    };

    if (yesBtn) {
        yesBtn.onclick = () => {
            onConfirm();
            close();
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            close();
        };
    }
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

function updateDashboardStats() {
    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const totalOrdersCount = orders.length;
    const pendingOrdersCount = orders.filter(o => o.status !== 'completed').length;

    const elRev = document.getElementById('stat-revenue');
    const elOrd = document.getElementById('stat-orders');

    if (elRev) elRev.textContent = `₹${Math.round(totalRevenue).toLocaleString('en-IN')}`;
    if (elOrd) elOrd.textContent = totalOrdersCount;

    const mobileBadge = document.getElementById('mobile-order-badge');
    if (mobileBadge) {
        if (pendingOrdersCount > 0) {
            mobileBadge.textContent = pendingOrdersCount;
            mobileBadge.style.display = 'inline-block';
        } else {
            mobileBadge.style.display = 'none';
        }
    }
}

function switchView(view) {
    currentView = view;

    // Reset basics
    if (productToolbar) productToolbar.style.display = 'none';
    if (orderFilterSection) orderFilterSection.style.display = 'none';
    if (settingsView) settingsView.style.display = 'none';
    if (discountsView) discountsView.style.display = 'none';
    if (listContainer) listContainer.style.display = 'block'; // Block by default unless settings/discounts

    productsBtn.classList.remove('active');
    ordersBtn.classList.remove('active');
    if (settingsBtn) settingsBtn.classList.remove('active');
    if (discountsBtn) discountsBtn.classList.remove('active');

    // Sync Mobile Bottom Navigation buttons
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
    mobileNavBtns.forEach(btn => {
        if (btn.dataset.tab === view) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Control Mobile Floating Action Button (FAB)
    const mobileFab = document.getElementById('mobile-fab');
    if (mobileFab) {
        if (view === 'products' || view === 'discounts') {
            mobileFab.style.display = 'flex';
        } else {
            mobileFab.style.display = 'none';
        }
    }

    if (view === 'products') {
        productsBtn.classList.add('active');
        if (productToolbar) productToolbar.style.display = 'flex';
        if (resetDbBtn) resetDbBtn.style.display = 'block';
        if (delCompletedBtn) delCompletedBtn.style.display = 'none';
    } else if (view === 'orders') {
        ordersBtn.classList.add('active');
        if (orderFilterSection) orderFilterSection.style.display = 'flex';
        if (resetDbBtn) resetDbBtn.style.display = 'none';
        if (delCompletedBtn) delCompletedBtn.style.display = 'block';
    } else if (view === 'settings') {
        if (settingsBtn) settingsBtn.classList.add('active');
        if (listContainer) listContainer.style.display = 'none';
        if (settingsView) settingsView.style.display = 'block';
        if (resetDbBtn) resetDbBtn.style.display = 'none';
        if (delCompletedBtn) delCompletedBtn.style.display = 'none';

        // Reset form when entering view
        if (settingsPasswordForm) settingsPasswordForm.reset();
        if (settingsPasswordError) settingsPasswordError.textContent = '';
        if (settingsPasswordSuccess) settingsPasswordSuccess.textContent = '';
        fetchOrderSettings();
    } else if (view === 'discounts') {
        if (discountsBtn) discountsBtn.classList.add('active');
        if (listContainer) listContainer.style.display = 'none';
        if (discountsView) discountsView.style.display = 'block';
        if (resetDbBtn) resetDbBtn.style.display = 'none';
        if (delCompletedBtn) delCompletedBtn.style.display = 'none';

        fetchDiscounts();
    }

    checkAddButtonVisibility();
    updateDashboardStats();
    if (view !== 'settings' && view !== 'discounts') {
        render();
    }
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

        // Add Categories (Foreigner / Indian mango first, same as storefront)
        sortCategoriesWithMangoFirst(categories).forEach(cat => {
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
        sortCategoriesWithMangoFirst(categories).forEach(cat => {
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



// CRUD Operations
function deleteProduct(id) {
    if (!id) return;
    showConfirm('Are you sure you want to delete this product?', async () => {
        try {
            const res = await fetch(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE', headers: getAuthHeaders() });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                const hadProduct = products.some(p => String(p.id) === String(id));
                products = sortProductsWithMangoFirst(products.filter(p => String(p.id) !== String(id)));
                if (hadProduct && productTotalKnown) {
                    productTotalCount = Math.max(0, productTotalCount - 1);
                }
                updateProductCounterBadge();
                if (currentView === 'products') render();
                if (window.showToast) window.showToast('Product deleted successfully', 'success');
            } else {
                if (window.showToast) window.showToast(data.error || 'Failed to delete product', 'error');
            }
        } catch (e) {
            console.error('Delete product error:', e);
            if (window.showToast) window.showToast('Error deleting product', 'error');
        }
    });
}

function openModal(id = null) {
    productModal.style.display = 'flex';
    productModal.classList.add('active');
    editingId = id;

    if (id) {
        const product = products.find(p => String(p.id) === String(id));
        if (!product) {
            console.error("Product not found for ID:", id);
            window.showToast('Product not found', 'error');
            closeModal();
            return;
        }
        modalTitle.textContent = 'EDIT PRODUCT';
        document.getElementById('product-name').value = product.name || '';
        document.getElementById('product-desc').value = product.description || '';
        
        const cp = product.compare_price > product.price ? product.compare_price : product.price;
        document.getElementById('product-price').value = cp;
        
        if (product.compare_price > product.price) {
            const diff = product.compare_price - product.price;
            document.getElementById('product-discount-percent').value = Math.round((diff / product.compare_price) * 100);
        } else {
            document.getElementById('product-discount-percent').value = '';
        }

        const catSelect = document.getElementById('product-category');
        if (catSelect) {
            const catVal = product.category || 'Others';
            if (!Array.from(catSelect.options).some(opt => opt.value === catVal)) {
                const opt = document.createElement('option');
                opt.value = catVal;
                opt.textContent = catVal;
                catSelect.appendChild(opt);
            }
            catSelect.value = catVal;
        }

        document.getElementById('product-qty').value = product.qty !== undefined ? product.qty : 0;
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
        const inputPrice = parseFloat(document.getElementById('product-price').value) || 0;
        const discountPct = parseFloat(document.getElementById('product-discount-percent').value) || 0;
        
        let compare_price = 0;
        let price = inputPrice;
        
        if (discountPct > 0) {
            price = inputPrice - (inputPrice * (discountPct / 100));
            compare_price = inputPrice;
        } else {
            compare_price = inputPrice;
        }
        const category = document.getElementById('product-category').value;
        const qty = parseInt(document.getElementById('product-qty').value) || 0;
        const image = currentImages.length > 0 ? currentImages[0] : '';
        const images = currentImages;

        const payload = { name, description, price, compare_price, category, qty, image, images };
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

        let data;
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await res.json();
        } else {
            const text = await res.text();
            data = { error: text || `HTTP error ${res.status}` };
        }

        if (res.ok) {
            console.log('Save Success:', data);
            const savedProduct = {
                id: editingId || data.id,
                name,
                description,
                price,
                category,
                qty,
                image,
                images
            };

            if (editingId) {
                const idx = products.findIndex(p => String(p.id) === String(editingId));
                if (idx !== -1) {
                    products[idx] = { ...products[idx], ...savedProduct };
                }
            } else {
                products = [savedProduct, ...products];
                if (productTotalKnown) {
                    productTotalCount += 1;
                } else {
                    productTotalKnown = true;
                    productTotalCount = products.length;
                }
            }

            products = sortProductsWithMangoFirst(products);

            closeModal();
            updateProductCounterBadge();
            if (currentView === 'products') render();
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
    const orderDate = order.created_at || order.date;
    document.getElementById('view-order-date').textContent = orderDate
        ? new Date(orderDate).toLocaleString()
        : 'N/A';

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

    // Set Status Dropdown & Courier Method Selection
    const select = document.getElementById('modal-status-select');
    if (select) select.value = order.status || 'new';

    const courierSelect = document.getElementById('modal-courier-select');
    const currentCourier = (order.courier_name || 'dtdc').toLowerCase();
    if (courierSelect) courierSelect.value = currentCourier;

    updateCourierFields(currentCourier, order.tracking_id);

    const invoiceBtn = document.getElementById('modal-download-invoice-btn');
    if (invoiceBtn) {
        invoiceBtn.onclick = async (e) => {
            e.preventDefault();

            // Auto-sync current modal form values first (if admin changed tracking ID / courier method)
            const newStatus = document.getElementById('modal-status-select')?.value;
            const courierSelectVal = document.getElementById('modal-courier-select')?.value || '';
            const trackingIdVal = document.getElementById('modal-tracking-id')?.value?.trim() || '';

            if (courierSelectVal || trackingIdVal || newStatus) {
                try {
                    await fetch(`/api/orders/${order.id}`, {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({
                            status: newStatus,
                            tracking_id: (courierSelectVal === 'dtdc' || courierSelectVal === 'amazon') ? trackingIdVal : '',
                            courier_name: courierSelectVal
                        })
                    });
                } catch (syncErr) {
                    console.warn('PDF pre-sync notice:', syncErr);
                }
            }

            // Instantly generate PDF on the fly and open in a new browser window/tab
            window.open(`/api/orders/${order.id}/invoice?t=${Date.now()}`, '_blank');
        };
    }

    if (select) {
        Array.from(select.options).forEach(option => {
            option.disabled = false;
        });
    }

    const delBtn = document.getElementById('delete-order-btn');
    if (delBtn) {
        delBtn.onclick = () => deleteOrder(order.id);
    }
}

function updateCourierFields(courier, existingTrackingId = '') {
    const courierSelect = document.getElementById('modal-courier-select');
    const trackingWrapper = document.getElementById('modal-tracking-wrapper');
    const trackingLabel = document.getElementById('modal-tracking-label');
    const trackingInput = document.getElementById('modal-tracking-id');
    const courierHint = document.getElementById('modal-courier-hint');

    const selectedCourier = (courier || courierSelect?.value || 'dtdc').toLowerCase();

    if (trackingWrapper) {
        if (selectedCourier === 'dtdc') {
            trackingWrapper.style.display = 'block';
            if (trackingLabel) trackingLabel.textContent = 'DTDC TRACKING ID (AWB) *';
            if (trackingInput) {
                trackingInput.placeholder = 'e.g. D12345678';
                if (existingTrackingId !== null && existingTrackingId !== undefined && existingTrackingId !== '') {
                    trackingInput.value = existingTrackingId;
                }
            }
            if (courierHint) courierHint.textContent = '💡 Direct tracking link will be generated for DTDC official tracking portal.';
        } else if (selectedCourier === 'amazon') {
            trackingWrapper.style.display = 'block';
            if (trackingLabel) trackingLabel.textContent = 'AMAZON TRACKING ID *';
            if (trackingInput) {
                trackingInput.placeholder = 'e.g. 402-1234567-8901234';
                if (existingTrackingId !== null && existingTrackingId !== undefined && existingTrackingId !== '') {
                    trackingInput.value = existingTrackingId;
                }
            }
            if (courierHint) courierHint.textContent = '💡 Direct tracking link (https://track.amazon.in/tracking/...) will be provided to customer.';
        } else {
            trackingWrapper.style.display = 'block';
            if (trackingLabel) trackingLabel.textContent = 'DELIVERY METHOD NOTE';
            if (trackingInput) {
                trackingInput.placeholder = 'N/A (Hand Delivery)';
                trackingInput.value = '';
            }
            const methodLabel = selectedCourier === 'rail' ? 'Rail / Train' : 'BUS Service';
            if (courierHint) courierHint.textContent = `ℹ️ Selected: ${methodLabel}. Customer will see: "Delivery will be done by Rasobhoomi in hand."`;
        }
    }
}

function closeOrderModal() {
    orderModal.style.display = 'none';
    orderModal.classList.remove('active');
    editingId = null;
}

async function updateOrderStatus() {
    if (!editingId) return;

    const newStatus = document.getElementById('modal-status-select')?.value;
    const courierSelect = document.getElementById('modal-courier-select');
    const courierName = courierSelect?.value || '';
    const trackingInput = document.getElementById('modal-tracking-id');
    const trackingId = trackingInput?.value?.trim() || '';

    // Enforce strict check when changing status to IN-TRANSIT or COMPLETED
    if (newStatus === 'in-transit' || newStatus === 'in_transit' || newStatus === 'completed') {
        if (!courierName) {
            if (window.showToast) window.showToast(`Cannot set status to ${newStatus.toUpperCase()}: Please select a Delivery Method!`, 'error');
            if (courierSelect) courierSelect.focus();
            return;
        }

        if (courierName === 'dtdc' && !trackingId) {
            if (window.showToast) window.showToast(`Cannot set status to ${newStatus.toUpperCase()}: Please enter DTDC Tracking / AWB Number!`, 'error');
            if (trackingInput) trackingInput.focus();
            return;
        }

        if (courierName === 'amazon' && !trackingId) {
            if (window.showToast) window.showToast(`Cannot set status to ${newStatus.toUpperCase()}: Please enter Amazon Tracking ID!`, 'error');
            if (trackingInput) trackingInput.focus();
            return;
        }
    }

    try {
        const res = await fetch(`/api/orders/${editingId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                status: newStatus,
                tracking_id: (courierName === 'dtdc' || courierName === 'amazon') ? trackingId : '',
                courier_name: courierName
            })
        });

        if (res.ok) {
            const statusEl = document.getElementById('view-order-status');
            if (statusEl) {
                statusEl.textContent = newStatus;
            }
            if (window.showToast) window.showToast('Order details updated successfully');
            closeOrderModal();
            fetchData();
        } else {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData.error || 'Failed to update order';
            if (window.showToast) window.showToast(errMsg, 'error');
        }

    } catch (e) {
        console.error(e);
        if (window.showToast) window.showToast('Error updating order: ' + e.message, 'error');
    }
}


async function markOrderPaid(id) {
    showConfirm(`Mark order #${id} as PAID? This will set status to NEW and deduct stock.`, async () => {
        try {
            const res = await fetch(`/api/orders/${id}/mark-paid`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (res.ok && data.success) {
                window.showToast('Order marked as paid!', 'success');
                fetchData();
            } else {
                window.showToast(data.error || 'Failed to mark as paid', 'error');
            }
        } catch (e) {
            console.error(e);
            window.showToast('Error marking order as paid', 'error');
        }
    });
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

function deleteCompletedOrderHistory() {
    showConfirm('Delete all completed orders from history?', async () => {
        try {
            const res = await fetch('/api/orders/completed', {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (res.ok) {
                closeOrderModal();
                fetchData();
                window.showToast(`Deleted ${data.deletedCount || 0} completed orders`, 'success');
            } else {
                window.showToast(data.error || 'Failed to delete completed orders', 'error');
            }
        } catch (e) {
            console.error(e);
            window.showToast('Error deleting completed orders', 'error');
        }
    });
}

function render() {
    listContainer.innerHTML = '';

    // Inject Count Badge logic
    const btnOrders = document.getElementById('btn-orders');
    if (btnOrders) {
        btnOrders.innerHTML = `📋 ORDERS <span class="order-counter">${orders.length}</span>`;
    }

    updateProductCounterBadge();
    updateDashboardStats();

    let itemsToRender = [];

    if (currentView === 'products') {
        itemsToRender = products.filter(p => {
            const nameMatch = p.name.toLowerCase().includes(currentProductSearch);
            const categoryMatch = currentProductFilter === 'all'
                ? true
                : currentProductFilter === 'out-of-stock'
                    ? Number(p.qty) <= 0
                    : (p.category || '').includes(currentProductFilter);

            return nameMatch && categoryMatch;
        });
        itemsToRender = sortProductsWithMangoFirst(itemsToRender);
    } else {
        itemsToRender = orders.filter(o => {
            const idMatch = o.id.toString().toLowerCase().includes(currentOrderSearch) ||
                (o.name || '').toLowerCase().includes(currentOrderSearch);
            let statusMatch;
            if (currentOrderFilter === 'all') {
                statusMatch = true;
            } else if (currentOrderFilter === 'pending-payment') {
                statusMatch = o.status === 'pending_payment' || (o.payment_status || '').toLowerCase() === 'pending';
            } else {
                statusMatch = o.status === currentOrderFilter;
            }
            return idMatch && statusMatch;
        });
    }

    if (currentView === 'orders') {
        itemsToRender.sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0));
    }

    itemsToRender.forEach(item => {
        const el = document.createElement('div');
        el.className = 'admin-list-item';

        let actionButtons = '';
        let detailsHtml = '';

        if (currentView === 'products') {
            const lang = localStorage.getItem('app_language') || 'en';
            const displayItem = translateProductAdmin(item, lang);
            const isOut = Number(item.qty) <= 0;
            const isLow = Number(item.qty) > 0 && Number(item.qty) <= 5;
            const qtyClass = isOut || isLow ? 'low-qty' : '';

            actionButtons = `
            <div class="view-btn-container" style="flex-direction:row; gap:0.5rem;">
                <button class="view-btn edit-btn" data-id="${item.id}">EDIT</button>
                <button class="view-btn delete-btn" data-id="${item.id}">DEL</button>
            </div>
            `;

            detailsHtml = `
                <div class="admin-item-details">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.25rem;">
                        <span class="item-id">ID #${item.id}</span>
                        <span style="font-size:0.68rem; color:var(--admin-primary); background:#e6f4ea; padding:2px 8px; border-radius:10px; font-weight:800; text-transform:uppercase;">${displayItem.category || 'General'}</span>
                    </div>
                    <h3 class="item-name">${displayItem.name}</h3>
                    <div class="item-meta">
                        <span class="price-badge">₹${item.price}</span>
                        <span class="qty-badge ${qtyClass}">Stock: ${item.qty} ${isOut ? '⚠️ Out of Stock' : isLow ? '⚠️ Low Stock' : ''}</span>
                    </div>
                </div>
            `;
        } else {
            // ORDER SPECIFIC UI WITH MOBILE QUICK CALL / WHATSAPP
            const paymentStatus = String(item.payment_status || 'pending').toLowerCase();
            const isPendingPayment = paymentStatus === 'pending' || item.status === 'pending_payment';
            const isFailedPayment = paymentStatus === 'failed';
            const totalItems = (item.items || []).reduce((sum, i) => sum + Number(i.qty), 0);
            const cleanPhone = String(item.phone || '').replace(/\D/g, '');

            actionButtons = `
            <div class="view-btn-container" style="flex-direction:row; gap:0.4rem; flex-wrap:wrap;">
                ${cleanPhone ? `
                    <a href="tel:${cleanPhone}" class="quick-action-btn btn-call" title="Call Customer">📞 Call</a>
                    <a href="https://wa.me/91${cleanPhone}?text=Hello%20${encodeURIComponent(item.name || 'Customer')}%2C%20regarding%20your%20order%20%23${item.id}%20from%20Rasobhoomi" target="_blank" class="quick-action-btn btn-whatsapp" title="WhatsApp Chat">💬 WA</a>
                ` : ''}
                ${isPendingPayment ? `<button class="view-btn mark-paid-btn" data-id="${item.id}" style="background:#f59e0b; color:white;">✓ PAID</button>` : ''}
                <button class="view-btn view-order-btn" data-id="${item.id}">VIEW</button>
            </div>
            `;

            detailsHtml = `
                <div class="admin-item-details">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.25rem;">
                        <span class="item-id">ORDER #${item.id}</span>
                        <span style="font-size:0.7rem; font-weight:700; color:#64748B;">${item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : ''}</span>
                    </div>
                    <h3 class="item-name">${item.name || 'Guest Customer'}</h3>
                    <div class="item-meta">
                        <span>Items: <strong>${totalItems}</strong></span>
                        <span style="color:var(--admin-primary); font-weight:800; font-size:1rem;">₹${item.total || 0}</span>
                        <span class="filter-chip active" style="padding:2px 8px; font-size:0.68rem; text-transform:uppercase;">${(item.status || 'new').toUpperCase()}</span>
                    </div>
                    <div style="display:flex; gap:0.4rem; margin-top:0.2rem; flex-wrap:wrap;">
                        <span class="status-badge" style="background:${paymentStatus === 'paid' ? '#dcfce7' : paymentStatus === 'failed' ? '#fee2e2' : '#fef3c7'}; color:${paymentStatus === 'paid' ? '#166534' : paymentStatus === 'failed' ? '#b91c1c' : '#92400e'}; border:1px solid ${paymentStatus === 'paid' ? '#86efac' : paymentStatus === 'failed' ? '#fca5a5' : '#fcd34d'}; font-size:0.68rem; font-weight:700;">
                            Payment: ${paymentStatus.toUpperCase()}
                        </span>
                        ${isPendingPayment ? `<span class="status-badge" style="background:#fef3c7; color:#92400e; border:1px solid #fcd34d; font-size:0.68rem; font-weight:700;">⚠ PENDING PAYMENT</span>` : ''}
                    </div>
                </div>
            `;
        }

        let imageHtml = '';
        if (item.image) {
            imageHtml = `<img src="${item.image}" alt="Product">`;
        } else {
            imageHtml = `<div class="no-image" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#f1f5f9; color:#94a3b8; font-weight:700; font-size:0.75rem;">${currentView === 'products' ? 'PRODUCT' : 'ORDER'}</div>`;
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
        listContainer.innerHTML = '<p style="text-align:center; padding: 2.5rem; color:#64748b; font-weight:600;">No items found matching criteria.</p>';
    }

    if (currentView === 'products' && productsHasMore) {
        const loadMoreWrap = document.createElement('div');
        loadMoreWrap.style.cssText = 'width:100%; text-align:center; padding:1.5rem 1rem;';
        const label = productsLoadingBatch ? 'Loading...' : 'LOAD MORE PRODUCTS';
        loadMoreWrap.innerHTML = `<button type="button" class="view-btn load-more-products-btn" style="min-width:200px;" ${productsLoadingBatch ? 'disabled' : ''}>${label}</button>`;
        listContainer.appendChild(loadMoreWrap);
    }
}

// --- DISCOUNT MANAGEMENT FUNCTIONS ---
async function fetchDiscounts() {
    if (!discountsLoading || !discountsEmpty || !discountsTable) return;
    discountsLoading.style.display = 'block';
    discountsEmpty.style.display = 'none';
    discountsTable.style.display = 'none';

    try {
        const res = await fetch('/api/admin/discounts', {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to fetch discount rules');
        const data = await res.json();
        discounts = Array.isArray(data) ? data : [];
        renderDiscounts();
    } catch (err) {
        console.error('Fetch discounts failed:', err);
        if (window.showToast) window.showToast(err.message || 'Error loading discounts', 'error');
        discountsLoading.style.display = 'none';
        discountsEmpty.style.display = 'block';
    }
}

function renderDiscounts() {
    if (!discountsLoading || !discountsEmpty || !discountsTable || !discountsTableBody) return;
    discountsLoading.style.display = 'none';

    const mobileContainer = document.getElementById('discounts-cards-mobile');

    if (discounts.length === 0) {
        discountsEmpty.style.display = 'block';
        discountsTable.style.display = 'none';
        if (mobileContainer) mobileContainer.style.display = 'none';
        return;
    }

    discountsEmpty.style.display = 'none';
    
    if (window.innerWidth <= 640 && mobileContainer) {
        discountsTable.style.display = 'none';
        mobileContainer.style.display = 'block';
        mobileContainer.innerHTML = '';
    } else {
        discountsTable.style.display = 'table';
        if (mobileContainer) mobileContainer.style.display = 'none';
    }

    discountsTableBody.innerHTML = '';

    discounts.forEach(rule => {
        let conditionText = '';
        const amt1 = Number(rule.amount1 || 0);
        const amt2 = Number(rule.amount2 || 0);
        const op = rule.operator || '>=';

        if (amt2 > 0) {
            conditionText = `₹${amt1} ${op} Subtotal <= ₹${amt2}`;
        } else {
            conditionText = `Subtotal ${op} ₹${amt1}`;
        }

        let typeText = 'Percentage';
        let valText = `${rule.discount_value}%`;

        if (rule.discount_type === 'fixed') {
            typeText = 'Fixed Amount';
            valText = `₹${rule.discount_value}`;
        } else if (rule.discount_type === 'free_delivery') {
            typeText = 'Free Delivery';
            valText = 'Free Delivery';
        }

        const isEnabled = Boolean(rule.is_enabled);
        const statusBadge = isEnabled
            ? `<span style="background: #dcfce7; color: #15803d; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 700;">Active</span>`
            : `<span style="background: #f1f5f9; color: #64748b; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 700;">Disabled</span>`;

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';

        tr.innerHTML = `
            <td style="padding: 0.85rem; font-weight: 700; color: #0f172a;">${rule.name}</td>
            <td style="padding: 0.85rem; color: #475569; font-size: 0.85rem; font-family: monospace;">${conditionText}</td>
            <td style="padding: 0.85rem; color: #334155; font-size: 0.85rem;">${typeText}</td>
            <td style="padding: 0.85rem; font-weight: 800; color: #15803d;">${valText}</td>
            <td style="padding: 0.85rem;">${statusBadge}</td>
            <td style="padding: 0.85rem; text-align: right;">
                <div style="display: flex; gap: 0.4rem; justify-content: flex-end; align-items: center;">
                    <button class="btn-toggle-disc view-btn" data-id="${rule.id}" data-enabled="${isEnabled ? '1' : '0'}" style="background: #f1f5f9; color: #334155; padding: 0.35rem 0.65rem; font-size: 0.72rem;">
                        ${isEnabled ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn-edit-disc view-btn edit-btn" data-id="${rule.id}" style="padding: 0.35rem 0.65rem; font-size: 0.72rem;">
                        Edit
                    </button>
                    <button class="btn-del-disc view-btn delete-btn" data-id="${rule.id}" style="padding: 0.35rem 0.65rem; font-size: 0.72rem;">
                        Delete
                    </button>
                </div>
            </td>
        `;
        discountsTableBody.appendChild(tr);

        if (mobileContainer) {
            const card = document.createElement('div');
            card.className = 'discount-card-mobile';
            card.innerHTML = `
                <div class="discount-card-header">
                    <span class="discount-rule-title">${rule.name}</span>
                    ${statusBadge}
                </div>
                <div style="font-size: 0.82rem; color: #475569; margin-bottom: 0.65rem;">
                    <div>Condition: <strong>${conditionText}</strong></div>
                    <div>Value: <strong style="color: #15803d;">${valText}</strong> (${typeText})</div>
                </div>
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                    <button class="btn-toggle-disc view-btn" data-id="${rule.id}" data-enabled="${isEnabled ? '1' : '0'}" style="background: #f1f5f9; color: #334155; padding: 0.4rem 0.75rem; font-size: 0.75rem;">
                        ${isEnabled ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn-edit-disc view-btn edit-btn" data-id="${rule.id}" style="padding: 0.4rem 0.75rem; font-size: 0.75rem;">
                        Edit
                    </button>
                    <button class="btn-del-disc view-btn delete-btn" data-id="${rule.id}" style="padding: 0.4rem 0.75rem; font-size: 0.75rem;">
                        Delete
                    </button>
                </div>
            `;
            mobileContainer.appendChild(card);
        }
    });

    const allContainers = [discountsTableBody, mobileContainer].filter(Boolean);
    allContainers.forEach(container => {
        container.querySelectorAll('.btn-toggle-disc').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const currentEnabled = btn.getAttribute('data-enabled') === '1';
                toggleDiscount(id, currentEnabled);
            });
        });
        container.querySelectorAll('.btn-edit-disc').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const rule = discounts.find(d => String(d.id) === String(id));
                if (rule) openDiscountModal(rule);
            });
        });
        container.querySelectorAll('.btn-del-disc').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                deleteDiscount(id);
            });
        });
    });
}

function handleDiscountTypeChange() {
    if (!discountTypeSelect || !discountValueWrapper || !discountValueLabel) return;
    const type = discountTypeSelect.value;
    if (type === 'free_delivery') {
        discountValueWrapper.style.display = 'none';
        if (discountValueInput) discountValueInput.required = false;
    } else {
        discountValueWrapper.style.display = 'block';
        if (discountValueInput) discountValueInput.required = true;
        if (type === 'percentage') {
            discountValueLabel.textContent = 'Discount Percentage (%)';
            if (discountValueInput) discountValueInput.placeholder = 'e.g. 10';
        } else if (type === 'fixed') {
            discountValueLabel.textContent = 'Discount Amount (₹)';
            if (discountValueInput) discountValueInput.placeholder = 'e.g. 150';
        }
    }
}

function openDiscountModal(discountToEdit = null) {
    if (!discountModal || !discountForm) return;
    discountForm.reset();
    if (discountFormError) discountFormError.textContent = '';

    if (discountToEdit) {
        editingDiscountId = discountToEdit.id;
        if (discountModalTitle) discountModalTitle.textContent = 'EDIT DISCOUNT RULE';
        if (discountNameInput) discountNameInput.value = discountToEdit.name || '';
        if (discountAmount1Input) discountAmount1Input.value = discountToEdit.amount1 ?? 0;
        if (discountOperatorSelect) discountOperatorSelect.value = discountToEdit.operator || '>=';
        if (discountAmount2Input) discountAmount2Input.value = discountToEdit.amount2 || '';
        if (discountTypeSelect) discountTypeSelect.value = discountToEdit.discount_type || 'percentage';
        if (discountValueInput) discountValueInput.value = discountToEdit.discount_value ?? 0;
        if (discountEnabledCheckbox) discountEnabledCheckbox.checked = Boolean(discountToEdit.is_enabled);
    } else {
        editingDiscountId = null;
        if (discountModalTitle) discountModalTitle.textContent = 'CREATE DISCOUNT RULE';
        if (discountOperatorSelect) discountOperatorSelect.value = '>=';
        if (discountEnabledCheckbox) discountEnabledCheckbox.checked = true;
    }

    handleDiscountTypeChange();
    discountModal.style.display = 'flex';
}

function closeDiscountModal() {
    if (discountModal) discountModal.style.display = 'none';
    editingDiscountId = null;
}

async function saveDiscount(e) {
    e.preventDefault();
    if (!discountForm) return;
    if (discountFormError) discountFormError.textContent = '';

    const name = discountNameInput?.value?.trim();
    const amount1 = Number(discountAmount1Input?.value || 0);
    const operator = discountOperatorSelect?.value || '>=';
    const amount2 = Number(discountAmount2Input?.value || 0);
    const discount_type = discountTypeSelect?.value || 'percentage';
    const discount_value = Number(discountValueInput?.value || 0);
    const is_enabled = Boolean(discountEnabledCheckbox?.checked);

    if (!name) {
        if (discountFormError) discountFormError.textContent = 'Please enter a rule name.';
        return;
    }

    if (discount_type !== 'free_delivery' && (isNaN(discount_value) || discount_value <= 0)) {
        if (discountFormError) discountFormError.textContent = 'Please enter a valid positive discount value.';
        return;
    }

    const payload = {
        name,
        amount1,
        operator,
        amount2,
        discount_type,
        discount_value: discount_type === 'free_delivery' ? 0 : discount_value,
        is_enabled
    };

    try {
        const url = editingDiscountId ? `/api/admin/discounts/${editingDiscountId}` : '/api/admin/discounts';
        const method = editingDiscountId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to save discount rule');
        }

        if (window.showToast) window.showToast(data.message || 'Discount rule saved successfully');
        closeDiscountModal();
        fetchDiscounts();
    } catch (err) {
        console.error('Save discount failed:', err);
        if (discountFormError) discountFormError.textContent = err.message || 'Failed to save discount rule';
    }
}

async function toggleDiscount(id, currentEnabledStatus) {
    try {
        const res = await fetch(`/api/admin/discounts/${id}/toggle`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ is_enabled: !currentEnabledStatus })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to toggle discount rule status');
        }
        if (window.showToast) window.showToast(`Discount rule ${!currentEnabledStatus ? 'enabled' : 'disabled'}`);
        fetchDiscounts();
    } catch (err) {
        console.error('Toggle discount failed:', err);
        if (window.showToast) window.showToast(err.message || 'Failed to update status', 'error');
    }
}

async function deleteDiscount(id) {
    if (!confirm('Are you sure you want to delete this discount rule?')) return;
    try {
        const res = await fetch(`/api/admin/discounts/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to delete discount rule');
        }
        if (window.showToast) window.showToast('Discount rule deleted successfully');
        fetchDiscounts();
    } catch (err) {
        console.error('Delete discount failed:', err);
        if (window.showToast) window.showToast(err.message || 'Failed to delete discount rule', 'error');
    }
}

init();
