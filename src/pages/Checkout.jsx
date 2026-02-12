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
                if (data.payment_url) {
                    // Real Payment Flow
                    window.location.href = data.payment_url;
                } else {
                    // Mock Flow Notification
                    alert('PhonePe Payment Gateway will be added soon. Order ID: ' + data.id);
                    clearCart();
                    navigate('/');
                }
            } else {
                alert('Order Failed: ' + (data.error || 'Unknown Error'));
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
                <div style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: '8px' }}>
                    <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid #ddd', paddingBottom: '0.5rem' }}>Order Summary</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {cart.map(item => {
                            const product = products.find(p => p.id === item.id);
                            if (!product) return null;
                            return (
                                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span>{product.name} x {item.qty}</span>
                                </div>
                            );
                        })}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                            <span>Delivery Charges</span>
                            <span>₹{shippingFee}</span>
                        </div>
                        <div style={{ borderTop: '1px solid #ddd', marginTop: '1rem', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                            <span>Total</span>
                            <span>₹{total}</span>
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
