import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { translateProduct, translateCategoryName } from '../src/utils/translations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontDir = path.join(__dirname, 'fonts');
const hindRegular = path.join(fontDir, 'Hind-Regular.ttf');
const hindBold = path.join(fontDir, 'Hind-Bold.ttf');
const hindSiliguriRegular = path.join(fontDir, 'HindSiliguri-Regular.ttf');
const hindSiliguriBold = path.join(fontDir, 'HindSiliguri-Bold.ttf');

const catalogTranslations = {
    en: {
        title: 'RASOBHOOMI PLANTATION',
        subtitle: 'Product Catalog & Official Price List',
        dateLabel: 'Date:',
        totalProductsLabel: 'Total Products:',
        categoryPrefix: 'CATEGORY:',
        itemsCount: (count) => `(${count} item${count === 1 ? '' : 's'})`,
        tableHeaders: {
            name: 'Product Name',
            price: 'Current Price',
            discount: 'Discount %',
            marketPrice: 'Market Price'
        },
        footerText: 'Rasobhoomi Plantation • Quality Plants & Nursery Services',
        pageLabel: (page, total) => `Page ${page} of ${total}`
    },
    bn: {
        title: 'রসোভূমি প্ল্যান্টেশন',
        subtitle: 'প্রোডাক্ট ক্যাটালগ ও অফিসিয়াল মূল্য তালিকা',
        dateLabel: 'তারিখ:',
        totalProductsLabel: 'মোট পণ্য:',
        categoryPrefix: 'ক্যাটাগরি:',
        itemsCount: (count) => `(${count} টি পণ্য)`,
        tableHeaders: {
            name: 'পণ্যের নাম',
            price: 'বর্তমান মূল্য',
            discount: 'ছাড় %',
            marketPrice: 'বাজার মূল্য'
        },
        footerText: 'রসোভূমি প্ল্যান্টেশন • উন্নতমানের চারা গাছ ও নার্সারি সেবা',
        pageLabel: (page, total) => `পৃষ্ঠা ${page} এর ${total}`
    },
    hi: {
        title: 'रसोभूमि प्लांटेशन',
        subtitle: 'उत्पाद सूची एवं आधिकारिक मूल्य तालिका',
        dateLabel: 'दिनांक:',
        totalProductsLabel: 'कुल उत्पाद:',
        categoryPrefix: 'श्रेणी:',
        itemsCount: (count) => `(${count} उत्पाद)`,
        tableHeaders: {
            name: 'उत्पाद का नाम',
            price: 'वर्तमान मूल्य',
            discount: 'छूट %',
            marketPrice: 'बाजार मूल्य'
        },
        footerText: 'रसोभूमि प्लांटेशन • गुणवत्तापूर्ण पौधे एवं नर्सरी सेवाएं',
        pageLabel: (page, total) => `पृष्ठ ${page} का ${total}`
    }
};

/**
 * Generate Product Catalog PDF Buffer
 * @param {Array} rawProducts List of raw product objects
 * @param {String} lang Language code ('en', 'bn', 'hi')
 * @returns {Promise<Buffer>}
 */
