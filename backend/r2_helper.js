import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g., https://pub-xxxxxx.r2.dev

let s3 = null;
if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
    });
} else {
    console.warn("R2 Credentials missing. Image uploads to R2 will be bypassed if missing.");
}

/**
 * Uploads a base64 image or video data URL to Cloudflare R2 and returns the public URL.
 * @param {string} base64String 
 * @param {string} productId 
 * @param {number|string} index 
 * @returns {Promise<string>} public URL of the uploaded media
 */
export async function uploadBase64ToR2(base64String, productId, index = 0) {
    if (!s3 || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
        throw new Error("R2 environment variables are not fully configured.");
    }

    // Supports standard and codec-qualified data URLs e.g.:
    // data:image/png;base64,... or data:video/mp4;codecs=avc1;base64,...
    const matches = base64String.match(/^data:([A-Za-z0-9.+\/-]+)(?:;[^,]*)?;base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error("Invalid base64 media format");
    }

    const mimeType = matches[1].toLowerCase();
    const mediaBuffer = Buffer.from(matches[2], 'base64');

    const mimeExtensionMap = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov',
        'video/ogg': 'ogv',
        'video/x-matroska': 'mkv',
        'video/x-m4v': 'm4v',
    };
    const extension = mimeExtensionMap[mimeType] || (mimeType.startsWith('video/') ? 'mp4' : 'png');

    // User requested files to be under 'rasobhoomi/' folder
    const uniqueHash = Math.random().toString(36).substring(2, 8);
    const fileName = `rasobhoomi/${productId}_${Date.now()}_${uniqueHash}_${index}.${extension}`;

    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileName,
        Body: mediaBuffer,
        ContentType: mimeType,
    });

    await s3.send(command);

    // Remove trailing slash if present from R2_PUBLIC_URL
    const baseUrl = R2_PUBLIC_URL.replace(/\/$/, '');
    return `${baseUrl}/${fileName}`;
}

export async function processProductImagesForR2(productId, image, imagesArray) {
    let newImage = image;
    let newImagesArray = Array.isArray(imagesArray) ? [...imagesArray] : [];

    // Process main image
    if (newImage && newImage.startsWith('data:image/')) {
        try {
            newImage = await uploadBase64ToR2(newImage, productId, 'main');
        } catch (e) {
            console.error(`Failed to upload main image for ${productId} to R2:`, e);
        }
    }

    // Process gallery images
    for (let i = 0; i < newImagesArray.length; i++) {
        if (newImagesArray[i] && newImagesArray[i].startsWith('data:image/')) {
            try {
                newImagesArray[i] = await uploadBase64ToR2(newImagesArray[i], productId, i);
            } catch (e) {
                console.error(`Failed to upload gallery image ${i} for ${productId} to R2:`, e);
            }
        }
    }

    return { newImage, newImagesArray };
}

/**
 * Uploads any base64 product videos to Cloudflare R2 and returns the resulting URL array.
 * @param {string} productId
 * @param {Array<string>} videosArray
 * @returns {Promise<Array<string>>}
 */
export async function processProductVideosForR2(productId, videosArray) {
    const newVideosArray = Array.isArray(videosArray) ? [...videosArray] : [];

    for (let i = 0; i < newVideosArray.length; i++) {
        const video = newVideosArray[i];
        if (typeof video === 'string' && video.startsWith('data:video/')) {
            try {
                newVideosArray[i] = await uploadBase64ToR2(video, productId, `video_${i}`);
            } catch (e) {
                console.error(`Failed to upload product video ${i} for ${productId} to R2:`, e);
            }
        }
    }

    return newVideosArray.filter((v) => typeof v === 'string' && v.trim() !== '');
}
