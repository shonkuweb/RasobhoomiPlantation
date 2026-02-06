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
        const payload = {
            ...productForm,
            image: productForm.images[0] || '', // Legacy support
            price: parseFloat(productForm.price),
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
        return (p.category || '').includes(productFilter);
    });

    const filteredOrders = orders.filter(o => o.status === orderFilter).reverse();

    if (loading) return <div className="p-4 text-center">Loading Admin...</div>;

    if (!isAuthenticated) {
        return (
            <div className="auth-overlay active" style={{ display: 'flex', zIndex: 2000 }}>
                <div className="auth-card">
                    <div style={{ fontFamily: "'Britanny', 'Great Vibes', cursive", fontSize: '2.5rem', color: '#2C1B10', marginBottom: '0.5rem' }}>
                        Rasobhoomi
                    </div>
                    <h2 style={{ textTransform: 'uppercase', margin: '1rem 0' }}>Admin Access</h2>
                    <form onSubmit={handleLogin} style={{ width: '100%' }}>
                        <input
                            type="password"
                            className="modern-input"
                            placeholder="Enter Passcode"
                            value={authPass}
                            onChange={(e) => setAuthPass(e.target.value)}
                        />
                        <button type="submit" className="auth-btn" style={{ marginTop: '1rem' }}>Unlock</button>
                    </form>
                    {authError && <p style={{ color: 'red', marginTop: '1rem' }}>{authError}</p>}
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
            <div className="admin-container" style={{ padding: '1rem', maxWidth: '1440px', margin: '0 auto' }}>

                {/* Toggle */}
                <div className="admin-toggle-container">
                    <div className="toggle-wrapper">
                        <button
                            className={`toggle-btn ${view === 'products' ? 'active' : ''}`}
                            onClick={() => setView('products')}
                        >Products</button>
                        <button
                            className={`toggle-btn ${view === 'orders' ? 'active' : ''}`}
                            onClick={() => setView('orders')}
                        >Orders</button>
                    </div>
                </div>

                {/* Products View */}
                {view === 'products' && (
                    <>
                        <button
                            className="btn-add-product-modern"
                            onClick={() => openProductModal()}
                        >+ ADD PRODUCT</button>

                        <div className="admin-filters">
                            <button
                                className={`filter-chip ${productFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setProductFilter('all')}
                            >ALL</button>
                            {categoryList.map(c => (
                                <button
                                    key={c.id}
                                    className={`filter-chip ${productFilter === c.name ? 'active' : ''}`}
                                    onClick={() => setProductFilter(c.name)}
                                >{c.name.toUpperCase()}</button>
                            ))}
                            <button
                                className={`filter-chip ${productFilter === 'out-of-stock' ? 'active' : ''}`}
                                onClick={() => setProductFilter('out-of-stock')}
                                style={{ color: 'red', borderColor: 'red' }}
                            >OUT OF STOCK</button>
                        </div>

                        <div className="admin-list">
                            {filteredProducts.map(p => (
                                <div key={p.id} className="admin-list-item">
                                    <div className="admin-item-image">
                                        {p.image ? <img src={p.image} alt={p.name} /> : 'IMG'}
                                    </div>
                                    <div className="admin-item-details">
                                        <p className="item-id">#{p.id}</p>
                                        <p style={{ fontSize: '0.75rem', color: '#8B6F47', fontWeight: 'bold', textTransform: 'uppercase' }}>{p.category}</p>
                                        <h3 className="item-name">{p.name}</h3>
                                        <div className="item-meta">
                                            <span>Qty: {p.qty}</span>
                                            <span>₹{p.price}</span>
                                        </div>
                                    </div>
                                    <div className="view-btn-container" style={{ gap: '0.5rem' }}>
                                        <button className="view-btn edit-btn" onClick={() => openProductModal(p)}>EDIT</button>
                                        <button className="view-btn delete-btn" onClick={() => handleDeleteProduct(p.id)}>DEL</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: '3rem', textAlign: 'center' }}>
                            <button onClick={handleResetDb} style={{ background: 'transparent', border: '1px solid red', color: 'red', padding: '0.5rem', borderRadius: '4px' }}>⚠ RESET ALL PRODUCTS</button>
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
                                >{s.toUpperCase()}</button>
                            ))}
                        </div>

                        <div className="admin-list">
                            {filteredOrders.map(o => (
                                <div key={o.id} className="admin-list-item">
                                    <div className="admin-item-image">ORD</div>
                                    <div className="admin-item-details">
                                        <p className="item-id">#{o.id}</p>
                                        <h3 className="item-name">{o.name || 'Guest'}</h3>
                                        <div className="item-meta">
                                            <span>Items: {(o.items || []).reduce((acc, i) => acc + i.qty, 0)}</span>
                                            <span>₹{o.total}</span>
                                        </div>
                                        <div className={`status-badge status-${o.status}`}>{o.status}</div>
                                    </div>
                                    <div className="view-btn-container">
                                        <button className="view-btn view-order-btn" onClick={() => { setSelectedOrder(o); setIsOrderModalOpen(true); }}>VIEW</button>
                                    </div>
                                </div>
                            ))}
                            {filteredOrders.length === 0 && <p className="text-center p-4">No orders found.</p>}
                        </div>

                        <div style={{ marginTop: '3rem', textAlign: 'center' }}>
                            <button onClick={handleDeleteCompletedOrders} style={{ background: 'transparent', border: '1px solid #8B4513', color: '#8B4513', padding: '0.5rem', borderRadius: '4px' }}>DELETE COMPLETED HISTORY</button>
                        </div>
                    </>
                )}
            </div>

            {/* Product Modal */}
            {isProductModalOpen && (
                <div className="overlay active modal-overlay" style={{ display: 'flex', zIndex: 2000 }} onClick={(e) => e.target.className.includes('overlay') && setIsProductModalOpen(false)}>
                    <div className="modal-modern">
                        <button className="close-modal-modern" onClick={() => setIsProductModalOpen(false)}>&times;</button>
                        <h2>{editingProduct ? 'EDIT PRODUCT' : 'ADD PRODUCT'}</h2>
                        <form onSubmit={handleProductSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {/* Image Upload Simplified */}
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button type="button" className="btn-upload-modern" style={{ flex: 1 }} onClick={() => fileInputRef.current.click()}>+ UPLOAD IMAGES</button>
                                <input ref={fileInputRef} type="file" hidden multiple accept="image/*" onChange={handleImageChange} />
                            </div>
                            <div style={{ display: 'flex', gap: '5px', overflowX: 'auto' }}>
                                {productForm.images.map((img, idx) => (
                                    <div key={idx} style={{ width: '50px', height: '50px', border: '1px solid #ddd', backgroundImage: `url(${img})`, backgroundSize: 'cover' }}></div>
                                ))}
                            </div>

                            <input className="modern-input" placeholder="Name" value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} required />
                            <textarea className="modern-input" placeholder="Description" value={productForm.description} onChange={e => setProductForm({ ...productForm, description: e.target.value })} rows="3" />
                            <input className="modern-input" type="number" placeholder="Price" value={productForm.price} onChange={e => setProductForm({ ...productForm, price: e.target.value })} required />
                            <select className="modern-input" value={productForm.category} onChange={e => setProductForm({ ...productForm, category: e.target.value })} required>
                                <option value="" disabled>Select Category</option>
                                {categoryList.map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                            </select>
                            <input className="modern-input" type="number" placeholder="Qty" value={productForm.qty} onChange={e => setProductForm({ ...productForm, qty: e.target.value })} required />

                            <button type="submit" className="btn-save-modern">SAVE</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Order Modal */}
            {isOrderModalOpen && selectedOrder && (
                <div className="overlay active modal-overlay" style={{ display: 'flex', zIndex: 2000 }} onClick={(e) => e.target.className.includes('overlay') && setIsOrderModalOpen(false)}>
                    <div className="modal-modern" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
                        <button className="close-modal-modern" onClick={() => setIsOrderModalOpen(false)}>&times;</button>
                        <h2>ORDER #{selectedOrder.id}</h2>
                        <p><strong>Customer:</strong> {selectedOrder.name} ({selectedOrder.phone})</p>
                        <p><strong>Address:</strong> {selectedOrder.address}, {selectedOrder.city}</p>
                        <hr style={{ margin: '1rem 0' }} />
                        <div>
                            {(selectedOrder.items || []).map((item, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span>{item.name} x {item.qty}</span>
                                    <span>₹{item.price}</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ fontWeight: 'bold', marginTop: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Total</span>
                            <span>₹{selectedOrder.total}</span>
                        </div>
                        <hr style={{ margin: '1rem 0' }} />
                        <label>Update Status:</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <select className="modern-input" value={selectedOrder.status} onChange={(e) => setSelectedOrder({ ...selectedOrder, status: e.target.value })} >
                                <option value="new">NEW</option>
                                <option value="in-process">IN-PROCESS</option>
                                <option value="in-transit">IN-TRANSIT</option>
                                <option value="completed">COMPLETED</option>
                            </select>
                            <button className="btn-save-modern" style={{ width: 'auto' }} onClick={() => handleUpdateOS(selectedOrder.status)}>UPDATE</button>
                        </div>
                        <button className="auth-btn" style={{ background: '#ef4444', marginTop: '1rem' }} onClick={() => handleDeleteOrder(selectedOrder.id)}>DELETE ORDER</button>
                    </div>
                </div>
            )}

            {/* Confirm Modal */}
            {isConfirmOpen && (
                <div className="auth-overlay active">
                    <div className="auth-card">
                        <h2 style={{ color: '#ef4444' }}>CONFIRM</h2>
                        <p>{confirmMessage}</p>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <button className="auth-btn" style={{ background: 'transparent', border: '2px solid #2C1B10', color: '#2C1B10' }} onClick={() => setIsConfirmOpen(false)}>CANCEL</button>
                            <button className="auth-btn" style={{ background: '#ef4444' }} onClick={() => { confirmAction(); setIsConfirmOpen(false); }}>CONFIRM</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Admin;
