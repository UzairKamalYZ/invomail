# InvoMail

A small web app that takes a picture with your camera and emails it as a **PDF** or **image**, with your own message in the email body.

Default recipient: `uzairkamal@yahoo.com` (change it with `DEFAULT_TO` in `.env`, or edit the "To" field in the app).

## Features
- Live camera preview with **Take photo** and **Switch camera** (front/back on phones)
- **Upload** button: opens the phone camera or picks existing photos (also the fallback when live camera is blocked)
- Several photos per email (up to 10); remove any before sending
- Send as one multi-page **PDF** (one photo per A4 page) or as separate **JPEG** attachments
- Editable To, Subject and Message
- Test mode: if SMTP isn't set up, emails are logged instead of sent

## Setup (Gmail)

### 1. Create a Gmail App Password
Gmail does not let apps use your normal password. You create a separate **App Password** instead:
1. Sign in to the Gmail account you want to send **from**.
2. Turn on **2-Step Verification**: https://myaccount.google.com/signinoptions/twosv
3. Open https://myaccount.google.com/apppasswords, type a name such as `InvoMail`, and click **Create**.
4. Copy the 16-character password Google shows (e.g. `abcd efgh ijkl mnop`). You only see it once.

### 2. Configure and start the app
```bash
npm install
cp .env.example .env
```
Edit `.env`:
```
GMAIL_USER=yourname@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
DEFAULT_TO=uzairkamal@yahoo.com
```
Then:
```bash
npm start      # opens on http://localhost:3000
```
On startup the terminal shows either `Email login OK` or `Email login FAILED` with the reason, so you know right away whether Gmail accepted the password.

Keep `.env` private. It is in `.gitignore` so it is never committed.

### Other providers
Leave `GMAIL_USER` empty and fill in the `SMTP_*` lines in `.env` instead (e.g. Yahoo: `smtp.mail.yahoo.com`, port 465; Outlook: `smtp.office365.com`, port 587, `SMTP_SECURE=false`).

## Using it on a phone
Browsers only allow the live camera on **HTTPS** or `localhost`. On a phone, either:
- deploy it somewhere with HTTPS (Render, Railway, Fly.io, a VPS behind Caddy/Nginx), or
- use the **Upload** button, which opens the phone's camera app even over plain HTTP.

## API
`POST /api/send` (multipart/form-data): `photos` (1–10 JPEG/PNG files), `to`, `subject`, `body`, `format` (`pdf` or `image`).
