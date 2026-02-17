import React, { useState, useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useNavigate } from 'react-router-dom';
// import { categories as categoryList } from '../utils/categories';

const Admin = () => {
    const navigate = useNavigate();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authPass, setAuthPass] = useState('');
    const [authError, setAuthError] = useState('');

    const [view, setView] = useState('products'); // 'products' | 'orders'
    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);
    const [categoryList, setCategoryList] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [productFilter, setProductFilter] = useState('all');
    const [orderFilter, setOrderFilter] = useState('new');

    // Modals
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null); // null = add mode
    const [productForm, setProductForm] = useState({
        name: '', description: '', price: '', category: '', qty: '', images: []
    });

    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);

    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null); // Function to run on confirm
    const [confirmMessage, setConfirmMessage] = useState('');

    // Refs
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    // --- Auth & Init ---
    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const token = sessionStorage.getItem('adminToken');
        if (!token) {
            setLoading(false);
            return; // Stay on login screen (handled by conditional render)
        }
        try {
            const res = await fetch('/api/auth/verify', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setIsAuthenticated(true);
                fetchData();
            } else {
                sessionStorage.removeItem('adminToken');
            }
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: authPass })
            });
            const data = await res.json();
            if (data.success) {
                sessionStorage.setItem('adminToken', data.token);
                setIsAuthenticated(true);
                fetchData();
            } else {
                setAuthError(data.message || 'Invalid Password');
            }
        } catch (err) {
            setAuthError('Login Failed');
        }
    };

    const getAuthHeaders = () => {
        const token = sessionStorage.getItem('adminToken');
        return {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        };
    };

    // --- Data Fetching ---
    const fetchData = async () => {
        try {
            const [pRes, oRes, cRes] = await Promise.all([
                fetch('/api/products'),
                fetch('/api/orders'),
                fetch('/api/categories')
            ]);
            if (pRes.ok) setProducts(await pRes.json());
            if (oRes.ok) setOrders(await oRes.json());
            if (cRes.ok) setCategoryList(await cRes.json());
        } catch (err) {
            console.error('Fetch Error', err);
            // In a real app, show toast
        }
    };

    // --- Actions ---
    const handleDeleteProduct = (id) => {
        setConfirmMessage('Are you sure you want to delete this product?');
        setConfirmAction(() => async () => {
            await fetch(`/api/products/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
            fetchData();
        });
        setIsConfirmOpen(true);
    };

    const handleDeleteOrder = (id) => {
        setConfirmMessage('Delete this order?');
        setConfirmAction(() => async () => {
            await fetch(`/api/orders/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
            setIsOrderModalOpen(false);
            fetchData();
        });
        setIsConfirmOpen(true);
    };

    const handleDeleteCompletedOrders = () => {
        const completedCount = orders.filter(o => o.status === 'completed').length;
        if (completedCount === 0) return alert('No completed orders');

        setConfirmMessage(`Delete ${completedCount} completed orders?`);
        setConfirmAction(() => async () => {
            for (const order of orders) {
                if (order.status === 'completed') {
                    await fetch(`/api/orders/${order.id}`, { method: 'DELETE', headers: getAuthHeaders() });
                }
            }
            fetchData();
        });
        setIsConfirmOpen(true);
    };

    const handleResetDb = () => {
        setConfirmMessage('WARNING: This will delete ALL products. Are you sure?');
        setConfirmAction(() => async () => {
            for (const p of products) {
                await fetch(`/api/products/${p.id}`, { method: 'DELETE', headers: getAuthHeaders() });
            }
            fetchData();
        });
        setIsConfirmOpen(true);
    };

    // --- Product Form ---
    const openProductModal = (product = null) => {
        if (product) {
            setEditingProduct(product);
            setProductForm({
                name: product.name,
                description: product.description || '',
                price: product.price,
                category: product.category || '',
                qty: product.qty,
                images: product.images || (product.image ? [product.image] : [])
            });
        } else {
            setEditingProduct(null);
            setProductForm({ name: '', description: '', price: '', category: '', qty: '', images: [] });
        }
        setIsProductModalOpen(true);
    };

    const handleProductSave = async (e) => {
        e.preventDefault();

        // Duplicate Check
        const newName = productForm.name.trim().toLowerCase();
        const newPrice = parseFloat(productForm.price);

        const isDuplicate = products.some(p => {
            // Skip checking against itself if editing
            if (editingProduct && p.id === editingProduct.id) return false;

            return p.name.trim().toLowerCase() === newName && p.price === newPrice;
        });

        if (isDuplicate) {
            alert('A product with this name and price already exists!');
            return;
        }

        const payload = {
            ...productForm,
            image: productForm.images[0] || '', // Legacy support
            price: newPrice,
            qty: parseInt(productForm.qty)
        };

        const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
        const method = editingProduct ? 'PUT' : 'POST';

        await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        setIsProductModalOpen(false);
        fetchData();
    };

    const handleImageChange = async (e) => {
        const files = Array.from(e.target.files);
        const newImages = [...productForm.images];
        for (const file of files) {
            const base64 = await convertBase64(file);
            newImages.push(base64);
        }
        setProductForm(prev => ({ ...prev, images: newImages.slice(0, 3) }));
    };

    const convertBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    };

    // --- Order Modal ---
    const handleUpdateOS = async (status) => {
        if (!selectedOrder) return;
        await fetch(`/api/orders/${selectedOrder.id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status })
        });
        setIsOrderModalOpen(false);
        fetchData();
    };

    // --- Render Helpers ---
    const filteredProducts = products.filter(p => {
        if (productFilter === 'all') return true;
        if (productFilter === 'out-of-stock') return p.qty <= 0;
        if (productFilter === 'low-stock') return p.qty > 0 && p.qty < 5;
        return (p.category || '').includes(productFilter);
    });

    const filteredOrders = orders.filter(o => o.status === orderFilter).reverse();

    if (loading) return <div className="p-4 text-center">Loading Admin...</div>;

    if (!isAuthenticated) {
        return (
            <div className="auth-overlay active" style={{ display: 'flex', zIndex: 2000, backgroundColor: 'var(--color-black)' }}>
                <div className="auth-card" style={{ backgroundColor: 'var(--color-white)', borderRadius: '1rem', padding: '3rem', width: '100%', maxWidth: '400px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <img src="/assets/logo.png" alt="Rasobhoomi" style={{ height: '80px', marginBottom: '1rem' }} />
                        <h2 style={{ textTransform: 'uppercase', color: 'var(--color-primary)', fontSize: '1.5rem', letterSpacing: '0.1em' }}>Admin Panel</h2>
                    </div>
                    <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="input-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#4b5563' }}>Passcode</label>
                            <input
                                type="password"
                                className="modern-input"
                                placeholder="Enter Access Code"
                                value={authPass}
                                onChange={(e) => setAuthPass(e.target.value)}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <button type="submit" className="btn-save-modern" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>Login</button>
                    </form>
                    {authError && <p style={{ color: 'var(--color-red-text)', marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem' }}>{authError}</p>}
                    <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                        <a href="/" style={{ color: 'var(--color-gray-500)', textDecoration: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                            Back to Store
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
            <div className="admin-container" style={{ padding: '2rem', maxWidth: '1440px', margin: '0 auto' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <img src="/assets/logo.png" alt="Logo" style={{ height: '40px' }} />
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>DASHBOARD</h1>
                    </div>
                    <button onClick={() => { sessionStorage.removeItem('adminToken'); setIsAuthenticated(false); }} style={{ background: 'none', border: 'none', color: 'var(--color-red-text)', cursor: 'pointer', fontWeight: '500' }}>Logout</button>
                </div>

                {/* Toggle */}
                <div className="admin-toggle-container">
                    <div className="toggle-wrapper" style={{ borderColor: 'var(--color-primary)' }}>
                        <button
                            className={`toggle-btn ${view === 'products' ? 'active' : ''}`}
                            onClick={() => setView('products')}
                            style={view === 'products' ? { backgroundColor: 'var(--color-primary)', color: 'white' } : {}}
                        >Products</button>
                        <button
                            className={`toggle-btn ${view === 'orders' ? 'active' : ''}`}
                            onClick={() => setView('orders')}
                            style={view === 'orders' ? { backgroundColor: 'var(--color-primary)', color: 'white' } : {}}
                        >Orders</button>
                    </div>
                </div>

                {/* Products View */}
                {view === 'products' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
                            <button
                                className="btn-add-product-modern"
                                onClick={() => openProductModal()}
                                style={{ marginBottom: 0, width: 'auto', padding: '0.75rem 1.5rem', backgroundColor: 'var(--color-primary)', color: 'white', borderColor: 'var(--color-primary)' }}
                            >+ ADD PRODUCT</button>
                        </div>

                        <div className="admin-filters" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                            <button
                                className={`filter-chip ${productFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setProductFilter('all')}
                                style={productFilter === 'all' ? { backgroundColor: 'var(--color-primary)', color: 'white', borderColor: 'var(--color-primary)' } : {}}
                            >ALL</button>
                            {categoryList.map(c => (
                                <button
                                    key={c.id}
                                    className={`filter-chip ${productFilter === c.name ? 'active' : ''}`}
                                    onClick={() => setProductFilter(c.name)}
                                    style={productFilter === c.name ? { backgroundColor: 'var(--color-primary)', color: 'white', borderColor: 'var(--color-primary)' } : {}}
                                >{c.name.toUpperCase()}</button>
                            ))}
                            <button
                                className={`filter-chip ${productFilter === 'low-stock' ? 'active' : ''}`}
                                onClick={() => setProductFilter('low-stock')}
                                style={{ color: '#d97706', borderColor: '#d97706', backgroundColor: productFilter === 'low-stock' ? '#fef3c7' : 'white' }}
                            >LOW STOCK</button>
                            <button
                                className={`filter-chip ${productFilter === 'out-of-stock' ? 'active' : ''}`}
                                onClick={() => setProductFilter('out-of-stock')}
                                style={{ color: 'var(--color-red-text)', borderColor: 'var(--color-red-text)', backgroundColor: productFilter === 'out-of-stock' ? '#fee2e2' : 'white' }}
                            >OUT OF STOCK</button>
                        </div>

                        <div className="admin-list">
                            {filteredProducts.map(p => (
                                <div key={p.id} className="admin-list-item" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <div className="admin-item-image">
                                        {p.image ? <img src={p.image} alt={p.name} /> : 'IMG'}
                                    </div>
                                    <div className="admin-item-details">
                                        <p className="item-id" style={{ color: '#9ca3af' }}>#{p.id}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 0 }}>{p.category}</p>
                                            {p.qty > 0 && p.qty < 5 && (
                                                <span style={{ fontSize: '0.65rem', backgroundColor: '#fef3c7', color: '#d97706', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>LOW STOCK</span>
                                            )}
                                        </div>
                                        <h3 className="item-name" style={{ color: 'var(--color-gray-800)' }}>{p.name}</h3>
                                        <div className="item-meta">
                                            <span style={p.qty < 5 ? { color: p.qty === 0 ? 'var(--color-red-text)' : '#d97706', fontWeight: 'bold' } : {}}>Qty: {p.qty}</span>
                                            <span>₹{p.price}</span>
                                        </div>
                                    </div>
                                    <div className="view-btn-container" style={{ gap: '0.5rem' }}>
                                        <button className="view-btn edit-btn" onClick={() => openProductModal(p)} style={{ backgroundColor: 'var(--color-gray-100)', color: 'var(--color-gray-800)', border: 'none' }}>EDIT</button>
                                        <button className="view-btn delete-btn" onClick={() => handleDeleteProduct(p.id)} style={{ backgroundColor: '#fee2e2', color: 'var(--color-red-text)', border: 'none' }}>DEL</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: '3rem', textAlign: 'center' }}>
                            <button onClick={handleResetDb} style={{ background: 'transparent', border: '1px solid var(--color-red-text)', color: 'var(--color-red-text)', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>⚠ RESET ALL PRODUCTS</button>
                        </div>
                    </>
                )}

                {/* Orders View */}
                {view === 'orders' && (
                    <>
                        <div className="admin-filters">
                            {['new', 'in-process', 'in-transit', 'completed'].map(s => (
                                <button
                                    key={s}
                                    className={`filter-chip ${orderFilter === s ? 'active' : ''}`}
                                    onClick={() => setOrderFilter(s)}
                                    style={orderFilter === s ? { backgroundColor: 'var(--color-primary)', color: 'white', borderColor: 'var(--color-primary)' } : {}}
                                >{s.toUpperCase()}</button>
                            ))}
                        </div>

                        <div className="admin-list">
                            {filteredOrders.map(o => (
                                <div key={o.id} className="admin-list-item" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <div className="admin-item-image" style={{ backgroundColor: 'var(--color-primary-light)', color: 'white' }}>ORD</div>
                                    <div className="admin-item-details">
                                        <p className="item-id" style={{ color: '#9ca3af' }}>#{o.id}</p>
                                        <h3 className="item-name" style={{ color: 'var(--color-gray-800)' }}>{o.name || 'Guest'}</h3>
                                        <div className="item-meta">
                                            <span>Items: {(o.items || []).reduce((acc, i) => acc + i.qty, 0)}</span>
                                            <span>₹{o.total}</span>
                                        </div>
                                        <div className={`status-badge status-${o.status}`}>{o.status}</div>
                                    </div>
                                    <div className="view-btn-container">
                                        <button className="view-btn view-order-btn" onClick={() => { setSelectedOrder(o); setIsOrderModalOpen(true); }} style={{ backgroundColor: 'var(--color-primary)', color: 'white', border: 'none' }}>VIEW</button>
                                    </div>
                                </div>
                            ))}
                            {filteredOrders.length === 0 && <p className="text-center p-4" style={{ color: '#6b7280' }}>No orders found.</p>}
                        </div>

                        <div style={{ marginTop: '3rem', textAlign: 'center' }}>
                            <button onClick={handleDeleteCompletedOrders} style={{ background: 'transparent', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>DELETE COMPLETED HISTORY</button>
                        </div>
                    </>
                )}
            </div>

            {/* Product Modal */}
            {isProductModalOpen && (
                <div className="overlay active modal-overlay" style={{ display: 'flex', zIndex: 2000, backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target.className.includes('overlay') && setIsProductModalOpen(false)}>
                    <div className="modal-modern" style={{ backgroundColor: 'var(--color-white)', borderRadius: '1rem' }}>
                        <button className="close-modal-modern" onClick={() => setIsProductModalOpen(false)} style={{ color: '#6b7280' }}>&times;</button>
                        <h2 style={{ color: 'var(--color-primary)', marginBottom: '1.5rem' }}>{editingProduct ? 'EDIT PRODUCT' : 'ADD PRODUCT'}</h2>
                        <form onSubmit={handleProductSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Image Upload Simplified */}
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button type="button" className="btn-upload-modern" style={{ flex: 1, backgroundColor: 'var(--color-gray-100)', color: 'var(--color-gray-800)', border: '1px dashed #d1d5db' }} onClick={() => fileInputRef.current.click()}>+ UPLOAD IMAGES</button>
                                <input ref={fileInputRef} type="file" hidden multiple accept="image/*" onChange={handleImageChange} />
                            </div>
                            <div style={{ display: 'flex', gap: '5px', overflowX: 'auto' }}>
                                {productForm.images.map((img, idx) => (
                                    <div key={idx} style={{ width: '50px', height: '50px', border: '1px solid #ddd', backgroundImage: `url(${img})`, backgroundSize: 'cover', borderRadius: '4px' }}></div>
                                ))}
                            </div>

                            <input className="modern-input" placeholder="Name" value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} required />
                            <textarea className="modern-input" placeholder="Description" value={productForm.description} onChange={e => setProductForm({ ...productForm, description: e.target.value })} rows="3" />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <input className="modern-input" type="number" placeholder="Price" value={productForm.price} onChange={e => setProductForm({ ...productForm, price: e.target.value })} required />
                                <input className="modern-input" type="number" placeholder="Qty" value={productForm.qty} onChange={e => setProductForm({ ...productForm, qty: e.target.value })} required />
                            </div>
                            <select className="modern-input" value={productForm.category} onChange={e => setProductForm({ ...productForm, category: e.target.value })} required>
                                <option value="" disabled>Select Category</option>
                                {categoryList.map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                            </select>

                            <button type="submit" className="btn-save-modern" style={{ backgroundColor: 'var(--color-primary)', color: 'white', marginTop: '1rem' }}>SAVE PRODUCT</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Order Modal */}
            {isOrderModalOpen && selectedOrder && (
                <div className="overlay active modal-overlay" style={{ display: 'flex', zIndex: 2000, backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target.className.includes('overlay') && setIsOrderModalOpen(false)}>
                    <div className="modal-modern" style={{ maxHeight: '90vh', overflowY: 'auto', backgroundColor: 'var(--color-white)', borderRadius: '1rem' }}>
                        <button className="close-modal-modern" onClick={() => setIsOrderModalOpen(false)} style={{ color: '#6b7280' }}>&times;</button>
                        <h2 style={{ color: 'var(--color-primary)', marginBottom: '1rem' }}>ORDER #{selectedOrder.id}</h2>
                        <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                            <p style={{ margin: '0.25rem 0' }}><strong>Customer:</strong> {selectedOrder.name} ({selectedOrder.phone})</p>
                            <p style={{ margin: '0.25rem 0' }}><strong>Address:</strong> {selectedOrder.address}, {selectedOrder.city}</p>
                        </div>

                        <div>
                            {(selectedOrder.items || []).map((item, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                                    <div>
                                        <span style={{ fontWeight: '500' }}>{item.name}</span>
                                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Qty: {item.qty}</div>
                                    </div>
                                    <span style={{ fontWeight: '500' }}>₹{item.price * (item.qty || 1)}</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ fontWeight: 'bold', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', color: 'var(--color-primary)' }}>
                            <span>Total</span>
                            <span>₹{selectedOrder.total}</span>
                        </div>
                        <hr style={{ margin: '1.5rem 0', borderColor: '#e5e7eb' }} />
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Update Status:</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <select className="modern-input" value={selectedOrder.status} onChange={(e) => setSelectedOrder({ ...selectedOrder, status: e.target.value })} style={{ flex: 1 }}>
                                <option value="new">NEW</option>
                                <option value="in-process">IN-PROCESS</option>
                                <option value="in-transit">IN-TRANSIT</option>
                                <option value="completed">COMPLETED</option>
                            </select>
                            <button className="btn-save-modern" style={{ width: 'auto', backgroundColor: 'var(--color-primary)', color: 'white' }} onClick={() => handleUpdateOS(selectedOrder.status)}>UPDATE</button>
                        </div>
                        <button className="auth-btn" style={{ background: '#fee2e2', color: 'var(--color-red-text)', marginTop: '2rem', border: 'none', width: '100%' }} onClick={() => handleDeleteOrder(selectedOrder.id)}>DELETE ORDER</button>
                    </div>
                </div>
            )}

            {/* Confirm Modal */}
            {isConfirmOpen && (
                <div className="auth-overlay active" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="auth-card" style={{ backgroundColor: 'white', border: 'none', borderRadius: '1rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
                        <h2 style={{ color: 'var(--color-red-text)', marginBottom: '1rem' }}>CONFIRM ACTION</h2>
                        <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>{confirmMessage}</p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button className="auth-btn" style={{ background: 'transparent', border: '1px solid #d1d5db', color: '#374151' }} onClick={() => setIsConfirmOpen(false)}>CANCEL</button>
                            <button className="auth-btn" style={{ background: 'var(--color-red-text)', color: 'white', border: 'none' }} onClick={() => { confirmAction(); setIsConfirmOpen(false); }}>CONFIRM</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Admin;
