import React from 'react';
import SEO from '../components/SEO';
import { useLanguage } from '../context/LanguageContext';

const About = () => {
    const { t } = useLanguage();

    return (
        <main style={{ padding: '2rem 1.5rem', maxWidth: '800px', margin: '0 auto', lineHeight: '1.8', color: '#333' }}>
            <SEO
                title={t('nav_about') || 'About Us'}
                description="Learn about Rasobhoomi Plantation and our commitment to providing authentic plants."
            />
            <h1 className="text-red"
                style={{ textAlign: 'center', marginBottom: '1.5rem', fontFamily: 'Great Vibes, cursive', fontSize: '3.5rem' }}>
                {t('nav_about') || 'About Us'}
            </h1>

            {/* Circular Owner Image & Caption */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2.5rem' }}>
                <div style={{
                    width: '180px',
                    height: '180px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: '4px solid #2e7d32',
                    boxShadow: '0 8px 24px rgba(46, 125, 50, 0.2)',
                    background: '#f3f4f6'
                }}>
                    <img
                        src="https://pub-ce8688bc6c654bcfb99716f7c9373bcd.r2.dev/rasobhoomi/WhatsApp%20Image%202026-08-05%20at%205.25.59%20PM.jpeg"
                        alt="Subir Chanda - Founder of Rasobhoomi"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                </div>
                <h3 style={{
                    marginTop: '0.85rem',
                    fontWeight: '700',
                    fontSize: '1.1rem',
                    color: '#2C1B10',
                    textAlign: 'center',
                    letterSpacing: '0.3px'
                }}>
                    {t('about_founder_subtitle') || 'Subir Chanda - Founder of Rasobhoomi'}
                </h3>
            </div>

            <p style={{ marginBottom: '1.5rem', fontSize: '1.05rem' }}>
                {t('about_p1')}
            </p>

            <p style={{ marginBottom: '1.5rem', fontSize: '1.05rem' }}>
                {t('about_p2')}
            </p>

            <p style={{ marginBottom: '1.5rem', fontSize: '1.05rem' }}>
                {t('about_p3')}
            </p>

            <p style={{ marginBottom: '1.5rem', fontSize: '1.05rem' }}>
                {t('about_p4')}
            </p>

            <p style={{ textAlign: 'center', fontStyle: 'italic', fontWeight: 'bold', marginTop: '3rem', color: '#2C1B10', fontSize: '1.1rem' }}>
                {t('about_tagline') || 'Cultivating nature, delivering joy.'}
            </p>
        </main>
    );
};

export default About;
