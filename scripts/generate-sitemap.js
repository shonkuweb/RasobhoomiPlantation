
import fs from 'fs';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../public');
const SITEMAP_PATH = path.join(PUBLIC_DIR, 'sitemap.xml');
const BASE_URL = 'https://maahandloom.com'; // Replace with actual domain
const API_URL = 'http://localhost:3000/api'; // Local API

async function generateSitemap() {
    console.log('Generating sitemap...');

    try {
        const [productsRes, categoriesRes] = await Promise.all([
            axios.get(`${API_URL}/products`),
            axios.get(`${API_URL}/categories`)
        ]);

        const products = productsRes.data;
        const categories = categoriesRes.data;

        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <!-- Static Pages -->
    <url>
        <loc>${BASE_URL}/</loc>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>${BASE_URL}/about</loc>
        <changefreq>monthly</changefreq>
        <priority>0.5</priority>
    </url>
    <url>
        <loc>${BASE_URL}/contact</loc>
        <changefreq>monthly</changefreq>
        <priority>0.5</priority>
    </url>
    <url>
        <loc>${BASE_URL}/categories</loc>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>
`;

        // Categories
        categories.forEach(cat => {
            sitemap += `    <url>
        <loc>${BASE_URL}/category/${cat.slug}</loc>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>
`;
        });

        // Products
        products.forEach(product => {
            sitemap += `    <url>
        <loc>${BASE_URL}/product/${product.id}</loc>
        <changefreq>weekly</changefreq>
        <priority>0.9</priority>
    </url>
`;
        });

        sitemap += `</urlset>`;

        fs.writeFileSync(SITEMAP_PATH, sitemap);
        console.log(`Sitemap generated at ${SITEMAP_PATH}`);

    } catch (error) {
        console.error('Error generating sitemap:', error.message);
    }
}

generateSitemap();
