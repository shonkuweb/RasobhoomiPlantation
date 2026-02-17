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
        <main style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '4rem' }}>
            <SEO
                title="Contact Us - Rasobhoomi Plantation"
                description="Get in touch with Rasobhoomi Plantation. We'd love to hear from you."
                schema={{
                    "name": "Rasobhoomi Plantation",
                    "description": "Authentic plants and nursery.",
                    "url": window.location.origin
                }}
            />

            {/* Hero Section */}
            <section className="hero-section" style={{
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-text-on-primary)',
                padding: '4rem 1.5rem',
                textAlign: 'center',
                borderRadius: '0 0 2rem 2rem',
                marginBottom: '3rem'
            }}>
                <h1 style={{ fontFamily: '"Great Vibes", cursive', fontSize: '4rem', marginBottom: '0.5rem' }}>Get in Touch</h1>
                <p style={{ fontSize: '1.2rem', opacity: '0.9', maxWidth: '600px', margin: '0 auto' }}>
                    Have questions about our plants? We're here to help you grow your green sanctuary.
                </p>
            </section>

            <div className="contact-container" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '3rem',
                padding: '0 1.5rem'
            }}>
                {/* Contact Information */}
                <div className="contact-info" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div>
                        <h2 style={{ color: 'var(--color-primary)', marginBottom: '1rem', fontSize: '2rem' }}>Contact Info</h2>
                        <p style={{ color: '#666', lineHeight: '1.6' }}>
                            We are always happy to assist you. Reach out to us via phone, email, or visit our nursery.
                        </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="info-item" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{
                                width: '50px', height: '50px', backgroundColor: '#e8f5e9', borderRadius: '50%',
                                display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--color-primary)'
                            }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>Phone</h3>
                                <p style={{ color: '#666' }}>+91 8972076182</p>
                            </div>
                        </div>

                        <div className="info-item" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{
                                width: '50px', height: '50px', backgroundColor: '#e8f5e9', borderRadius: '50%',
                                display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--color-primary)'
                            }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>Email</h3>
                                <p style={{ color: '#666' }}>rasobhoomiplantation@gmail.com</p>
                            </div>
                        </div>

                        <div className="info-item" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{
                                width: '50px', height: '50px', backgroundColor: '#e8f5e9', borderRadius: '50%',
                                display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--color-primary)'
                            }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>Location</h3>
                                <p style={{ color: '#666' }}>Baikara, NORTH 24 PARAGANAS,<br />WEST BENGAL - 743245</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Contact Form */}
                <div className="form-container" style={{
                    backgroundColor: 'white',
                    padding: '2.5rem',
                    borderRadius: '16px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                    border: '1px solid #f0f0f0'
                }}>
                    <h3 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', color: 'var(--color-black)' }}>Send us a Message</h3>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div className="input-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>Full Name</label>
                            <input type="text" className="modern-input" placeholder="e.g. John Doe" required
                                style={{
                                    width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e0e0e0',
                                    fontSize: '1rem', transition: 'border-color 0.2s'
                                }} />
                        </div>
                        <div className="input-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>Email Address</label>
                            <input type="email" className="modern-input" placeholder="e.g. john@example.com" required
                                style={{
                                    width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e0e0e0',
                                    fontSize: '1rem', transition: 'border-color 0.2s'
                                }} />
                        </div>
                        <div className="input-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>Phone Number</label>
                            <input type="tel" className="modern-input" placeholder="e.g. +91 98765 43210"
                                style={{
                                    width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e0e0e0',
                                    fontSize: '1rem', transition: 'border-color 0.2s'
                                }} />
                        </div>
                        <div className="input-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>Your Message</label>
                            <textarea className="modern-input" placeholder="How can we help you?" rows="4"
                                style={{
                                    width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e0e0e0',
                                    fontSize: '1rem', transition: 'border-color 0.2s', resize: 'none'
                                }} required></textarea>
                        </div>

                        <button type="submit" className="btn-primary" style={{
                            marginTop: '1rem', padding: '14px', fontSize: '1rem', fontWeight: '600',
                            textAlign: 'center', borderRadius: '8px', cursor: 'pointer', transition: 'background-color 0.2s'
                        }}>
                            {status === 'success' ? 'Message Sent!' : 'Send Message'}
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
};

export default Contact;
