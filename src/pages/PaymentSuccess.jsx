import React, { useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import '../styles/PaymentStatus.css';

const PaymentSuccess = () => {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('orderId');
    const { clearCart } = useShop();

    useEffect(() => {
        clearCart();
    }, [clearCart]);

    return (
        <div className="payment-status-container status-bg-success">
            {/* Confetti Particles */}
            <div className="confetti-container">
                <div className="confetti"></div>
                <div className="confetti"></div>
                <div className="confetti"></div>
                <div className="confetti"></div>
                <div className="confetti"></div>
                <div className="confetti"></div>
                <div className="confetti"></div>
                <div className="confetti"></div>
            </div>

            {/* Decorative Leaves */}
            <svg className="leaf-decor leaf-top-right" viewBox="0 0 200 200" fill="#1A4D2E">
                <path d="M100 0C100 0 130 70 200 100C130 130 100 200 100 200C100 200 70 130 0 100C70 70 100 0 100 0Z" />
            </svg>
            <svg className="leaf-decor leaf-bottom-left" viewBox="0 0 200 200" fill="#1A4D2E">
                <path d="M100 0C100 0 130 70 200 100C130 130 100 200 100 200C100 200 70 130 0 100C70 70 100 0 100 0Z" />
            </svg>

            <div className="status-card">
                {/* Animated Checkmark */}
                <div className="status-icon-wrapper icon-success">
                    <svg viewBox="0 0 52 52">
                        <path className="checkmark-path" d="M14 27l8 8 16-16" />
                    </svg>
                </div>

                <h1 className="status-title">Payment Successful!</h1>
                <p className="status-subtitle">
                    Thank you for your purchase! Your order has been confirmed and our team is preparing it with care. 🌿
                </p>

                {/* Progress Steps */}
                <div className="progress-steps">
                    <div className="step">
                        <div className="step-circle active">✓</div>
                        <span className="step-label">Confirmed</span>
                    </div>
                    <div className="step-line active"></div>
                    <div className="step">
                        <div className="step-circle inactive">2</div>
                        <span className="step-label">Processing</span>
                    </div>
                    <div className="step-line"></div>
                    <div className="step">
                        <div className="step-circle inactive">3</div>
                        <span className="step-label">Shipped</span>
                    </div>
                </div>

                {orderId && (
                    <div className="order-details">
                        <span className="order-label">Order ID</span>
                        <span className="order-id-text">#{orderId}</span>
                    </div>
                )}

                <div className="action-buttons">
                    <Link to="/" className="btn-primary">
                        Continue Shopping
                    </Link>
                    <Link to="/track-order" className="btn-outline">
                        Track Order
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default PaymentSuccess;
