import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useNavigate } from 'react-router-dom';

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

    const shippingFee = 150;
    const subtotal = getCartTotal();
    const total = subtotal + shippingFee;

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
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
                    // Real Payment Flow (Redirect to PhonePe)
                    window.location.href = data.payment_url;
                } else if (data.success) {
                    // Mock Flow / Success without Redirect
                    alert(`Order Placed Successfully! (Mock Payment)\nOrder ID: ${data.id}`);
                    clearCart();
                    navigate('/');
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
        <main style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
            <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>CHECKOUT</h1>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Order Summary */}
                <div style={{ border: '1px solid #e5e7eb', padding: '1.5rem', borderRadius: '12px', backgroundColor: '#f9fafb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ marginBottom: '1.5rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.75rem', fontSize: '1.25rem', color: '#1f2937' }}>Order Summary</h3>

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

                        <div style={{ borderTop: '1px dashed #d1d5db', marginTop: '0.5rem', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', color: '#374151' }}>
                                <span>Item Subtotal</span>
                                <span>₹{subtotal}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', color: '#374151' }}>
                                <span>Delivery Charges</span>
                                <span style={{ color: '#059669' }}>+ ₹{shippingFee}</span>
                            </div>
                        </div>

                        <div style={{ borderTop: '2px solid #e5e7eb', marginTop: '0.5rem', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#111827' }}>Grand Total</span>
                            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#2C1B10' }}>₹{total}</span>
                        </div>
                    </div>
                </div>

                {/* Shipping Details Form */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h3 style={{ marginBottom: '0.5rem' }}>Shipping Details</h3>

                    <input
                        type="text" name="name" placeholder="Full Name" required
                        value={formData.name} onChange={handleChange}
                        style={{ padding: '0.75rem', border: '1px solid #ccc', borderRadius: '4px' }}
                    />

                    <input
                        type="tel" name="phone" placeholder="Phone Number" required
                        value={formData.phone} onChange={handleChange}
                        style={{ padding: '0.75rem', border: '1px solid #ccc', borderRadius: '4px' }}
                    />

                    <textarea
                        name="address" placeholder="Address" required
                        value={formData.address} onChange={handleChange}
                        rows="3"
                        style={{ padding: '0.75rem', border: '1px solid #ccc', borderRadius: '4px' }}
                    />

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <input
                            type="text" name="city" placeholder="City" required
                            value={formData.city} onChange={handleChange}
                            style={{ flex: 1, padding: '0.75rem', border: '1px solid #ccc', borderRadius: '4px' }}
                        />
                        <input
                            type="text" name="zip" placeholder="Zip Code" required
                            value={formData.zip} onChange={handleChange}
                            style={{ flex: 1, padding: '0.75rem', border: '1px solid #ccc', borderRadius: '4px' }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        style={{
                            marginTop: '1rem',
                            padding: '1rem',
                            background: isSubmitting ? '#9ca3af' : '#2C1B10',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            fontSize: '1rem'
                        }}
                    >
                        {isSubmitting ? 'Processing...' : `PAY ₹${total}`}
                    </button>
                    <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#666' }}>
                        Secure Payment via PhonePe
                    </p>
                </form>
            </div>
        </main>
    );
};

export default Checkout;
