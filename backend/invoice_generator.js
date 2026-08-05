import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { categoryTranslations, productTranslations } from '../src/utils/translations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontDir = path.join(__dirname, 'fonts');
const hindRegular = path.join(fontDir, 'Hind-Regular.ttf');
const hindBold = path.join(fontDir, 'Hind-Bold.ttf');
const hindSiliguriRegular = path.join(fontDir, 'HindSiliguri-Regular.ttf');
const hindSiliguriBold = path.join(fontDir, 'HindSiliguri-Bold.ttf');

const pdfTranslations = {
    en: {
        invoiceTitle: 'INVOICE',
        invoiceNoPrefix: 'Invoice #:',
        datePrefix: 'Date:',
        billedToTitle: 'BILLED TO / DELIVER TO',
        phonePrefix: 'Phone:',
        addressPrefix: 'Address:',
        paymentDetailsTitle: 'PAYMENT & ORDER DETAILS',
        paymentStatusLabel: 'Payment Status:',
        transactionIdLabel: 'Transaction ID:',
        statusMap: {
            PAID: 'PAID',
            PENDING: 'PENDING',
            UNPAID: 'UNPAID',
            FAILED: 'FAILED',
            COD: 'CASH ON DELIVERY'
        },
        courierLabel: {
            dtdc: 'DTDC Tracking AWB:',
            amazon: 'Amazon Tracking ID:',
            rail: 'Delivery Method:',
            bus: 'Delivery Method:'
        },
        courierMethodText: {
            rail: 'By Rail/Train',
            bus: 'By BUS'
        },
        tableHeader: {
            hash: '#',
            description: 'Item Description',
            qty: 'Qty',
            unitPrice: 'Unit Price',
            totalAmount: 'Total Amount'
        },
        subtotal: 'Subtotal:',
        deliveryCharges: 'Delivery Charges:',
        free: 'FREE',
        discountSavings: 'Discount Savings:',
        grandTotal: 'GRAND TOTAL:',
        footer1: 'Thank you for choosing Rasobhoomi Plantation for your greenery needs!',
        footer2: 'For queries or support, contact WhatsApp: +91 89720 76182 | Website: rasobhoomiplantation.com',
        customerFallback: 'Customer',
        plantFallback: 'Plant Product'
    },
    hi: {
        invoiceTitle: 'कर इनवॉइस',
        invoiceNoPrefix: 'इनवॉइस क्र.:',
        datePrefix: 'दिनांक:',
        billedToTitle: 'ग्राहक का नाम व डिलीवरी पता',
        phonePrefix: 'फ़ोन:',
        addressPrefix: 'पता:',
        paymentDetailsTitle: 'भुगतान एवं ऑर्डर विवरण',
        paymentStatusLabel: 'भुगतान स्थिति:',
        transactionIdLabel: 'ट्रांजैक्शन आईडी:',
        statusMap: {
            PAID: 'सफलता (PAID)',
            PENDING: 'लंबित (PENDING)',
            UNPAID: 'अदत्त (UNPAID)',
            FAILED: 'विफल (FAILED)',
            COD: 'कैश ऑन डिलीवरी'
        },
        courierLabel: {
            dtdc: 'डीटीडीसी ट्रैकिंग नंबर:',
            amazon: 'अमेज़न ट्रैकिंग आईडी:',
            rail: 'डिलिवरी माध्यम:',
            bus: 'डिलिवरी माध्यम:'
        },
        courierMethodText: {
            rail: 'रेल/ट्रेन द्वारा',
            bus: 'बस द्वारा'
        },
        tableHeader: {
            hash: 'क्र.',
            description: 'वस्तु का विवरण',
            qty: 'मात्रा',
            unitPrice: 'इकाई मूल्य',
            totalAmount: 'कुल राशि'
        },
        subtotal: 'उप-कुल:',
        deliveryCharges: 'डिलिवरी शुल्क:',
        free: 'मुफ़्त',
        discountSavings: 'छूट बचत:',
        grandTotal: 'कुल योग:',
        footer1: 'अपनी हरियाली की जरूरतों के लिए रसोभूमि प्लांटेशन को चुनने के लिए धन्यवाद!',
        footer2: 'प्रश्न या सहायता के लिए, व्हाट्सएप पर संपर्क करें: +91 89720 76182 | वेबसाइट: rasobhoomiplantation.com',
        customerFallback: 'ग्राहक',
        plantFallback: 'पौधा उत्पाद'
    },
    bn: {
        invoiceTitle: 'ট্যাক্স ইনভয়েস',
        invoiceNoPrefix: 'চালান নং:',
        datePrefix: 'তারিখ:',
        billedToTitle: 'গ্রাহকের নাম ও ডেলিভারি ঠিকানা',
        phonePrefix: 'ফোন:',
        addressPrefix: 'ঠিকানা:',
        paymentDetailsTitle: 'পেমেন্ট এবং অর্ডারের বিবরণ',
        paymentStatusLabel: 'পেমেন্ট স্ট্যাটাস:',
        transactionIdLabel: 'ট্রানজ্যাকশন আইডি:',
        statusMap: {
            PAID: 'সফল (PAID)',
            PENDING: 'পেন্ডিং (PENDING)',
            UNPAID: 'বকেয়া (UNPAID)',
            FAILED: 'ব্যর্থ (FAILED)',
            COD: 'ক্যাশ অন ডেলিভারি'
        },
        courierLabel: {
            dtdc: 'ডিটিডিসি ট্র্যাকিং আইডি:',
            amazon: 'অ্যামাজন ট্র্যাকিং আইডি:',
            rail: 'ডেলিভারি পদ্ধতি:',
            bus: 'ডেলিভারি পদ্ধতি:'
        },
        courierMethodText: {
            rail: 'ট্রেন / রেল যোগে',
            bus: 'বাস যোগে'
        },
        tableHeader: {
            hash: 'নং',
            description: 'পণ্যের বিবরণ',
            qty: 'পরিমাণ',
            unitPrice: 'একক মূল্য',
            totalAmount: 'মোট টাকা'
        },
        subtotal: 'উপ-মোট:',
        deliveryCharges: 'ডেলিভারি চার্জ:',
        free: 'ফ্রি',
        discountSavings: 'ডিসকাউন্ট সঞ্চয়:',
        grandTotal: 'সর্বমোট:',
        footer1: 'আপনার ঘরের সবুজায়নের জন্য রসভূমি প্ল্যান্টেশন বেছে নেওয়ার জন্য ধন্যবাদ!',
        footer2: 'যেকোনো প্রশ্ন বা সহায়তার জন্য, হোয়াটসঅ্যাপে যোগাযোগ করুন: +91 89720 76182 | ওয়েবসাইট: rasobhoomiplantation.com',
        customerFallback: 'গ্রাহক',
        plantFallback: 'চারা গাছ'
    }
};

