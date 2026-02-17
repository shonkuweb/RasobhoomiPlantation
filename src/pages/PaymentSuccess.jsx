import React, { useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useShop } from '../context/ShopContext';

const PaymentSuccess = () => {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('orderId');
    const { clearCart } = useShop();

    useEffect(() => {
        clearCart();
    }, [clearCart]);

    return (
        <div style={{ textAlign: 'center', padding: '50px 20px', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontSize: '64px', color: '#4CAF50', marginBottom: '20px' }}>✓</div>
            <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>Payment Successful!</h1>
            <p style={{ fontSize: '18px', color: '#666', marginBottom: '30px' }}>
                Thank you for your order. Your transaction was successful.
            </p>
            {orderId && (
                <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', marginBottom: '30px' }}>
                    <strong>Order ID:</strong> {orderId}
                </div>
            )}
            <Link to="/" style={{
                display: 'inline-block',
                background: '#000',
                color: '#fff',
                padding: '12px 30px',
                textDecoration: 'none',
                borderRadius: '5px',
                fontWeight: 'bold'
            }}>
                Continue Shopping
            </Link>
        </div>
    );
};

export default PaymentSuccess;
