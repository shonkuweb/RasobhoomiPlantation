import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';

const PaymentFailure = () => {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('orderId');

    return (
        <div style={{ textAlign: 'center', padding: '50px 20px', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontSize: '64px', color: '#F44336', marginBottom: '20px' }}>✕</div>
            <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>Payment Failed</h1>
            <p style={{ fontSize: '18px', color: '#666', marginBottom: '30px' }}>
                We couldn't process your payment. Please try again.
            </p>
            {orderId && (
                <div style={{ background: '#fff0f0', padding: '15px', borderRadius: '8px', marginBottom: '30px', color: '#d32f2f' }}>
                    <strong>Order ID:</strong> {orderId}
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
                <Link to="/checkout" style={{
                    display: 'inline-block',
                    background: '#000',
                    color: '#fff',
                    padding: '12px 30px',
                    textDecoration: 'none',
                    borderRadius: '5px',
                    fontWeight: 'bold'
                }}>
                    Try Again
                </Link>
                <Link to="/" style={{
                    display: 'inline-block',
                    background: '#fff',
                    color: '#000',
                    border: '1px solid #000',
                    padding: '12px 30px',
                    textDecoration: 'none',
                    borderRadius: '5px',
                    fontWeight: 'bold'
                }}>
                    Go Home
                </Link>
            </div>
        </div>
    );
};

export default PaymentFailure;
