import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                admin: resolve(__dirname, 'pages/admin.html'),
                about: resolve(__dirname, 'pages/about.html'),
                categories: resolve(__dirname, 'pages/categories.html'),
                contact: resolve(__dirname, 'pages/contact.html'),
                refund: resolve(__dirname, 'pages/refund.html'),
                trackOrder: resolve(__dirname, 'pages/track-order.html'),
                productDetails: resolve(__dirname, 'pages/product_details.html'),
                category: resolve(__dirname, 'pages/category.html'),
                checkout: resolve(__dirname, 'pages/checkout.html'),
                cottonVarieties: resolve(__dirname, 'pages/cotton-varieties.html'),
                // handloomSpecial: resolve(__dirname, 'pages/handloom-special.html'),
                // shantipuriSpecial: resolve(__dirname, 'pages/shantipuri-special.html'),
                // suratSilk: resolve(__dirname, 'pages/surat-silk.html'),
            },
        },
    },
    server: {
        port: 8080,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
            },
            '/admin': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
            },
            '/admin-login': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
            },
            '/main.js': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
            },
            '/admin.js': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
            },
            '/style.css': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
            },
        },
    },
});
