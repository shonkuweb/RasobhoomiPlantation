import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import '../styles/PaymentStatus.css';

const PaymentFailure = () => {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('orderId');

    return (
        <div className="payment-status-container">
            <div className="status-card">
                <div className="status-icon-wrapper icon-failure">
                    ✕
                </div>
                <h1 className="status-title">Payment Failed</h1>
                <p className="status-message">
                    We couldn't process your transaction. Don't worry, you haven't been charged.
                </p>

                {orderId && (
                    <div className="order-details">
                        <strong>Order ID</strong>
                        <span className="order-id-text">#{orderId}</span>
                    </div>
                )}

                <div className="action-buttons">
                    <Link to="/checkout" className="btn-primary">
                        Try Again
                    </Link>
                    <Link to="/" className="btn-outline">
                        Go Home
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default PaymentFailure;
