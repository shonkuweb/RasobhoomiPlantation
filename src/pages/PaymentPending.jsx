import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import '../styles/PaymentStatus.css';

const PaymentPending = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const orderId = searchParams.get('orderId');
    const [checkingStatus, setCheckingStatus] = useState(false);

    useEffect(() => {
        if (!orderId) return undefined;

        let isActive = true;
        let intervalId;

        const checkOrderPaymentStatus = async () => {
            if (!isActive) return;
            setCheckingStatus(true);
            try {
                const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
                if (!res.ok) return;

                const order = await res.json();
                const paymentStatus = String(order?.payment_status || '').toLowerCase();

                if (!isActive) return;
                if (paymentStatus === 'paid') {
                    navigate(`/payment/success?orderId=${encodeURIComponent(orderId)}`, { replace: true });
                } else if (paymentStatus === 'failed') {
                    navigate(`/payment/failure?orderId=${encodeURIComponent(orderId)}`, { replace: true });
                }
            } catch (err) {
                console.error('Pending status check failed:', err);
            } finally {
                if (isActive) setCheckingStatus(false);
            }
        };

        checkOrderPaymentStatus();
        intervalId = setInterval(checkOrderPaymentStatus, 5000);

        return () => {
            isActive = false;
            if (intervalId) clearInterval(intervalId);
        };
    }, [orderId, navigate]);

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
                {checkingStatus && (
                    <p className="status-subtitle" style={{ fontSize: '0.9rem', marginTop: '0.4rem' }}>
                        Checking payment status...
                    </p>
                )}

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
