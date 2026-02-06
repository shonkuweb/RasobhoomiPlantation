import React from 'react';

const About = () => {
    return (
        <main style={{ padding: '2rem 1.5rem', maxWidth: '800px', margin: '0 auto', lineHeight: '1.8', color: '#333' }}>
            <h1 className="text-red"
                style={{ textAlign: 'center', marginBottom: '2rem', fontFamily: 'Great Vibes, cursive', fontSize: '3.5rem' }}>
                About Us
            </h1>

            <p style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>
                At <strong>Rasobhoomi</strong>, we believe in the magic of nature and the peace it brings to our lives.
                Rooted in a passion for greenery, our mission is to bring the finest collection of fruit plants, exotic trees,
                and gardening essentials directly to your doorstep.
            </p>

            <p style={{ marginBottom: '1.5rem' }}>
                Each plant in our nursery is nurtured with care and expertise. From the sweetest <strong>Indian Mangoes</strong> to
                rare <strong>Foreigner varieties</strong>, every sapling reflects our commitment to quality and growth.
                We ensure that what you receive is healthy, vibrant, and ready to thrive in your garden.
            </p>

            <p style={{ marginBottom: '1.5rem' }}>
                We work closely with expert horticulturists to maintain a diverse and sustainable collection.
                By choosing Rasobhoomi, you are not just buying a plant — you are inviting nature into your home,
                supporting a greener planet, and cultivating a legacy of growth.
            </p>

            <p style={{ marginBottom: '1.5rem' }}>
                Whether you are a seasoned gardener or just starting your green journey, <strong>Rasobhoomi</strong> is here to grow with you.
                Our plants are more than just products; they are living companions that bring joy and fresh air to your life.
            </p>

            <p style={{ textAlign: 'center', fontStyle: 'italic', fontWeight: 'bold', marginTop: '3rem', color: '#2C1B10' }}>
                Cultivating nature, delivering joy.
            </p>
        </main>
    );
};

export default About;
