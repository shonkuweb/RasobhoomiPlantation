import React from 'react';
import { Helmet } from 'react-helmet-async';

const Terms = () => {
    return (
        <div style={{ padding: '2rem 1.5rem', maxWidth: '800px', margin: '0 auto', lineHeight: '1.8', color: '#333' }}>
            <Helmet>
                <title>Terms & Conditions - Rasobhoomi Plantation</title>
                <meta name="description" content="Read Rasobhoomi Plantation's Terms & Conditions regarding plant purchases, replacements, and policies." />
            </Helmet>

            <h1 className="text-red"
                style={{ textAlign: 'center', marginBottom: '2rem', fontFamily: "'Great Vibes', cursive", fontSize: '3rem' }}>
                Terms & Conditions</h1>

            <p style={{ marginBottom: '1rem' }}>Welcome to Rasobhoomi. By purchasing plants or related products from
                Rasobhoomi, you agree to the following Terms & Conditions. These terms are designed to ensure
                transparency, clarity, and a smooth experience for both the customer and the nursery.</p>

            <p style={{ marginBottom: '1rem' }}>Rasobhoomi deals in live plants, which are natural products and subject to
                environmental, handling, and transit conditions. Once a plant is delivered to the customer, it is
                expected that the customer will take reasonable care of the plant, including proper watering, placement,
                and basic maintenance. Due to the nature of live plants, Rasobhoomi does not accept potting-related
                complaints within the first 15 days after delivery.</p>

            <p style={{ marginBottom: '1rem' }}>If a plant is damaged or dies within 15 days from the date of delivery,
                Rasobhoomi will provide a complete replacement by sending a new plant of the same type. However, in such
                replacement cases, the courier or delivery charges must be paid by the customer. Replacement is limited
                only to sending a new plant and does not include any monetary compensation.</p>

            <p style={{ marginBottom: '1rem' }}>The price paid for any plant is non-refundable under all circumstances. Cash
                refunds, bank refunds, or digital refunds are not permitted. If a customer is not satisfied with a plant
                for reasons covered under replacement eligibility, they may choose to receive another plant instead of
                the original one, subject to availability.</p>

            <p style={{ marginBottom: '1rem' }}>Plants purchased from Rasobhoomi cannot be returned to the nursery. The only
                exception to this rule is when a wrong plant is delivered to the customer. In such a case, only the
                incorrectly delivered plant will be eligible for return.</p>

            <p style={{ marginBottom: '1rem' }}>Shipping charges are ₹150 for all orders. Rasobhoomi offers multiple delivery
                options including courier service, railway service, bus service, and hand delivery. The customer is
                responsible for selecting their preferred delivery method during checkout.</p>

            <p style={{ marginBottom: '1rem' }}>For large drum plants or potted plants, customers are given the option to
                select plants through video call without visiting the nursery in person. This service is provided to
                assist customers in plant selection and does not alter any other policy terms.</p>

            <p style={{ marginBottom: '1rem' }}>By placing an order with Rasobhoomi, the customer confirms that they have
                read, understood, and agreed to these Terms & Conditions in full.</p>

            <section style={{ marginTop: '2rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                <h3>Contact Us</h3>
                <p><strong>Email:</strong> rasobhoomiplantation@gmail.com</p>
                <p><strong>Phone:</strong> +91 8972076182</p>
                <p><strong>Address:</strong> Baikara, NORTH 24 PARAGANAS, WEST BENGAL - 743245</p>
            </section>
        </div>
    );
};

export default Terms;