/**
 * Translates an item name into Hindi or Bengali if available
 */
function translateItemName(item, lang = 'en') {
    if (!item || lang === 'en') return item.name || 'Plant Product';
    
    // Check productTranslations by product id
    if (item.id && productTranslations[item.id] && productTranslations[item.id].name && productTranslations[item.id].name[lang]) {
        return productTranslations[item.id].name[lang];
    }
    
    // Check categoryTranslations if item name matches a category
    const originalName = item.name || '';
    if (categoryTranslations[originalName] && categoryTranslations[originalName][lang]) {
        return categoryTranslations[originalName][lang];
    }
    
    return originalName || (lang === 'hi' ? 'पौधा उत्पाद' : lang === 'bn' ? 'চারা গাছ' : 'Plant Product');
}

/**
 * Generates a clean, professional single-page PDF Invoice Buffer for an order in specified language.
 * @param {Object} order - Order object containing id, name, phone, address, city, zip, total, items, status, payment_status, transaction_id, tracking_id, created_at
 * @param {String} lang - Language code ('en', 'hi', 'bn')
 * @returns {Promise<Buffer>}
 */
export function generateInvoicePdf(order, lang = 'en') {
    const selectedLang = ['en', 'hi', 'bn'].includes(lang) ? lang : 'en';
    const t = pdfTranslations[selectedLang];

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 36, size: 'A4' });
            const buffers = [];
            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            // Register Hindi (Hind) & Bengali (HindSiliguri) fonts if available
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

            const PRIMARY_COLOR = '#1A4D2E';
            const SECONDARY_COLOR = '#059669';
            const TEXT_MAIN = '#1F2937';
            const TEXT_MUTED = '#4B5563';
            const BG_LIGHT = '#F9FAFB';
            const BORDER_COLOR = '#E5E7EB';

            // Top Header Bar
            doc.rect(0, 0, 595.28, 10).fill(PRIMARY_COLOR);

            // Brand Header (Left)
            doc.fillColor(PRIMARY_COLOR).fontSize(18).font(FONT_BOLD).text('RASOBHOOMI PLANTATION', 36, 28);
            doc.fillColor(TEXT_MUTED).fontSize(8.5).font(FONT_REGULAR).text('Authentic Plants, Sustainably Grown for a Greener Home', 36, 52);
            doc.fontSize(8).fillColor(TEXT_MUTED).text('WhatsApp: +91 89720 76182  |  Web: rasobhoomiplantation.com', 36, 64);

            // Invoice Title & Info (Top Right)
            doc.fillColor(PRIMARY_COLOR).fontSize(16).font(FONT_BOLD).text(t.invoiceTitle, 350, 26, { align: 'right', width: 209 });
            doc.fillColor(TEXT_MAIN).fontSize(9).font(FONT_BOLD).text(`${t.invoiceNoPrefix} ${order.id}`, 350, 50, { align: 'right', width: 209 });
            
            const formattedDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
            doc.font(FONT_REGULAR).fontSize(8.5).fillColor(TEXT_MUTED).text(`${t.datePrefix} ${formattedDate}`, 350, 64, { align: 'right', width: 209 });

            // Horizontal Line
            doc.moveTo(36, 82).lineTo(559, 82).strokeColor(SECONDARY_COLOR).lineWidth(1.5).stroke();

            // Customer & Payment Info Boxes Side by Side
            const boxY = 90;
            const boxWidth = 252;
            const boxHeight = 100;

            // Box 1: Billed To / Deliver To
            doc.roundedRect(36, boxY, boxWidth, boxHeight, 6).fillAndStroke(BG_LIGHT, BORDER_COLOR);
            doc.fillColor(PRIMARY_COLOR).fontSize(8.5).font(FONT_BOLD).text(t.billedToTitle, 46, boxY + 8);
            doc.fillColor(TEXT_MAIN).fontSize(9.5).font(FONT_BOLD).text(order.name || t.customerFallback, 46, boxY + 21, { width: boxWidth - 20, lineBreak: false });
            
            const phoneFormatted = order.phone ? `+91 ${String(order.phone).replace(/\D/g, '').slice(-10)}` : 'N/A';
            doc.fontSize(8.5).font(FONT_REGULAR).fillColor(TEXT_MUTED).text(`${t.phonePrefix} ${phoneFormatted}`, 46, boxY + 34);

            const streetAddr = (order.address || '').trim();
            const cityZipParts = [order.city ? order.city.trim() : '', order.zip ? `- ${order.zip.trim()}` : ''].filter(Boolean).join(' ');

            let addrY = boxY + 46;
            if (streetAddr) {
                doc.fontSize(8).font(FONT_REGULAR).fillColor(TEXT_MUTED).text(`${t.addressPrefix} ${streetAddr}`, 46, addrY, {
                    width: boxWidth - 20,
                    height: 38,
                    ellipsis: true
                });
                addrY = Math.min(boxY + 84, doc.y + 2);
            }
            if (cityZipParts) {
                doc.fontSize(8.5).font(FONT_BOLD).fillColor(TEXT_MAIN).text(cityZipParts, 46, addrY, {
                    width: boxWidth - 20,
                    lineBreak: false
                });
            }

            // Box 2: Payment & Order Information
            const box2X = 307;
            doc.roundedRect(box2X, boxY, boxWidth, boxHeight, 6).fillAndStroke(BG_LIGHT, BORDER_COLOR);
            doc.fillColor(PRIMARY_COLOR).fontSize(8.5).font(FONT_BOLD).text(t.paymentDetailsTitle, box2X + 10, boxY + 8);
            
            const rawStatus = (order.payment_status || 'PAID').toUpperCase();
            const displayStatus = t.statusMap[rawStatus] || rawStatus;
            const txnId = order.transaction_id || order.id;

            doc.fillColor(TEXT_MAIN).fontSize(8.5).font(FONT_REGULAR)
               .text(`${t.paymentStatusLabel} `, box2X + 10, boxY + 22, { continued: true })
               .font(FONT_BOLD).fillColor('#059669').text(displayStatus);

            doc.font(FONT_REGULAR).fillColor(TEXT_MAIN)
               .text(`${t.transactionIdLabel} `, box2X + 10, boxY + 36, { continued: true })
               .font(FONT_BOLD).text(String(txnId), { lineBreak: false });

            doc.text('', box2X + 10, boxY + 50); // Line reset

            const courier = (order.courier_name || 'dtdc').toLowerCase();
            let courierLabel = t.courierLabel[courier] || t.courierLabel.dtdc;
            let courierColor = '#dc2626';

            if (courier === 'amazon') {
                courierColor = '#ff9900';
            } else if (courier === 'rail' || courier === 'bus') {
                courierColor = '#2563eb';
            }

            if (courier === 'rail' || courier === 'bus') {
                const methodText = t.courierMethodText[courier] || (courier === 'rail' ? 'By Rail/Train' : 'By BUS');
                doc.font(FONT_REGULAR).fillColor(TEXT_MAIN)
                   .text(`${courierLabel} `, box2X + 10, boxY + 50, { continued: true })
                   .font(FONT_BOLD).fillColor(courierColor).text(methodText);
            } else if (order.tracking_id) {
                doc.font(FONT_REGULAR).fillColor(TEXT_MAIN)
                   .text(`${courierLabel} `, box2X + 10, boxY + 50, { continued: true })
                   .font(FONT_BOLD).fillColor(courierColor).text(order.tracking_id);
            }

            // Items Table
            const tableTop = boxY + boxHeight + 12;
            // Header Row
            doc.rect(36, tableTop, 523, 20).fill(PRIMARY_COLOR);
            doc.fillColor('#FFFFFF').fontSize(8.5).font(FONT_BOLD);
            doc.text(t.tableHeader.hash, 42, tableTop + 5, { width: 20 });
            doc.text(t.tableHeader.description, 70, tableTop + 5, { width: 250 });
            doc.text(t.tableHeader.qty, 330, tableTop + 5, { width: 40, align: 'center' });
            doc.text(t.tableHeader.unitPrice, 380, tableTop + 5, { width: 75, align: 'right' });
            doc.text(t.tableHeader.totalAmount, 465, tableTop + 5, { width: 88, align: 'right' });

            let items = [];
            try {
                items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
            } catch (e) {
                items = [];
            }

            let y = tableTop + 20;
            let subtotal = 0;

            items.forEach((item, index) => {
                const itemQty = Number(item.qty || item.quantity || 1);
                const itemPrice = Number(item.price || 0);
                const itemTotal = itemQty * itemPrice;
                subtotal += itemTotal;

                if (index % 2 === 0) {
                    doc.rect(36, y, 523, 18).fill('#FAFAFA');
                }

                const translatedName = translateItemName(item, selectedLang);

                doc.fillColor(TEXT_MAIN).fontSize(8.5).font(FONT_REGULAR);
                doc.text(String(index + 1), 42, y + 4, { width: 20 });
                doc.text(translatedName, 70, y + 4, { width: 250, lineBreak: false });
                doc.text(String(itemQty), 330, y + 4, { width: 40, align: 'center' });
                doc.text(`₹${itemPrice.toLocaleString('en-IN')}`, 380, y + 4, { width: 75, align: 'right' });
                doc.text(`₹${itemTotal.toLocaleString('en-IN')}`, 465, y + 4, { width: 88, align: 'right' });

                doc.moveTo(36, y + 18).lineTo(559, y + 18).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
                y += 18;
            });

            // Summary Section (Right Aligned)
            const summaryTop = Math.max(y + 12, 320);
            const summaryX = 330;
            const summaryWidth = 229;

            const total = Number(order.total || subtotal);
            let deliveryCharge = 0;
            let discountAmount = 0;

            if (order.delivery_charge !== undefined && order.delivery_charge !== null) {
                deliveryCharge = Number(order.delivery_charge);
            }
            if (order.discount_amount !== undefined && order.discount_amount !== null) {
                discountAmount = Number(order.discount_amount);
            } else if (order.delivery_charge !== undefined && order.delivery_charge !== null) {
                discountAmount = Math.max(0, subtotal + deliveryCharge - total);
            } else {
                if (total > subtotal) {
                    deliveryCharge = total - subtotal;
                    discountAmount = 0;
                } else if (total < subtotal) {
                    deliveryCharge = 0;
                    discountAmount = subtotal - total;
                } else {
                    deliveryCharge = 0;
                    discountAmount = 0;
                }
            }

            doc.fontSize(8.5).font(FONT_REGULAR).fillColor(TEXT_MUTED);
            
            // Subtotal
            doc.text(t.subtotal, summaryX, summaryTop, { width: 110 });
            doc.fillColor(TEXT_MAIN).text(`₹${subtotal.toLocaleString('en-IN')}`, summaryX + 110, summaryTop, { width: 119, align: 'right' });

            // Delivery
            doc.fillColor(TEXT_MUTED).text(t.deliveryCharges, summaryX, summaryTop + 14, { width: 110 });
            const deliveryText = deliveryCharge === 0 ? t.free : `₹${deliveryCharge.toLocaleString('en-IN')}`;
            doc.fillColor(TEXT_MAIN).text(deliveryText, summaryX + 110, summaryTop + 14, { width: 119, align: 'right' });

            let currentSummaryY = summaryTop + 28;
            if (discountAmount > 0) {
                doc.fillColor('#059669').text(t.discountSavings, summaryX, currentSummaryY, { width: 110 });
                doc.text(`- ₹${discountAmount.toLocaleString('en-IN')}`, summaryX + 110, currentSummaryY, { width: 119, align: 'right' });
                currentSummaryY += 14;
            }

            // Total Highlight Box
            doc.roundedRect(summaryX, currentSummaryY + 4, summaryWidth, 24, 4).fill(PRIMARY_COLOR);
            doc.fillColor('#FFFFFF').fontSize(9).font(FONT_BOLD);
            doc.text(t.grandTotal, summaryX + 10, currentSummaryY + 10, { width: 110 });
            doc.text(`₹${total.toLocaleString('en-IN')}`, summaryX + 110, currentSummaryY + 10, { width: 109, align: 'right' });

            // Bottom Footer Notes
            const footerY = 780;
            doc.moveTo(36, footerY).lineTo(559, footerY).strokeColor(BORDER_COLOR).lineWidth(0.75).stroke();
            
            doc.fontSize(8).font(FONT_REGULAR).fillColor(TEXT_MUTED)
               .text(t.footer1, 36, footerY + 8, { align: 'center', width: 523 })
               .text(t.footer2, 36, footerY + 18, { align: 'center', width: 523 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}