export function generateCatalogPdf(rawProducts, lang = 'bn') {
    const selectedLang = ['en', 'bn', 'hi'].includes(lang) ? lang : 'bn';
    const t = catalogTranslations[selectedLang];

    return new Promise((resolve, reject) => {
        try {
            // Step 1: Filter out duplicate product IDs from raw input
            const seenIds = new Set();
            const uniqueRaw = (rawProducts || []).filter(p => {
                const id = p && (p.id || p.product_id);
                if (!id) return true;
                const idStr = String(id).trim();
                if (seenIds.has(idStr)) return false;
                seenIds.add(idStr);
                return true;
            });

            // Step 2: Translate products for target language
            const translatedList = uniqueRaw.map(p => translateProduct(p, selectedLang));

            // Step 3: Deduplicate by Name + Category + Price so PDF table has no redundant duplicate rows
            const seenKeys = new Set();
            const productList = [];
            translatedList.forEach(p => {
                const nameStr = (p.name || '').trim().toLowerCase();
                const catStr = (p.category || '').trim().toLowerCase();
                const priceStr = String(p.price || 0);
                const key = `${nameStr}___${catStr}___${priceStr}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    productList.push(p);
                }
            });

            const doc = new PDFDocument({
                margin: 36,
                size: 'A4',
                bufferPages: true
            });

            const buffers = [];
            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            // Register TTF Fonts for Bengali & Hindi
            let devanagariAvailable = false;
            let bengaliAvailable = false;

            if (fs.existsSync(hindRegular) && fs.existsSync(hindBold)) {
                doc.registerFont('Hind', hindRegular);
                doc.registerFont('Hind-Bold', hindBold);
                devanagariAvailable = true;
            }

            if (fs.existsSync(hindSiliguriRegular) && fs.existsSync(hindSiliguriBold)) {
                doc.registerFont('HindSiliguri', hindSiliguriRegular);
                doc.registerFont('HindSiliguri-Bold', hindSiliguriBold);
                bengaliAvailable = true;
            }

            let FONT_REGULAR = 'Helvetica';
            let FONT_BOLD = 'Helvetica-Bold';

            if (selectedLang === 'hi' && devanagariAvailable) {
                FONT_REGULAR = 'Hind';
                FONT_BOLD = 'Hind-Bold';
            } else if (selectedLang === 'bn' && bengaliAvailable) {
                FONT_REGULAR = 'HindSiliguri';
                FONT_BOLD = 'HindSiliguri-Bold';
            }

            const PRIMARY_COLOR = '#166534';
            const PRIMARY_LIGHT_BG = '#F0FDF4';
            const PRIMARY_BORDER = '#BBF7D0';
            const TEXT_DARK = '#1E293B';
            const TEXT_MUTED = '#64748B';
            const ROW_ALT_BG = '#F8FAFC';

            const pageWidth = 595.28;
            const pageHeight = 841.89;
            const margin = 36;
            const contentWidth = pageWidth - (margin * 2);

            // Group products by category
            const categoryMap = {};
            productList.forEach(p => {
                let cat = p.category ? String(p.category).trim() : 'General';
                cat = translateCategoryName(cat, selectedLang);
                if (!categoryMap[cat]) categoryMap[cat] = [];
                categoryMap[cat].push(p);
            });

            // Sort categories (Mangoes first, then alphabetical)
            const categoryNames = Object.keys(categoryMap).sort((a, b) => {
                const aLower = a.toLowerCase();
                const bLower = b.toLowerCase();
                if ((aLower.includes('mango') || aLower.includes('আম')) && !(bLower.includes('mango') || bLower.includes('আম'))) return -1;
                if (!(aLower.includes('mango') || aLower.includes('আম')) && (bLower.includes('mango') || bLower.includes('আম'))) return 1;
                return a.localeCompare(b);
            });

            let currentY = margin;

            // Draw Header Banner on Page 1
            doc.rect(margin, currentY, contentWidth, 54).fill(PRIMARY_COLOR);

            doc.fillColor('#FFFFFF')
               .font(FONT_BOLD)
               .fontSize(16)
               .text(t.title, margin + 14, currentY + 10);

            doc.font(FONT_REGULAR)
               .fontSize(9.5)
               .text(t.subtitle, margin + 14, currentY + 32);

            const dateStr = new Date().toLocaleDateString(selectedLang === 'bn' ? 'bn-IN' : selectedLang === 'hi' ? 'hi-IN' : 'en-IN', {
                day: '2-digit', month: 'short', year: 'numeric'
            });

            doc.fontSize(8.5)
               .text(`${t.dateLabel} ${dateStr}`, margin, currentY + 12, { align: 'right', width: contentWidth - 14 })
               .text(`${t.totalProductsLabel} ${productList.length}`, margin, currentY + 28, { align: 'right', width: contentWidth - 14 });

            currentY += 66;

            // Iterate over categories
            categoryNames.forEach(catName => {
                const catProducts = categoryMap[catName];
                if (!catProducts || catProducts.length === 0) return;

                // Check remaining vertical space before starting new category section
                if (currentY + 60 > pageHeight - 50) {
                    doc.addPage();
                    currentY = margin;
                }

                // Category Header Box
                doc.roundedRect(margin, currentY, contentWidth, 22, 3)
                   .fillAndStroke(PRIMARY_LIGHT_BG, PRIMARY_BORDER);

                doc.fillColor(PRIMARY_COLOR)
                   .font(FONT_BOLD)
                   .fontSize(10.5)
                   .text(`${t.categoryPrefix} ${catName.toUpperCase()}`, margin + 10, currentY + 6);

                doc.fillColor(TEXT_MUTED)
                   .font(FONT_REGULAR)
                   .fontSize(8.5)
                   .text(t.itemsCount(catProducts.length), margin, currentY + 7, { align: 'right', width: contentWidth - 10 });

                currentY += 28;

                // Table Header Row
                const colWidths = {
                    name: 243,
                    price: 90,
                    discount: 80,
                    marketPrice: 110
                };
                const colX = {
                    name: margin,
                    price: margin + colWidths.name,
                    discount: margin + colWidths.name + colWidths.price,
                    marketPrice: margin + colWidths.name + colWidths.price + colWidths.discount
                };

                doc.rect(margin, currentY, contentWidth, 20).fill(PRIMARY_COLOR);

                doc.fillColor('#FFFFFF')
                   .font(FONT_BOLD)
                   .fontSize(8.5);

                doc.text(t.tableHeaders.name, colX.name + 8, currentY + 5.5, { width: colWidths.name - 16 });
                doc.text(t.tableHeaders.price, colX.price, currentY + 5.5, { width: colWidths.price, align: 'center' });
                doc.text(t.tableHeaders.discount, colX.discount, currentY + 5.5, { width: colWidths.discount, align: 'center' });
                doc.text(t.tableHeaders.marketPrice, colX.marketPrice, currentY + 5.5, { width: colWidths.marketPrice - 8, align: 'center' });

                currentY += 20;

                // Table Product Rows
                catProducts.forEach((p, index) => {
                    const price = Number(p.price || 0);
                    const comparePrice = Number(p.compare_price || 0);
                    let marketPrice = price;
                    let discountPercent = 0;

                    if (comparePrice > price) {
                        marketPrice = comparePrice;
                        discountPercent = Math.round(((comparePrice - price) / comparePrice) * 100);
                    }

                    const priceFormatted = `₹${price.toLocaleString('en-IN')}`;
                    const marketPriceFormatted = `₹${marketPrice.toLocaleString('en-IN')}`;
                    const discountFormatted = discountPercent > 0 ? `${discountPercent}%` : '0%';

                    const rowHeight = 20;

                    if (currentY + rowHeight > pageHeight - 50) {
                        doc.addPage();
                        currentY = margin;

                        // Re-draw table header on new page
                        doc.rect(margin, currentY, contentWidth, 20).fill(PRIMARY_COLOR);
                        doc.fillColor('#FFFFFF')
                           .font(FONT_BOLD)
                           .fontSize(8.5);

                        doc.text(t.tableHeaders.name, colX.name + 8, currentY + 5.5, { width: colWidths.name - 16 });
                        doc.text(t.tableHeaders.price, colX.price, currentY + 5.5, { width: colWidths.price, align: 'center' });
                        doc.text(t.tableHeaders.discount, colX.discount, currentY + 5.5, { width: colWidths.discount, align: 'center' });
                        doc.text(t.tableHeaders.marketPrice, colX.marketPrice, currentY + 5.5, { width: colWidths.marketPrice - 8, align: 'center' });

                        currentY += 20;
                    }

                    // Background stripe
                    if (index % 2 === 1) {
                        doc.rect(margin, currentY, contentWidth, rowHeight).fill(ROW_ALT_BG);
                    }

                    // Border line bottom
                    doc.rect(margin, currentY + rowHeight - 0.5, contentWidth, 0.5).fill('#E2E8F0');

                    // Name
                    doc.fillColor(TEXT_DARK)
                       .font(FONT_BOLD)
                       .fontSize(8.5)
                       .text(p.name || 'Unnamed Product', colX.name + 8, currentY + 5.5, { width: colWidths.name - 16, lineBreak: false });

                    // Current Price
                    doc.fillColor(PRIMARY_COLOR)
                       .font(FONT_BOLD)
                       .fontSize(8.5)
                       .text(priceFormatted, colX.price, currentY + 5.5, { width: colWidths.price, align: 'center' });

                    // Discount %
                    doc.fillColor(TEXT_DARK)
                       .font(FONT_REGULAR)
                       .fontSize(8.5)
                       .text(discountFormatted, colX.discount, currentY + 5.5, { width: colWidths.discount, align: 'center' });

                    // Market Price
                    doc.fillColor(TEXT_MUTED)
                       .font(FONT_REGULAR)
                       .fontSize(8.5)
                       .text(marketPriceFormatted, colX.marketPrice, currentY + 5.5, { width: colWidths.marketPrice - 8, align: 'center' });

                    currentY += rowHeight;
                });

                currentY += 14;
            });

            // Footer Page Numbers across all pages
            const range = doc.bufferedPageRange();
            const totalPages = range.count;

            for (let i = 0; i < totalPages; i++) {
                doc.switchToPage(i);

                doc.rect(margin, pageHeight - 32, contentWidth, 0.5).fill('#E2E8F0');

                doc.fillColor(TEXT_MUTED)
                   .font(FONT_REGULAR)
                   .fontSize(8)
                   .text(t.footerText, margin, pageHeight - 24);

                doc.text(t.pageLabel(i + 1, totalPages), margin, pageHeight - 24, {
                    align: 'right',
                    width: contentWidth
                });
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}
