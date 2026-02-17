import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import '../styles/PaymentStatus.css';

const PaymentPending = () => {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('orderId');

    return (
        <div className="payment-status-container">
            <div className="status-card">
                <div className="status-icon-wrapper icon-pending">
                    ⏳
                </div>
                <h1 className="status-title">Payment Processing</h1>
                <p className="status-message">
                    We have received your request. Please wait while we verify the payment status.
                </p>

                {orderId && (
                    <div className="order-details">
                        <strong>Order ID</strong>
                        <span className="order-id-text">#{orderId}</span>
                    </div>
                )}

                <div className="action-buttons">
                    <Link to="/" className="btn-primary">
                        Return Home
                    </Link>
                    <Link to="/track-order" className="btn-outline">
                        Check Status
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default PaymentPending;
