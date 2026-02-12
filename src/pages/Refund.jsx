import React from 'react';

const Refund = () => {
    return (
        <main style={{ padding: '2rem 1.5rem', maxWidth: '800px', margin: '0 auto' }}>
            <h1 className="text-red"
                style={{ textAlign: 'center', marginBottom: '2rem', fontFamily: 'Great Vibes, cursive', fontSize: '3rem' }}>
                Refund & Return Policy
            </h1>

            <div className="policy-content" style={{ fontFamily: 'Inter, sans-serif', lineHeight: '1.6', color: '#2C1B10' }}>
                <p style={{ marginBottom: '1.5rem', fontStyle: 'italic' }}>At Rasobhoomi Plantation, every plant is carefully
                    nurtured by expert horticulturists. Due to the nature of live plants, slight variations
                    in size, color, and growth are natural and expected. These are not considered defects.
                </p>

                <h3 style={{ fontWeight: '700', marginTop: '2rem', marginBottom: '0.5rem' }}>1. Eligibility for Returns</h3>
                <p>We accept returns only under the following conditions:</p>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                    <li>The product received is damaged, defective, or incorrect</li>
                    <li>The issue is reported within 48 hours of delivery</li>
                    <li>The product is unused, unwashed, and returned in its original condition with tags and packaging intact</li>
                </ul>
                <p>To initiate a return, please contact us at <strong>rasobhoomiplantation@gmail.com / +91 8972076182</strong> with:</p>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                    <li>Order ID</li>
                    <li>Clear photos or videos showing the issue</li>
                </ul>

                <h3 style={{ fontWeight: '700', marginTop: '2rem', marginBottom: '0.5rem' }}>2. Non-Returnable Items</h3>
                <p>The following items are not eligible for return or refund:</p>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                    <li>Products purchased during sales, discounts, or clearance offers</li>
                    <li>Customized or made-to-order items</li>
                    <li>Products damaged due to improper use, washing, or storage</li>
                    <li>Minor variations in growth or leaf pattern inherent to live plants</li>
                </ul>

                <h3 style={{ fontWeight: '700', marginTop: '2rem', marginBottom: '0.5rem' }}>3. Refund Policy</h3>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                    <li>Once the returned item is received and inspected, we will notify you of the approval or rejection of your refund</li>
                    <li>Approved refunds will be processed within 7–10 business days</li>
                    <li>Refunds will be issued to the original payment method only</li>
                    <li>Shipping charges are non-refundable, unless the return is due to our error</li>
                </ul>

                <h3 style={{ fontWeight: '700', marginTop: '2rem', marginBottom: '0.5rem' }}>4. Exchange Policy</h3>
                <p style={{ marginBottom: '1rem' }}>We offer exchanges only for damaged or incorrect products, subject to stock
                    availability. If the requested replacement is unavailable, a refund will be issued instead.</p>

                <h3 style={{ fontWeight: '700', marginTop: '2rem', marginBottom: '0.5rem' }}>5. Return Shipping</h3>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                    <li>If the return is approved due to a defect or error on our part, we will arrange the return shipping</li>
                    <li>In other approved cases, return shipping costs must be borne by the customer</li>
                </ul>

                <h3 style={{ fontWeight: '700', marginTop: '2rem', marginBottom: '0.5rem' }}>6. Cancellations</h3>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                    <li>Orders can be canceled within 12 hours of placing the order</li>
                    <li>Once an order is processed or shipped, it cannot be canceled</li>
                </ul>

                <h3 style={{ fontWeight: '700', marginTop: '2rem', marginBottom: '0.5rem' }}>7. Important Note</h3>
                <p style={{ marginBottom: '1.5rem' }}>Live plants are delicate and seasonal in nature. We encourage
                    customers to read product care instructions carefully and review images before purchasing.</p>

                <p style={{ fontWeight: 'bold', borderTop: '1px solid #eee', paddingTop: '1rem', marginTop: '1rem' }}>
                    ALL THE APPROVED EXCHANGE AND REPLACEMENT WILL BE COMPLETED WITHIN 7 BUSINESS DAYS, REFUNDS WILL BE CREDITED BACK TO THE ORIGINAL PAYMENT METHOD IN 7 BUSINESS DAYS.
                </p>
            </div>
        </main>
    );
};

export default Refund;
