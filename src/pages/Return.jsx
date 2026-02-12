import React from 'react';
import { Helmet } from 'react-helmet-async';

const Return = () => {
    return (
        <div style={{ padding: '2rem 1.5rem', maxWidth: '800px', margin: '0 auto', lineHeight: '1.8', color: '#333' }}>
            <Helmet>
                <title>Return Policy - Rasobhoomi Plantation</title>
                <meta name="description" content="Rasobhoomi Plantation's 7-day return policy for live plants." />
            </Helmet>

            <h1 className="text-red"
                style={{ textAlign: 'center', marginBottom: '2rem', fontFamily: "'Great Vibes', cursive", fontSize: '3rem' }}>
                Return Policy</h1>

            <p style={{ marginBottom: '1rem', fontWeight: 'bold', fontSize: '1.2rem', color: '#2d5a27' }}>WE HAVE 7 DAYS RETURN
                POLICY</p>

            <p style={{ marginBottom: '1rem' }}>Rasobhoomi maintains a 7-day return policy for specific cases. While plants are
                living organisms, we understand that issues may arise. If you have any concerns about your delivery, please
                report it within 7 days of receiving the order.</p>

            <p style={{ marginBottom: '1rem' }}>Customers are requested to inspect their order at the time of delivery. If
                the delivered plant matches the order placed and is in healthy condition, no return will be accepted. This
                includes cases where the customer no longer wants the plant or changes their mind after 7 days.</p>

            <p style={{ marginBottom: '1rem' }}>The only major exception to this policy is when a wrong plant is delivered or if
                the plant is severely damaged during transit. In such cases, Rasobhoomi will accept the return and process a
                replacement within our 7-day window.</p>

            <p style={{ marginBottom: '1rem' }}>By placing an order, the customer agrees to this 7-day return policy and
                acknowledges that returns are allowed only for valid reasons reported within the specified timeframe.</p>
        </div>
    );
};

export default Return;
