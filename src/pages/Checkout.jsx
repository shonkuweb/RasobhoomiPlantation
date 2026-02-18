import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useNavigate } from 'react-router-dom';

const MIN_ORDER_QTY = 5;
const DELIVERY_PER_PLANT = 150;

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

    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = getCartTotal();
    const deliveryCharge = totalQty * DELIVERY_PER_PLANT;
    const total = subtotal + deliveryCharge;

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (totalQty < MIN_ORDER_QTY) {
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
                            Minimum order is <strong>{MIN_ORDER_QTY} plants</strong>. You currently have <strong>{totalQty}</strong> plant{totalQty !== 1 ? 's' : ''} in your cart.
                        </p>
                        <p className="min-order-sub">Add <strong>{MIN_ORDER_QTY - totalQty} more</strong> to proceed with checkout.</p>
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
                            <input
                                type="text" name="zip" placeholder="Zip Code" required
                                value={formData.zip} onChange={handleChange}
                                className="modern-input"
                            />
                        </div>
                    </div>

                    {totalQty < MIN_ORDER_QTY && (
                        <div className="min-order-inline-warning">
                            <span>⚠️</span> Add {MIN_ORDER_QTY - totalQty} more plant{(MIN_ORDER_QTY - totalQty) !== 1 ? 's' : ''} to checkout (min {MIN_ORDER_QTY})
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
                                <span>Delivery ({totalQty} × ₹{DELIVERY_PER_PLANT})</span>
                                <span style={{ color: '#059669' }}>+ ₹{deliveryCharge}</span>
                            </div>
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
