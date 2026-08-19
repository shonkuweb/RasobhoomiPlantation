import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { translateProduct, translateCategoryName, canonicalCategoryKey } from '../src/utils/translations.js';

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
            const translatedList = uniqueRaw.map(p => {
                const origCategory = p.originalCategory || p.category || 'Others';
                const translatedP = translateProduct(p, selectedLang);
                translatedP.originalCategory = origCategory;
                translatedP.category = translateCategoryName(origCategory, selectedLang);
                return translatedP;
            });

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
                margins: { top: 32, bottom: 0, left: 32, right: 32 },
                size: 'A4',
                bufferPages: true,
                autoFirstPage: true
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
            const margin = 32;
            const contentWidth = pageWidth - (margin * 2);
            const maxY = pageHeight - 38; // Usable vertical boundary before footer

            // Group products by category accurately
            const categoryMap = {};
            productList.forEach(p => {
                const origCat = p.originalCategory || p.category || 'Others';
                let cat = translateCategoryName(origCat, selectedLang) || 'General';
                if (!categoryMap[cat]) categoryMap[cat] = [];
                categoryMap[cat].push(p);
            });

            // Sort categories (Foreigner Mango first, then Indian Mangoes, then alphabetical)
            const categoryNames = Object.keys(categoryMap).sort((a, b) => {
                const aCanon = canonicalCategoryKey(a);
                const bCanon = canonicalCategoryKey(b);

                const priority = ['Foreigner Mango', 'Indian Mangoes'];
                const aIdx = priority.indexOf(aCanon);
                const bIdx = priority.indexOf(bCanon);

                if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                if (aIdx !== -1) return -1;
                if (bIdx !== -1) return 1;

                return a.localeCompare(b, selectedLang);
            });

            let currentY = margin;

            // Draw Header Banner on Page 1
            const bannerHeight = 48;
            doc.rect(margin, currentY, contentWidth, bannerHeight).fill(PRIMARY_COLOR);

            doc.fillColor('#FFFFFF')
               .font(FONT_BOLD)
               .fontSize(15)
               .text(t.title, margin + 12, currentY + 8, { lineBreak: false });

            doc.font(FONT_REGULAR)
               .fontSize(9)
               .text(t.subtitle, margin + 12, currentY + 28, { lineBreak: false });

            const dateStr = new Date().toLocaleDateString(selectedLang === 'bn' ? 'bn-IN' : selectedLang === 'hi' ? 'hi-IN' : 'en-IN', {
                day: '2-digit', month: 'short', year: 'numeric'
            });

            doc.fontSize(8)
               .text(`${t.dateLabel} ${dateStr}`, margin, currentY + 10, { align: 'right', width: contentWidth - 12, lineBreak: false })
               .text(`${t.totalProductsLabel} ${productList.length}`, margin, currentY + 26, { align: 'right', width: contentWidth - 12, lineBreak: false });

            currentY += bannerHeight + 10;

            const colWidths = {
                name: 247,
                price: 92,
                discount: 82,
                marketPrice: 110
            };
            const colX = {
                name: margin,
                price: margin + colWidths.name,
                discount: margin + colWidths.name + colWidths.price,
                marketPrice: margin + colWidths.name + colWidths.price + colWidths.discount
            };

            const rowHeight = 18;
            const categoryHeaderHeight = 20;
            const tableHeaderHeight = 18;

            const drawTableHeader = (y) => {
                doc.rect(margin, y, contentWidth, tableHeaderHeight).fill(PRIMARY_COLOR);
                doc.fillColor('#FFFFFF')
                   .font(FONT_BOLD)
                   .fontSize(8);

                doc.text(t.tableHeaders.name, colX.name + 8, y + 5, { width: colWidths.name - 16, lineBreak: false });
                doc.text(t.tableHeaders.price, colX.price, y + 5, { width: colWidths.price, align: 'center', lineBreak: false });
                doc.text(t.tableHeaders.discount, colX.discount, y + 5, { width: colWidths.discount, align: 'center', lineBreak: false });
                doc.text(t.tableHeaders.marketPrice, colX.marketPrice, y + 5, { width: colWidths.marketPrice - 8, align: 'center', lineBreak: false });
            };

            // Iterate over categories
            categoryNames.forEach(catName => {
                const catProducts = categoryMap[catName];
                if (!catProducts || catProducts.length === 0) return;

                // Ensure category header, table header, and at least 1 product fit together; otherwise start on next page
                const minCategorySpace = categoryHeaderHeight + tableHeaderHeight + rowHeight + 8;
                if (currentY + minCategorySpace > maxY) {
                    doc.addPage();
                    currentY = margin;
                }

                // Category Header Box
                doc.roundedRect(margin, currentY, contentWidth, categoryHeaderHeight, 2)
                   .fillAndStroke(PRIMARY_LIGHT_BG, PRIMARY_BORDER);

                doc.fillColor(PRIMARY_COLOR)
                   .font(FONT_BOLD)
                   .fontSize(9.5)
                   .text(`${t.categoryPrefix} ${catName.toUpperCase()}`, margin + 8, currentY + 5, { lineBreak: false });

                doc.fillColor(TEXT_MUTED)
                   .font(FONT_REGULAR)
                   .fontSize(8)
                   .text(t.itemsCount(catProducts.length), margin, currentY + 6, { align: 'right', width: contentWidth - 8, lineBreak: false });

                currentY += categoryHeaderHeight + 3;

                // Draw Table Header Row
                drawTableHeader(currentY);
                currentY += tableHeaderHeight;

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

                    if (currentY + rowHeight > maxY) {
                        doc.addPage();
                        currentY = margin;

                        // Continuation category banner
                        doc.roundedRect(margin, currentY, contentWidth, 16, 2)
                           .fillAndStroke(PRIMARY_LIGHT_BG, PRIMARY_BORDER);
                        doc.fillColor(PRIMARY_COLOR)
                           .font(FONT_BOLD)
                           .fontSize(8)
                           .text(`${t.categoryPrefix} ${catName.toUpperCase()} (${selectedLang === 'bn' ? 'চলমান' : selectedLang === 'hi' ? 'जारी' : 'Contd.'})`, margin + 6, currentY + 4, { lineBreak: false });
                        currentY += 19;

                        // Re-draw table header on new page
                        drawTableHeader(currentY);
                        currentY += tableHeaderHeight;
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
                       .fontSize(8)
                       .text(p.name || 'Unnamed Product', colX.name + 8, currentY + 4.5, { width: colWidths.name - 16, lineBreak: false });

                    // Current Price
                    doc.fillColor(PRIMARY_COLOR)
                       .font(FONT_BOLD)
                       .fontSize(8)
                       .text(priceFormatted, colX.price, currentY + 4.5, { width: colWidths.price, align: 'center', lineBreak: false });

                    // Discount %
                    doc.fillColor(TEXT_DARK)
                       .font(FONT_REGULAR)
                       .fontSize(8)
                       .text(discountFormatted, colX.discount, currentY + 4.5, { width: colWidths.discount, align: 'center', lineBreak: false });

                    // Market Price
                    doc.fillColor(TEXT_MUTED)
                       .font(FONT_REGULAR)
                       .fontSize(8)
                       .text(marketPriceFormatted, colX.marketPrice, currentY + 4.5, { width: colWidths.marketPrice - 8, align: 'center', lineBreak: false });

                    currentY += rowHeight;
                });

                currentY += 8;
            });

            // Footer Page Numbers across all pages (Rendered safely without overflowing printable height)
            const range = doc.bufferedPageRange();
            const totalPages = range.count;

            for (let i = 0; i < totalPages; i++) {
                doc.switchToPage(i);

                doc.rect(margin, pageHeight - 26, contentWidth, 0.5).fill('#E2E8F0');

                doc.fillColor(TEXT_MUTED)
                   .font(FONT_REGULAR)
                   .fontSize(7.5)
                   .text(t.footerText, margin, pageHeight - 19, { lineBreak: false });

                doc.text(t.pageLabel(i + 1, totalPages), margin, pageHeight - 19, {
                    align: 'right',
                    width: contentWidth,
                    lineBreak: false
                });
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}
