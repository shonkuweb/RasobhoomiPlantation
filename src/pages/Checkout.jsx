import React, { useEffect, useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useNavigate } from 'react-router-dom';

const DEFAULT_ORDER_SETTINGS = {
    minimumOrderQty: 3,
    deliveryPerPlant: 150,
    drumDeliveryMultiplier: 0.5,
    freeDeliveryEnabled: false,
    freeDeliveryStartsAt: null,
    freeDeliveryEndsAt: null,
    freeDeliveryActive: false
};

const Checkout = () => {
    const { cart, products, getCartTotal, clearCart } = useShop();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        address: '',
        city: '',
        zip: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showMinOrderNotice, setShowMinOrderNotice] = useState(false);
    const [orderSettings, setOrderSettings] = useState(DEFAULT_ORDER_SETTINGS);
    const [discounts, setDiscounts] = useState([]);
    const [pincodeState, setPincodeState] = useState({
        loading: false,
        checkedZip: '',
        result: null,
        error: null
    });

    const checkPincodeServiceability = async (zipToCheck) => {
        const cleanZip = (zipToCheck || formData.zip || '').trim();
        if (!cleanZip || !/^\d{6}$/.test(cleanZip)) {
            setPincodeState({
                loading: false,
                checkedZip: cleanZip,
                result: null,
                error: 'Please enter a valid 6-digit PIN code'
            });
            return;
        }

        setPincodeState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const res = await fetch(`/api/shipping/check-pincode?pincode=${cleanZip}`);
            const data = await res.json();
            if (res.ok && data.success) {
                setPincodeState({
                    loading: false,
                    checkedZip: cleanZip,
                    result: data,
                    error: null
                });
            } else {
                setPincodeState({
                    loading: false,
                    checkedZip: cleanZip,
                    result: null,
                    error: data.error || 'Failed to check pincode serviceability'
                });
            }
        } catch (err) {
            console.error('Pincode check error:', err);
            setPincodeState({
                loading: false,
                checkedZip: cleanZip,
                result: null,
                error: 'Network error checking pincode'
            });
        }
    };

    useEffect(() => {
        let isMounted = true;
        let timer;

        const fetchData = async () => {
            try {
                const [sRes, dRes] = await Promise.all([
                    fetch('/api/settings/order'),
                    fetch('/api/discounts')
                ]);

                if (sRes.ok) {
                    const data = await sRes.json();
                    if (isMounted) setOrderSettings({ ...DEFAULT_ORDER_SETTINGS, ...data });
                }
                if (dRes.ok) {
                    const dData = await dRes.json();
                    if (isMounted) setDiscounts(Array.isArray(dData) ? dData : []);
                }
            } catch (err) {
                console.error('Failed to load checkout settings/discounts:', err);
            }
        };

        fetchData();
        timer = setInterval(fetchData, 15000);

        return () => {
            isMounted = false;
            if (timer) clearInterval(timer);
        };
    }, []);

    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = getCartTotal();

    const { discountAmount, finalDeliveryCharge, appliedDiscounts } = useMemo(() => {
        let baseDelivery = orderSettings.freeDeliveryActive ? 0 : cart.reduce((sum, item) => {
            const product = products.find(p => p.id === item.id);
            if (!product) return sum;
            if (product.category === 'Drum Plants') {
                return sum + (product.price * orderSettings.drumDeliveryMultiplier * item.qty);
            }
            return sum + (orderSettings.deliveryPerPlant * item.qty);
        }, 0);

        let dAmount = 0;
        let fDelivery = baseDelivery;
        const applied = [];

        for (const rule of discounts) {
            const isEnabled = rule.is_enabled === true || rule.is_enabled === 1 || rule.is_enabled === '1';
            if (!isEnabled) continue;
            const amt1 = Number(rule.amount1 || 0);
            const amt2 = Number(rule.amount2 || 0);
            const op = rule.operator || '>=';

            let matches = false;
            if (amt2 > 0) {
                if (op === '>' || op === '<') {
                    matches = subtotal > amt1 && subtotal < amt2;
                } else {
                    matches = subtotal >= amt1 && subtotal <= amt2;
                }
            } else {
                if (op === '>') matches = subtotal > amt1;
                else if (op === '>=') matches = subtotal >= amt1;
                else if (op === '<') matches = subtotal < amt1;
                else if (op === '<=') matches = subtotal <= amt1;
            }

            if (matches) {
                if (rule.discount_type === 'free_delivery') {
                    fDelivery = 0;
                    applied.push({ id: rule.id, name: rule.name, type: 'free_delivery', amount: baseDelivery });
                } else if (rule.discount_type === 'percentage') {
                    const pAmt = Math.round((subtotal * Number(rule.discount_value || 0)) / 100);
                    dAmount += pAmt;
                    applied.push({ id: rule.id, name: rule.name, type: 'percentage', value: rule.discount_value, amount: pAmt });
                } else if (rule.discount_type === 'fixed') {
                    const fAmt = Math.min(subtotal, Number(rule.discount_value || 0));
                    dAmount += fAmt;
                    applied.push({ id: rule.id, name: rule.name, type: 'fixed', value: rule.discount_value, amount: fAmt });
                }
            }
        }

        return {
            discountAmount: dAmount,
            finalDeliveryCharge: fDelivery,
            appliedDiscounts: applied
        };
    }, [cart, products, orderSettings, subtotal, discounts]);

    const deliveryCharge = finalDeliveryCharge;
    const total = Math.max(0, subtotal - discountAmount) + deliveryCharge;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        if (name === 'zip') {
            const cleanVal = value.trim();
            if (cleanVal.length === 6 && /^\d{6}$/.test(cleanVal)) {
                checkPincodeServiceability(cleanVal);
            } else if (pincodeState.result || pincodeState.error) {
                setPincodeState({ loading: false, checkedZip: '', result: null, error: null });
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (totalQty < orderSettings.minimumOrderQty) {
            setShowMinOrderNotice(true);
            return;
        }

        setIsSubmitting(true);

        const orderItems = cart.map(item => {
            const product = products.find(p => p.id === item.id);
            return {
                id: item.id,
                qty: item.qty,
                price: product ? product.price : 0,
                name: product ? product.name : 'Unknown'
            };
        });

        const payload = {
            ...formData,
            items: orderItems,
            total
        };

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok) {
                if (data.success && data.payment_url) {
                    console.log('Redirecting to PhonePe:', data.payment_url);
                    window.location.href = data.payment_url;
                } else {
                    alert('Payment Initiation Failed: ' + (data.message || 'Unknown Error'));
                }
            } else {
                const errorMsg = data.error || 'Unknown Error';
                const details = data.details ? '\n' + (typeof data.details === 'object' ? JSON.stringify(data.details, null, 2) : data.details) : '';
                alert('Order Failed: ' + errorMsg + details);
                console.error('Order Error:', data);
            }
        } catch (err) {
            console.error(err);
            alert('Something went wrong.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (cart.length === 0) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <h2>Your Cart is Empty</h2>
                <button
                    onClick={() => navigate('/')}
                    style={{
                        marginTop: '1rem',
                        padding: '0.75rem 1.5rem',
                        background: '#2C1B10',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Continue Shopping
                </button>
            </div>
        );
    }

    return (
        <main className="checkout-page-container">
            <h1 className="checkout-page-title">CHECKOUT</h1>

            {/* Minimum Order Notification */}
            {showMinOrderNotice && (
                <div className="min-order-overlay" onClick={() => setShowMinOrderNotice(false)}>
                    <div className="min-order-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="min-order-icon">🌿</div>
                        <h2 className="min-order-title">Almost There!</h2>
                        <p className="min-order-message">
                                Minimum order is <strong>{orderSettings.minimumOrderQty} plants</strong>. You currently have <strong>{totalQty}</strong> plant{totalQty !== 1 ? 's' : ''} in your cart.
                        </p>
                            <p className="min-order-sub">Add <strong>{orderSettings.minimumOrderQty - totalQty} more</strong> to proceed with checkout.</p>
                        <div className="min-order-actions">
                            <button className="btn-primary" onClick={() => { setShowMinOrderNotice(false); navigate('/'); }}>
                                🌱 Add More Plants
                            </button>
                            <button className="min-order-dismiss" onClick={() => setShowMinOrderNotice(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="checkout-grid">

                {/* Shipping Details Form */}
                <form onSubmit={handleSubmit} className="checkout-card">
                    <h3 className="checkout-section-title">Shipping Details</h3>

                    <div className="form-group">
                        <input
                            type="text" name="name" placeholder="Full Name" required
                            value={formData.name} onChange={handleChange}
                            className="modern-input"
                        />
                    </div>

                    <div className="form-group">
                        <input
                            type="tel" name="phone" placeholder="Phone Number" required
                            value={formData.phone} onChange={handleChange}
                            className="modern-input"
                        />
                    </div>

                    <div className="form-group">
                        <textarea
                            name="address" placeholder="Address" required
                            value={formData.address} onChange={handleChange}
                            rows="3"
                            className="modern-input"
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <input
                                type="text" name="city" placeholder="City" required
                                value={formData.city} onChange={handleChange}
                                className="modern-input"
                            />
                        </div>
                        <div className="form-group">
                            <div className="zip-input-wrapper">
                                <input
                                    type="text" name="zip" placeholder="Pincode" required
                                    value={formData.zip} onChange={handleChange}
                                    maxLength={6}
                                    className="modern-input zip-input"
                                />
                                <button
                                    type="button"
                                    className="btn-check-pincode"
                                    onClick={() => checkPincodeServiceability(formData.zip)}
                                    disabled={pincodeState.loading || !formData.zip}
                                >
                                    {pincodeState.loading ? 'Checking...' : 'Check Service'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Delivery Serviceability Status Box */}
                    {pincodeState.loading && (
                        <div className="pincode-status-box loading">
                            <span className="pincode-spinner">🔄</span> Checking delivery service for {formData.zip}...
                        </div>
                    )}

                    {!pincodeState.loading && pincodeState.result && (
                        <div className="pincode-status-box available">
                            <div className="pincode-status-header">
                                <span className="pincode-icon">🚚</span>
                                <strong className="pincode-status-title">
                                    Delivery Service Available
                                </strong>
                            </div>
                            <p className="pincode-status-msg">
                                Delivery service is available for pincode <strong>{pincodeState.result.pincode}</strong>. Your order will be safely dispatched to this address.
                            </p>
                        </div>
                    )}

                    {!pincodeState.loading && pincodeState.error && (
                        <div className="pincode-status-box error">
                            ⚠️ {pincodeState.error}
                        </div>
                    )}

                    {totalQty < orderSettings.minimumOrderQty && (
                        <div className="min-order-inline-warning">
                            <span>⚠️</span> Add {orderSettings.minimumOrderQty - totalQty} more plant{(orderSettings.minimumOrderQty - totalQty) !== 1 ? 's' : ''} to checkout (min {orderSettings.minimumOrderQty})
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="btn-primary btn-block"
                        style={{ fontSize: '1rem', opacity: isSubmitting ? 0.7 : 1 }}
                    >
                        {isSubmitting ? 'Processing...' : `PAY ₹${total}`}
                    </button>
                    <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#666', marginTop: '1rem' }}>
                        Secure Payment via PhonePe
                    </p>
                </form>

                {/* Order Summary */}
                <div className="checkout-card">
                    <h3 className="checkout-section-title">Order Summary</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Items List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {cart.map(item => {
                                const product = products.find(p => p.id === item.id);
                                if (!product) return null;
                                return (
                                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', color: '#4b5563' }}>
                                        <span>{product.name} <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>x {item.qty}</span></span>
                                        <span style={{ fontWeight: '500' }}>₹{product.price * item.qty}</span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="summary-total">
                            <div className="summary-row" style={{ fontSize: '1rem' }}>
                                <span>Item Subtotal</span>
                                <span>₹{subtotal}</span>
                            </div>
                            <div className="summary-row" style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                                <span>Total Plants</span>
                                <span>{totalQty}</span>
                            </div>
                            <div className="summary-row" style={{ fontSize: '1rem' }}>
                                <span>Delivery Charges</span>
                                <span style={{ color: '#059669' }}>
                                    {orderSettings.freeDeliveryActive || deliveryCharge === 0 ? 'FREE' : `+ ₹${deliveryCharge}`}
                                </span>
                            </div>
                            {appliedDiscounts.length > 0 && (
                                <div style={{ background: '#f0fdf4', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #bbf7d0', margin: '0.5rem 0' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#166534', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        🎉 Applied Discounts:
                                    </div>
                                    {appliedDiscounts.map((disc, idx) => (
                                        <div key={disc.id || idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#15803d', fontWeight: '500' }}>
                                            <span>• {disc.name}</span>
                                            <span>{disc.type === 'free_delivery' ? 'FREE DELIVERY' : `- ₹${disc.amount}`}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {discountAmount > 0 && (
                                <div className="summary-row" style={{ fontSize: '0.95rem', color: '#059669', fontWeight: '600' }}>
                                    <span>Total Savings</span>
                                    <span>- ₹{discountAmount}</span>
                                </div>
                            )}
                            <div className="summary-row" style={{ marginTop: '0.5rem', borderTop: '1px dashed #e5e7eb', paddingTop: '0.5rem' }}>
                                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#111827' }}>Grand Total</span>
                                <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#2C1B10' }}>₹{total}</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </main>
    );
};

export default Checkout;
