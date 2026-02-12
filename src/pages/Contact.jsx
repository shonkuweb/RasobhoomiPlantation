import React, { useState } from 'react';
import SEO from '../components/SEO';

const Contact = () => {
    const [status, setStatus] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        // In a real app, send to backend. For demo, just show success.
        setStatus('success');
        e.target.reset();
        window.showToast('Message Sent Successfully!', 'success');

        setTimeout(() => setStatus(''), 3000);
    };

    return (
        <main style={{ padding: '2rem 1.5rem', maxWidth: '600px', margin: '0 auto' }}>
            <SEO
                title="Contact Us - Rasobhoomi Plantation"
                description="Get in touch with Rasobhoomi Plantation. We'd love to hear from you."
                schema={{
                    "name": "Rasobhoomi Plantation",
                    "description": "Authentic plants and nursery.",
                    "url": window.location.origin
                }}
            />
            <h1 className="text-red"
                style={{ textAlign: 'center', marginBottom: '0.5rem', fontFamily: 'Great Vibes, cursive', fontSize: '3rem' }}>
                Contact Us
            </h1>
            <p style={{ textAlign: 'center', marginBottom: '2rem', color: '#666' }}>
                We'd love to hear from you. Send us a message!
            </p>

            <form onSubmit={handleSubmit} className="contact-form-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="input-group">
                    <input type="text" className="modern-input" placeholder="Your Name" required />
                </div>
                <div className="input-group">
                    <input type="email" className="modern-input" placeholder="Your Email" required />
                </div>
                <div className="input-group">
                    <input type="tel" className="modern-input" placeholder="Your Phone (Optional)" />
                </div>
                <div className="input-group">
                    <textarea className="modern-input" placeholder="Your Message" rows="5"
                        style={{ resize: 'none' }} required></textarea>
                </div>

                <button type="submit" className="btn-save-modern" style={{ marginTop: '1rem' }}>
                    {status === 'success' ? 'SENT!' : 'SEND MESSAGE'}
                </button>
            </form>
        </main>
    );
};

export default Contact;
