import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const utilsPath = path.join(__dirname, '../node_modules/whatsapp-web.js/src/util/Injected/Utils.js');

try {
    if (fs.existsSync(utilsPath)) {
        let content = fs.readFileSync(utilsPath, 'utf8');

        // Check if patch already applied
        if (!content.includes('delete message.__x_id')) {
            console.log('[PATCH] Patching whatsapp-web.js Injected/Utils.js for media memoize getter issue...');
            
            // Fix: ensure message.id is not overwritten by mediaOptions and delete __x_id
            const target = '...extraOptions,\n        };';
            const replacement = '...extraOptions,\n        };\n        delete message.__x_id;\n        message.id = newMsgKey;';
            
            if (content.includes(target)) {
                content = content.replace(target, replacement);
                fs.writeFileSync(utilsPath, content, 'utf8');
                console.log('[PATCH] ✅ Successfully patched Injected/Utils.js!');
            } else {
                console.warn('[PATCH] Target anchor not found in Utils.js. Will rely on runtime Puppeteer patch.');
            }
        } else {
            console.log('[PATCH] whatsapp-web.js already patched.');
        }
    } else {
        console.log('[PATCH] whatsapp-web.js not found in node_modules (may be skipped in this environment).');
    }
} catch (err) {
    console.warn('[PATCH] Notice while applying patch:', err.message);
}
