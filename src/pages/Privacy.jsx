import React from 'react';
import { Helmet } from 'react-helmet-async';

const Privacy = () => {
    return (
        <div style={{ padding: '2rem 1.5rem', maxWidth: '800px', margin: '0 auto', lineHeight: '1.8', color: '#333' }}>
            <Helmet>
                <title>Privacy Policy - Rasobhoomi Plantation</title>
                <meta name="description" content="Privacy Policy for Rasobhoomi Plantation." />
            </Helmet>

            <h1 className="text-red"
                style={{ textAlign: 'center', marginBottom: '2rem', fontFamily: "'Great Vibes', cursive", fontSize: '3rem' }}>
                Privacy Policy</h1>

            <p style={{ marginBottom: '1rem' }}>Rasobhoomi respects customer privacy and uses customer information solely for business-related purposes
                such as order processing, delivery coordination, and customer communication.</p>

            <p style={{ marginBottom: '1rem' }}>Personal details such as name, phone number, and delivery address are collected only to ensure successful
                order fulfillment. This information is not used for any purpose unrelated to the customer’s order.</p>

            <p style={{ marginBottom: '1rem' }}>Customer details shared with courier, railway, bus, or hand delivery services are limited strictly to
                what is necessary for delivery. Rasobhoomi does not misuse customer data.</p>

            <p style={{ marginBottom: '1rem' }}>For large drum plants or potted plants, video call selection may be offered. Video calls are used only to
                assist customers in selecting plants and are not recorded, stored, or shared.</p>

            <p style={{ marginBottom: '1rem' }}>Rasobhoomi does not sell or intentionally share customer data with third parties beyond delivery
                requirements.</p>

            <p style={{ marginBottom: '1rem' }}>By placing an order, the customer consents to the collection and use of their information as described in
                this policy.</p>
        </div>
    );
};

export default Privacy;
