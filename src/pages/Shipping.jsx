import React from 'react';
import { Helmet } from 'react-helmet-async';

const Shipping = () => {
    return (
        <div style={{ padding: '2rem 1.5rem', maxWidth: '800px', margin: '0 auto', lineHeight: '1.8', color: '#333' }}>
            <Helmet>
                <title>Shipping Policy - Rasobhoomi Plantation</title>
                <meta name="description" content="Shipping details, charges, and delivery methods for Rasobhoomi Plantation." />
            </Helmet>

            <h1 className="text-red"
                style={{ textAlign: 'center', marginBottom: '2rem', fontFamily: "'Great Vibes', cursive", fontSize: '3rem' }}>
                Shipping Policy</h1>

            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1.5rem', marginBottom: '2rem', color: '#2d5a27' }}>
                Rasobhoomi</div>

            <section style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#2d5a27', borderBottom: '1px solid #c1ff72', paddingBottom: '0.5rem' }}>1. Shipping Charges
                </h3>
                <p>Rasobhoomi charges a flat delivery fee of <strong>₹150</strong> on all orders. This fee is added to the
                    total amount during checkout.</p>
            </section>

            <section style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#2d5a27', borderBottom: '1px solid #c1ff72', paddingBottom: '0.5rem' }}>2. Available Delivery
                    Methods</h3>
                <p>Customers can choose from the following delivery options:</p>
                <ul style={{ listStyleType: 'none', paddingLeft: '0' }}>
                    <li style={{ padding: '0.5rem 0', borderBottom: '1px dashed #eee' }}>• Courier Service</li>
                    <li style={{ padding: '0.5rem 0', borderBottom: '1px dashed #eee' }}>• Railway Service</li>
                    <li style={{ padding: '0.5rem 0', borderBottom: '1px dashed #eee' }}>• Bus Service</li>
                    <li style={{ padding: '0.5rem 0', borderBottom: '1px dashed #eee' }}>• Hand Delivery</li>
                </ul>
                <p style={{ marginTop: '1rem' }}>The customer has full freedom to select the delivery method according to their
                    convenience, urgency, and location.</p>
            </section>

            <section style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#2d5a27', borderBottom: '1px solid #c1ff72', paddingBottom: '0.5rem' }}>3. Shipping Charges
                </h3>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem' }}>
                    <li>Shipping charges depend on the selected delivery method and destination.</li>
                    <li>All shipping charges are the responsibility of the customer, unless otherwise clearly stated.</li>
                    <li>The total shipping cost will be communicated before dispatch.</li>
                </ul>
            </section>

            <section style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#2d5a27', borderBottom: '1px solid #c1ff72', paddingBottom: '0.5rem' }}>4. Plant Replacement
                    Shipping</h3>
                <p>If a plant requires replacement due to damage or plant death within 15 days (as per Rasobhoomi’s plant
                    policy):</p>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem' }}>
                    <li>The replacement plant will be dispatched only after the customer pays the applicable shipping
                        charges.</li>
                    <li>Shipping costs for replacement plants are also borne by the customer.</li>
                </ul>
            </section>

            <section style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#2d5a27', borderBottom: '1px solid #c1ff72', paddingBottom: '0.5rem' }}>5. Packaging & Transit
                    Responsibility</h3>
                <p>Rasobhoomi ensures that plants are packed carefully and securely before dispatch to minimize transit
                    risk. However:</p>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem' }}>
                    <li>Delays caused by third-party transport providers are beyond Rasobhoomi’s control.</li>
                    <li>Damage occurring during transit by courier, railway, bus, or other delivery services is not directly
                        controlled by Rasobhoomi.</li>
                </ul>
            </section>

            <section style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#2d5a27', borderBottom: '1px solid #c1ff72', paddingBottom: '0.5rem' }}>6. Customer
                    Responsibility</h3>
                <p>Customers are advised to choose a delivery method that best suits their:</p>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                    <li>Location</li>
                    <li>Urgency</li>
                    <li>Handling safety</li>
                </ul>
                <p>By selecting a delivery option, the customer agrees to:</p>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem' }}>
                    <li>Bear the associated shipping costs</li>
                    <li>Accept transit-related risks linked to the chosen delivery method</li>
                </ul>
            </section>

            <section style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#2d5a27', borderBottom: '1px solid #c1ff72', paddingBottom: '0.5rem' }}>7. Agreement</h3>
                <p>By placing an order and selecting a delivery method, the customer acknowledges and agrees to this
                    Shipping Policy.</p>
            </section>
        </div>
    );
};

export default Shipping;
