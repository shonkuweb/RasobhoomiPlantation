import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';

const PaymentPending = () => {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('orderId');

    return (
        <div style={{ textAlign: 'center', padding: '50px 20px', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontSize: '64px', color: '#FF9800', marginBottom: '20px' }}>⏳</div>
            <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>Payment Pending</h1>
            <p style={{ fontSize: '18px', color: '#666', marginBottom: '30px' }}>
                Your payment is currently being processed. We will update the status shortly.
            </p>
            {orderId && (
                <div style={{ background: '#fff8e1', padding: '15px', borderRadius: '8px', marginBottom: '30px', color: '#f57c00' }}>
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
                Go to Home
            </Link>
        </div>
    );
};

export default PaymentPending;
