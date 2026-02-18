import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import '../styles/PaymentStatus.css';

const PaymentPending = () => {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('orderId');

    return (
        <div className="payment-status-container status-bg-pending">
            {/* Decorative Leaves */}
            <svg className="leaf-decor leaf-top-right" viewBox="0 0 200 200" fill="#d97706">
                <path d="M100 0C100 0 130 70 200 100C130 130 100 200 100 200C100 200 70 130 0 100C70 70 100 0 100 0Z" />
            </svg>
            <svg className="leaf-decor leaf-bottom-left" viewBox="0 0 200 200" fill="#d97706">
                <path d="M100 0C100 0 130 70 200 100C130 130 100 200 100 200C100 200 70 130 0 100C70 70 100 0 100 0Z" />
            </svg>

            <div className="status-card">
                {/* Animated Spinner Icon */}
                <div className="status-icon-wrapper icon-pending">
                    <svg viewBox="0 0 52 52">
                        <circle cx="26" cy="26" r="18" strokeDasharray="80 40" />
                    </svg>
                </div>

                <h1 className="status-title title-pending">Payment Processing</h1>
                <p className="status-subtitle">
                    Your payment is being verified. This usually takes a few moments. Please don't close this page.
                </p>

                {/* Animated Progress Bar */}
                <div className="pending-progress-bar">
                    <div className="pending-progress-fill"></div>
                </div>

                {orderId && (
                    <div className="order-details order-pending">
                        <span className="order-label">Order ID</span>
                        <span className="order-id-text">#{orderId}</span>
                    </div>
                )}

                <div className="action-buttons">
                    <Link to="/" className="btn-primary">
                        Return Home
                    </Link>
                    <Link to="/track-order" className="btn-outline btn-outline-amber">
                        Check Status
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default PaymentPending;
