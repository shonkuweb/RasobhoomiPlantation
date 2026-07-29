import React, { useState } from 'react';

const TrackOrder = () => {
    const [orderId, setOrderId] = useState('');
    const [orderData, setOrderData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleTrack = async () => {
        if (!orderId) {
            window.showToast('Please enter an Order ID', 'error');
            return;
        }

        setLoading(true);
        setError(null);
        setOrderData(null);

        try {
            const res = await fetch(`/api/orders/${orderId}`);
            if (!res.ok) {
                throw new Error('Order not found or Error fetching status');
            }
            const data = await res.json();
            setOrderData(data);
        } catch (err) {
            setError('Order Not Found. Please check the ID.');
            window.showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const getTimelineStatus = (currentStatus) => {
        // Simple helper to decide which steps are 'active'
        const steps = ['new', 'in-process', 'in-transit', 'completed'];
        const currentIndex = steps.indexOf(currentStatus);

        // Map display steps: Order Placed -> Processing -> Shipped -> Delivered
        // 'new' -> Order Placed (idx 0)
        // 'in-process' -> Processing (idx 1)
        // 'in-transit' -> Shipped (idx 2)
        // 'completed' -> Delivered (idx 3)

        return (stepIndex) => {
            if (currentIndex === -1) return false; // Unknown status
            return stepIndex <= currentIndex;
        };
    };

    return (
        <main style={{ padding: '0', paddingBottom: '2rem' }}>
            <div className="tracking-hero">
                <h1 className="tracking-title">TRACK YOUR ODER</h1>
                <p className="tracking-subtitle">Enter your Order ID to see the current status</p>

                <div className="search-container">
                    <input
                        type="text"
                        value={orderId}
                        onChange={(e) => setOrderId(e.target.value)}
                        className="tracking-input"
                        placeholder="ORD-XXXXXX"
                    />
                    <button onClick={handleTrack} className="tracking-btn" disabled={loading}>
                        {loading ? '...' : 'TRACK'}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'red' }}>
                    {error}
                </div>
            )}

            {orderData && (
                <div className="tracking-result-container" style={{ display: 'block' }}>
                    <div className="order-summary-card">
                        <div className="order-header-row">
                            <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                                ORDER <span id="display-order-id">#{orderData.id}</span>
                            </span>
                            <span className="status-pill">{orderData.status.toUpperCase()}</span>
                        </div>
                        <div className="order-info-row">
                            <span style={{ color: '#666', fontSize: '0.85rem' }}>
                                {new Date(orderData.created_at || Date.now()).toLocaleDateString()}
                            </span>
                            <span style={{ fontWeight: 'bold' }}>₹{orderData.total}</span>
                        </div>
                    </div>
                    {/* Tracking Section */}
                    {orderData.courier_name === 'amazon' && orderData.tracking_id ? (
                        <div style={{
                            background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
                            color: '#ffffff',
                            borderRadius: '16px',
                            padding: '1.25rem 1.5rem',
                            margin: '1.25rem 0',
                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.85rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{
                                        background: '#FF9900',
                                        color: '#111827',
                                        padding: '0.4rem 0.75rem',
                                        borderRadius: '8px',
                                        fontWeight: '800',
                                        fontSize: '0.85rem',
                                        letterSpacing: '0.5px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem'
                                    }}>
                                        📦 Amazon Delivery
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amazon Tracking Number</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f9fafb', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                                            {orderData.tracking_id}
                                        </div>
                                    </div>
                                </div>

                                <a
                                    href={`https://track.amazon.in/tracking/${encodeURIComponent(orderData.tracking_id)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        background: 'linear-gradient(135deg, #ff9900 0%, #ffb84d 100%)',
                                        color: '#111827',
                                        padding: '0.65rem 1.15rem',
                                        borderRadius: '10px',
                                        fontWeight: '800',
                                        fontSize: '0.85rem',
                                        textDecoration: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        boxShadow: '0 4px 12px rgba(255, 153, 0, 0.3)'
                                    }}
                                >
                                    <span>Track Live on Amazon</span>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                </a>
                            </div>

                            <div style={{ fontSize: '0.75rem', color: '#9ca3af', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.6rem' }}>
                                💡 Click the button above to view live courier tracking & real-time updates directly on Amazon's official portal.
                            </div>
                        </div>
                    ) : (orderData.courier_name === 'rail' || orderData.courier_name === 'bus') ? (
                        <div style={{
                            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                            color: '#ffffff',
                            borderRadius: '16px',
                            padding: '1.25rem 1.5rem',
                            margin: '1.25rem 0',
                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.85rem'
                        }}>
                            <div style={{
                                background: '#2563eb',
                                color: 'white',
                                padding: '0.45rem 0.85rem',
                                borderRadius: '8px',
                                fontWeight: '800',
                                fontSize: '0.85rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                            }}>
                                {orderData.courier_name === 'rail' ? '🚆 Rail / Train' : '🚌 BUS Service'}
                            </div>
                            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#f8fafc' }}>
                                Delivery will be done by Rasobhoomi in hand.
                            </div>
                        </div>
                    ) : orderData.tracking_id ? (
                        <div style={{
                            background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
                            color: '#ffffff',
                            borderRadius: '16px',
                            padding: '1.25rem 1.5rem',
                            margin: '1.25rem 0',
                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.85rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{
                                        background: '#dc2626',
                                        color: 'white',
                                        padding: '0.4rem 0.75rem',
                                        borderRadius: '8px',
                                        fontWeight: '800',
                                        fontSize: '0.85rem',
                                        letterSpacing: '1px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem'
                                    }}>
                                        🚚 DTDC
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shipment Tracking Number</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f9fafb', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                                            {orderData.tracking_id}
                                        </div>
                                    </div>
                                </div>

                                <a
                                    href={`https://www.dtdc.com/track-your-shipment/?awb=${encodeURIComponent(orderData.tracking_id)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                        color: '#ffffff',
                                        padding: '0.65rem 1.15rem',
                                        borderRadius: '10px',
                                        fontWeight: '700',
                                        fontSize: '0.85rem',
                                        textDecoration: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                                    }}
                                >
                                    <span>Track Live on DTDC</span>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                </a>
                            </div>

                            <div style={{ fontSize: '0.75rem', color: '#9ca3af', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.6rem' }}>
                                💡 Click the button above to view live courier tracking & real-time updates directly on DTDC's official portal.
                            </div>
                        </div>
                    ) : null}

                    <div className="timeline-wrapper">
                        {/* Step 1 */}
                        <div className={`timeline-step ${getTimelineStatus(orderData.status)(0) ? 'active' : ''}`}>
                            <div className="timeline-icon">📝</div>
                            <div className="timeline-content">
                                <h3>Order Placed</h3>
                                <p>We have received your order.</p>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className={`timeline-step ${getTimelineStatus(orderData.status)(1) ? 'active' : ''}`}>
                            <div className="timeline-icon">⚙️</div>
                            <div className="timeline-content">
                                <h3>Processing</h3>
                                <p>We are preparing your order.</p>
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className={`timeline-step ${getTimelineStatus(orderData.status)(2) ? 'active' : ''}`}>
                            <div className="timeline-icon">🚚</div>
                            <div className="timeline-content">
                                <h3>Shipped</h3>
                                <p>Your order is on the way.</p>
                            </div>
                        </div>

                        {/* Step 4 */}
                        <div className={`timeline-step ${getTimelineStatus(orderData.status)(3) ? 'active' : ''}`}>
                            <div className="timeline-icon">🏠</div>
                            <div className="timeline-content">
                                <h3>Delivered</h3>
                                <p>Order has been delivered.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
};

export default TrackOrder;
