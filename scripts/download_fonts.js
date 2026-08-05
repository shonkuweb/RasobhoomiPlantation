import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontDir = path.join(__dirname, '../backend/fonts');
if (!fs.existsSync(fontDir)) {
    fs.mkdirSync(fontDir, { recursive: true });
}

const fontUrls = [
    { name: 'Hind-Regular.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/hind/Hind-Regular.ttf' },
    { name: 'Hind-Bold.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/hind/Hind-Bold.ttf' },
    { name: 'HindSiliguri-Regular.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/hindsiliguri/HindSiliguri-Regular.ttf' },
    { name: 'HindSiliguri-Bold.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/hindsiliguri/HindSiliguri-Bold.ttf' }
];

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const request = (targetUrl) => {
            https.get(targetUrl, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    return request(response.headers.location);
                }
                if (response.statusCode !== 200) {
                    return reject(new Error(`HTTP ${response.statusCode}`));
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            }).on('error', (err) => {
                fs.unlink(dest, () => reject(err));
            });
        };
        request(url);
    });
}

export async function ensureFontsDownloaded() {
    console.log('Checking Hindi and Bengali TTF fonts for PDF invoice generation...');
    for (const item of fontUrls) {
        const dest = path.join(fontDir, item.name);
        if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
            continue;
        }
        try {
            console.log(`Downloading font ${item.name}...`);
            await downloadFile(item.url, dest);
            console.log(`Downloaded ${item.name} (${fs.statSync(dest).size} bytes).`);
        } catch (e) {
            console.warn(`Warning: Could not download ${item.name}: ${e.message}`);
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    ensureFontsDownloaded();
}
