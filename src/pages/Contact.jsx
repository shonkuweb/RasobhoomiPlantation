import React, { useState } from 'react';
import SEO from '../components/SEO';

const Contact = () => {
    const [status, setStatus] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();

        // Get form values
        const name = e.target[0].value;
        const email = e.target[1].value;
        const phone = e.target[2].value;
        const message = e.target[3].value;

        // Validations could be added here

        // Format the message for WhatsApp
        const whatsappMessage = `*New Contact Request*\n\n*Name:* ${name}\n*Email:* ${email}\n*Phone:* ${phone}\n*Message:* ${message}`;

        // WhatsApp API URL
        const phoneNumber = "918972076182";
        const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(whatsappMessage)}`;

        // Open WhatsApp in new tab
        window.open(whatsappUrl, '_blank');

        setStatus('success');
        e.target.reset();

        // Reset success message after 3 seconds
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
