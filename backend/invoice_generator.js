import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * Generates a clean, professional single-page PDF Invoice Buffer for an order.
 * @param {Object} order - Order object containing id, name, phone, address, city, zip, total, items, status, payment_status, transaction_id, tracking_id, created_at
 * @returns {Promise<Buffer>}
 */
export function generateInvoicePdf(order) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 36, size: 'A4' });
            const buffers = [];
            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const PRIMARY_COLOR = '#1A4D2E';
            const SECONDARY_COLOR = '#059669';
            const TEXT_MAIN = '#1F2937';
            const TEXT_MUTED = '#4B5563';
            const BG_LIGHT = '#F9FAFB';
            const BORDER_COLOR = '#E5E7EB';

            // Top Header Bar
            doc.rect(0, 0, 595.28, 10).fill(PRIMARY_COLOR);

            // Brand Header (Left)
            doc.fillColor(PRIMARY_COLOR).fontSize(20).font('Helvetica-Bold').text('RASOBHOOMI PLANTATION', 36, 28);
            doc.fillColor(TEXT_MUTED).fontSize(8.5).font('Helvetica').text('Authentic Plants, Sustainably Grown for a Greener Home', 36, 52);
            doc.fontSize(8).fillColor(TEXT_MUTED).text('WhatsApp: +91 89720 76182  |  Web: rasobhoomiplantation.com', 36, 64);

            // Invoice Title & Info (Top Right)
            doc.fillColor(PRIMARY_COLOR).fontSize(18).font('Helvetica-Bold').text('TAX INVOICE', 350, 28, { align: 'right', width: 209 });
            doc.fillColor(TEXT_MAIN).fontSize(9).font('Helvetica-Bold').text(`Invoice #: ${order.id}`, 350, 52, { align: 'right', width: 209 });
            
            const formattedDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
            doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_MUTED).text(`Date: ${formattedDate}`, 350, 64, { align: 'right', width: 209 });

            // Horizontal Line
            doc.moveTo(36, 82).lineTo(559, 82).strokeColor(SECONDARY_COLOR).lineWidth(1.5).stroke();

            // Customer & Payment Info Boxes Side by Side
            const boxY = 94;
            const boxWidth = 252;
            const boxHeight = 84;

            // Box 1: Billed To
            doc.roundedRect(36, boxY, boxWidth, boxHeight, 6).fillAndStroke(BG_LIGHT, BORDER_COLOR);
            doc.fillColor(PRIMARY_COLOR).fontSize(9).font('Helvetica-Bold').text('BILLED TO / DELIVER TO', 46, boxY + 8);
            doc.fillColor(TEXT_MAIN).fontSize(9.5).font('Helvetica-Bold').text(order.name || 'Customer', 46, boxY + 22);
            doc.fontSize(8.5).font('Helvetica').fillColor(TEXT_MUTED)
               .text(`Phone: +91 ${order.phone ? order.phone.replace(/\D/g, '').slice(-10) : 'N/A'}`, 46, boxY + 36)
               .text(`Address: ${order.address || ''}`, 46, boxY + 48, { width: boxWidth - 20, height: 18 })
               .text(`${order.city || ''} ${order.zip ? `- ${order.zip}` : ''}`, 46, boxY + 65);

            // Box 2: Payment & Order Information
            const box2X = 307;
            doc.roundedRect(box2X, boxY, boxWidth, boxHeight, 6).fillAndStroke(BG_LIGHT, BORDER_COLOR);
            doc.fillColor(PRIMARY_COLOR).fontSize(9).font('Helvetica-Bold').text('PAYMENT & ORDER DETAILS', box2X + 10, boxY + 8);
            
            const payStatus = (order.payment_status || 'PAID').toUpperCase();
            const txnId = order.transaction_id || order.id;

            doc.fillColor(TEXT_MAIN).fontSize(8.5).font('Helvetica')
               .text('Payment Status: ', box2X + 10, boxY + 22, { continued: true })
               .font('Helvetica-Bold').fillColor('#059669').text(payStatus);

            doc.font('Helvetica').fillColor(TEXT_MAIN)
               .text('Transaction ID: ', box2X + 10, boxY + 36, { continued: true })
               .font('Helvetica-Bold').text(txnId, { lineBreak: false });

            doc.text('', box2X + 10, boxY + 50); // Line reset

            if (order.tracking_id) {
                doc.font('Helvetica').fillColor(TEXT_MAIN)
                   .text('DTDC Tracking AWB: ', box2X + 10, boxY + 50, { continued: true })
                   .font('Helvetica-Bold').fillColor('#dc2626').text(order.tracking_id);
            }

            // Items Table
            const tableTop = 192;
            // Header Row
            doc.rect(36, tableTop, 523, 20).fill(PRIMARY_COLOR);
            doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold');
            doc.text('#', 42, tableTop + 5, { width: 20 });
            doc.text('Item Description', 70, tableTop + 5, { width: 250 });
            doc.text('Qty', 330, tableTop + 5, { width: 40, align: 'center' });
            doc.text('Unit Price', 380, tableTop + 5, { width: 75, align: 'right' });
            doc.text('Total Amount', 465, tableTop + 5, { width: 88, align: 'right' });

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

                doc.fillColor(TEXT_MAIN).fontSize(8.5).font('Helvetica');
                doc.text(String(index + 1), 42, y + 4, { width: 20 });
                doc.text(item.name || 'Plant Product', 70, y + 4, { width: 250, lineBreak: false });
                doc.text(String(itemQty), 330, y + 4, { width: 40, align: 'center' });
                doc.text(`₹${itemPrice.toLocaleString('en-IN')}`, 380, y + 4, { width: 75, align: 'right' });
                doc.text(`₹${itemTotal.toLocaleString('en-IN')}`, 465, y + 4, { width: 88, align: 'right' });

                doc.moveTo(36, y + 18).lineTo(559, y + 18).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
                y += 18;
            });

            // Summary Section (Right Aligned)
            const summaryTop = Math.max(y + 12, 320);
            const summaryX = 350;
            const summaryWidth = 209;

            const total = Number(order.total || subtotal);
            const deliveryCharge = Number(order.delivery_charge || 0);
            const discountAmount = Math.max(0, subtotal + deliveryCharge - total);

            doc.fontSize(8.5).font('Helvetica').fillColor(TEXT_MUTED);
            
            // Subtotal
            doc.text('Subtotal:', summaryX, summaryTop, { width: 100 });
            doc.fillColor(TEXT_MAIN).text(`₹${subtotal.toLocaleString('en-IN')}`, summaryX + 100, summaryTop, { width: 109, align: 'right' });

            // Delivery
            doc.fillColor(TEXT_MUTED).text('Delivery Charges:', summaryX, summaryTop + 14, { width: 100 });
            const deliveryText = deliveryCharge === 0 ? 'FREE' : `₹${deliveryCharge}`;
            doc.fillColor(TEXT_MAIN).text(deliveryText, summaryX + 100, summaryTop + 14, { width: 109, align: 'right' });

            let currentSummaryY = summaryTop + 28;
            if (discountAmount > 0) {
                doc.fillColor('#059669').text('Discount Savings:', summaryX, currentSummaryY, { width: 100 });
                doc.text(`- ₹${discountAmount.toLocaleString('en-IN')}`, summaryX + 100, currentSummaryY, { width: 109, align: 'right' });
                currentSummaryY += 14;
            }

            // Total Highlight Box
            doc.roundedRect(summaryX, currentSummaryY + 4, summaryWidth, 24, 4).fill(PRIMARY_COLOR);
            doc.fillColor('#FFFFFF').fontSize(9.5).font('Helvetica-Bold');
            doc.text('GRAND TOTAL:', summaryX + 10, currentSummaryY + 10, { width: 100 });
            doc.text(`₹${total.toLocaleString('en-IN')}`, summaryX + 100, currentSummaryY + 10, { width: 99, align: 'right' });

            // Bottom Footer Notes
            const footerY = 780;
            doc.moveTo(36, footerY).lineTo(559, footerY).strokeColor(BORDER_COLOR).lineWidth(0.75).stroke();
            
            doc.fontSize(8).font('Helvetica').fillColor(TEXT_MUTED)
               .text('Thank you for choosing Rasobhoomi Plantation for your greenery needs!', 36, footerY + 8, { align: 'center', width: 523 })
               .text('For queries or support, contact WhatsApp: +91 89720 76182 | Website: rasobhoomiplantation.com', 36, footerY + 18, { align: 'center', width: 523 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}
