import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import '../styles/PaymentStatus.css';

const PaymentFailure = () => {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('orderId');

    return (
        <div className="payment-status-container status-bg-failure">
            {/* Decorative Leaves */}
            <svg className="leaf-decor leaf-top-right" viewBox="0 0 200 200" fill="#dc2626">
                <path d="M100 0C100 0 130 70 200 100C130 130 100 200 100 200C100 200 70 130 0 100C70 70 100 0 100 0Z" />
            </svg>
            <svg className="leaf-decor leaf-bottom-left" viewBox="0 0 200 200" fill="#dc2626">
                <path d="M100 0C100 0 130 70 200 100C130 130 100 200 100 200C100 200 70 130 0 100C70 70 100 0 100 0Z" />
            </svg>

            <div className="status-card">
                {/* Animated X Icon */}
                <div className="status-icon-wrapper icon-failure">
                    <svg viewBox="0 0 52 52">
                        <line className="x-path" x1="16" y1="16" x2="36" y2="36" />
                        <line className="x-path" x1="36" y1="16" x2="16" y2="36" style={{ animationDelay: '1s' }} />
                    </svg>
                </div>

                <h1 className="status-title title-failure">Payment Failed</h1>
                <p className="status-subtitle">
                    We couldn't process your transaction. Don't worry — you have not been charged.
                </p>

                {orderId && (
                    <div className="order-details order-failure">
                        <span className="order-label">Order ID</span>
                        <span className="order-id-text">#{orderId}</span>
                    </div>
                )}

                {/* Helpful Tips */}
                <div className="tips-section">
                    <p className="tips-title">What you can try</p>
                    <div className="tip-item">
                        <span className="tip-icon">💳</span>
                        <span>Check your card details and ensure sufficient balance</span>
                    </div>
                    <div className="tip-item">
                        <span className="tip-icon">🔄</span>
                        <span>Try a different payment method or UPI app</span>
                    </div>
                    <div className="tip-item">
                        <span className="tip-icon">📞</span>
                        <span>Contact your bank if the issue persists</span>
                    </div>
                </div>

                <div className="action-buttons">
                    <Link to="/checkout" className="btn-primary btn-retry">
                        Try Again
                    </Link>
                    <Link to="/" className="btn-outline btn-outline-red">
                        Go Home
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default PaymentFailure;
