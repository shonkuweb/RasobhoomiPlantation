import db from './database.js';

const sampleProducts = [
    {
        id: 'P1',
        name: 'Mango Plant (Amrapali)',
        description: 'Healthy grafted Amrapali mango plant, known for sweet fruit.',
        price: 350,
        category: 'Indian Mangoes',
        qty: 50,
        image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?q=80&w=1974&auto=format&fit=crop',
        images: JSON.stringify(['https://images.unsplash.com/photo-1553279768-865429fa0078?q=80&w=1974&auto=format&fit=crop'])
    },
    {
        id: 'P2',
        name: 'Red Guava Plant',
        description: 'High-yield red guava plant, perfect for home gardens.',
        price: 200,
        category: 'Guava',
        qty: 40,
        image: 'https://images.unsplash.com/photo-1536510233921-8e5043fce771?q=80&w=2071&auto=format&fit=crop',
        images: JSON.stringify(['https://images.unsplash.com/photo-1536510233921-8e5043fce771?q=80&w=2071&auto=format&fit=crop'])
    },
    {
        id: 'P3',
        name: 'Kolkata Pati Lemon',
        description: 'Authentic Kolkata Pati Lemon plant, famous for its scent.',
        price: 150,
        category: 'Lemon',
        qty: 60,
        image: 'https://images.unsplash.com/photo-1595123550441-d377e017de6a?q=80&w=2071&auto=format&fit=crop',
        images: JSON.stringify(['https://images.unsplash.com/photo-1595123550441-d377e017de6a?q=80&w=2071&auto=format&fit=crop'])
    },
    {
        id: 'P4',
        name: 'Thai Pink Jackfruit',
        description: 'Exotic Thai Pink Jackfruit sapling.',
        price: 450,
        category: 'Jackfruit',
        qty: 25,
        image: 'https://images.unsplash.com/photo-1563746098251-d36a7cf789a6?q=80&w=2070&auto=format&fit=crop',
        images: JSON.stringify(['https://images.unsplash.com/photo-1563746098251-d36a7cf789a6?q=80&w=2070&auto=format&fit=crop'])
    }
];

db.serialize(() => {
    const stmt = db.prepare("INSERT INTO products (id, name, description, price, category, qty, image, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    sampleProducts.forEach(p => {
        stmt.run(p.id, p.name, p.description, p.price, p.category, p.qty, p.image, p.images);
    });
    stmt.finalize();
    console.log('Sample products inserted.');
});
