# Refactoring & Security Walkthrough

I have successfully refactored your project structure and implemented major security improvements.

## 1. New Structure

- **root/**: Clean and organized.
    - `backend/`: Contains all server-side code (`server.js`, database files).
    - `pages/`: Contains all static HTML files (`admin.html`, `about.html`, etc.).
    - `src/`: Contains your React code.
    - `dist/`: Where the production build lives.

## 2. Security Enhancements (World-Class Standards)

### A. Secret Management
- **Password**: Your admin password is **NO LONGER HARDCODED**.
- **Action Required**: Set `ADMIN_PASSCODE` in your `.env` file (locally and on VPS).

### B. Attack Protection
- **Rate Limiting**:
    - **General API**: Max 100 requests per 15 mins per IP.
    - **Login**: Max **10 attempts** per 15 mins. (Prevents brute-force attackers).
- **Helmet.js**: Added to `server.js`. Automatically sets secure HTTP headers to prevent XSS and other injection attacks.

### C. Network Security
- **Strict CORS**: Configured to only allow trusted origins.

## 3. How to Deploy

The `DEPLOYMENT.md` file has been updated with the new structure.
1.  Upload code to VPS.
2.  Set your `.env` with the new `ADMIN_PASSCODE`.
3.  Run `docker-compose up -d --build`.

## 4. Verification

I ran `npm run build` and it successfully built all your pages from the new `pages/` directory into the `dist/` folder. Your app is ready to go!

## 5. Deployment Success (Final Status)

- **Status**: ✅ **LIVE** on VPS.
- **Database**: Connected to **PostgreSQL** (Production).
- **Fixes Applied during Deployment**:
    1.  **Node.js Version**: Upgraded Dockerfile to `node:20-alpine` to support Vite.
    2.  **Admin Route**: Fixed `/admin` to correctly load the Admin Panel (`admin.html`) instead of the React User App.
    3.  **CRUD API**: Fixed `PUT` endpoints in `server.js` so you can Update products and Order statuses.

**Your Project is now fully Refactored, Secured, and Deployed!** 🚀
