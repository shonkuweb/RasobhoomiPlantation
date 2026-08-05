import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Format rows into a clean terminal ASCII table
 */
function printTable(headers, rows) {
    if (!rows || rows.length === 0) {
        console.log('\n❌ No recent WhatsApp message logs found in current log buffers.\n');
        return;
    }

    const colWidths = headers.map((h, idx) => {
        let maxLen = h.length;
        rows.forEach(r => {
            const val = String(r[idx] || '');
            if (val.length > maxLen) maxLen = val.length;
        });
        return Math.min(maxLen + 2, 45); // limit max col width for readability
    });

    const border = '+' + colWidths.map(w => '-'.repeat(w)).join('+') + '+';
    
    console.log('\n📱 --- RECENT WHATSAPP MESSAGES SENT LOGS ---');
    console.log(border);
    console.log('|' + headers.map((h, i) => ` ${h.padEnd(colWidths[i] - 1)}`).join('|') + '|');
    console.log(border);

    rows.forEach(row => {
        const formattedRow = row.map((cell, i) => {
            let str = String(cell || '');
            if (str.length > colWidths[i] - 2) {
                str = str.substring(0, colWidths[i] - 5) + '...';
            }
            return ` ${str.padEnd(colWidths[i] - 1)}`;
        });
        console.log('|' + formattedRow.join('|') + '|');
    });

    console.log(border);
    console.log(`Total Records: ${rows.length}\n`);
}

/**
 * Extract WhatsApp log lines from Docker / PM2 / system logs
 */
function getLogsFromSystem() {
    let logOutput = '';
    try {
        logOutput = execSync('docker-compose logs --tail=1000 2>/dev/null', { encoding: 'utf-8' });
    } catch (e) {
        try {
            logOutput = execSync('docker logs --tail=1000 app 2>/dev/null || docker logs --tail=1000 rasobhoomi_app 2>/dev/null', { encoding: 'utf-8' });
        } catch (e2) {
            try {
                logOutput = execSync('pm2 logs --lines 1000 --nostream 2>/dev/null', { encoding: 'utf-8' });
            } catch (e3) {
                const localLogFile = path.resolve(__dirname, '../build_log.txt');
                if (fs.existsSync(localLogFile)) {
                    logOutput = fs.readFileSync(localLogFile, 'utf-8');
                }
            }
        }
    }
    return logOutput;
}

/**
 * Parse raw logs into structured tabular rows
 */
function parseWhatsAppLogs(logOutput) {
    const lines = logOutput.split('\n');
    const records = [];

    lines.forEach(line => {
        if (!line.includes('[WHATSAPP]')) return;

        let timestamp = 'N/A';
        const isoMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) || line.match(/\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/);
        if (isoMatch) {
            timestamp = isoMatch[0];
        }

        const cleanMsg = line.substring(line.indexOf('[WHATSAPP]') + 10).trim();

        let type = 'INFO';
        let orderId = 'N/A';
        let recipient = 'N/A';
        let status = 'SUCCESS';

        if (cleanMsg.includes('Sending order notification')) {
            type = 'ORDER_PAID_ADMIN';
            const m = cleanMsg.match(/#(\w+)/);
            if (m) orderId = '#' + m[1];
            const r = cleanMsg.match(/\(([^)]+)\)/);
            if (r) recipient = r[1];
        } else if (cleanMsg.includes('Sending customer order confirmation')) {
            type = 'ORDER_PAID_CUSTOMER';
            const m = cleanMsg.match(/#(\w+)/);
            if (m) orderId = '#' + m[1];
            const r = cleanMsg.match(/\(([^)]+)\)/);
            if (r) recipient = r[1];
        } else if (cleanMsg.includes('Sending pending payment alert')) {
            type = 'PENDING_ALERT';
            const m = cleanMsg.match(/#(\w+)/);
            if (m) orderId = '#' + m[1];
            const r = cleanMsg.match(/\(([^)]+)\)/);
            if (r) recipient = r[1];
        } else if (cleanMsg.includes('Sending order status update')) {
            type = 'STATUS_UPDATE';
            const m = cleanMsg.match(/#(\w+)/);
            if (m) orderId = '#' + m[1];
            const r = cleanMsg.match(/\(([^)]+)\)/);
            if (r) recipient = r[1];
        } else if (cleanMsg.includes('delivered to')) {
            type = 'DELIVERED';
            const r = cleanMsg.match(/delivered to ([\w@.]+)/);
            if (r) recipient = r[1];
        } else if (cleanMsg.includes('Failed') || cleanMsg.includes('Error') || cleanMsg.includes('Cannot send')) {
            status = 'FAILED';
        }

        records.push([
            timestamp,
            type,
            orderId,
            recipient,
            status,
            cleanMsg
        ]);
    });

    return records;
}

function main() {
    console.log('🔍 Fetching recent WhatsApp message details from VPS logs...');
    const rawLogs = getLogsFromSystem();
    const rows = parseWhatsAppLogs(rawLogs);

    const headers = ['TIMESTAMP', 'EVENT TYPE', 'ORDER ID', 'RECIPIENT', 'STATUS', 'DETAILS'];
    printTable(headers, rows);
}

main();
