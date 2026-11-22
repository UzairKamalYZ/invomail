# InvoMail

A personal one-button app: take a photo of an invoice (or upload one) and press **Send email**. It goes to one fixed address with a pre-written subject and message, attached as a PDF.

## Features
- Live camera preview with **Take photo** and **Switch** (front/back camera on phones)
- **Upload** button: opens the phone camera or picks existing photos (also the fallback when the live camera is blocked)
- Several photos per email (up to 10), sent as one multi-page **PDF** (one photo per A4 page) or as separate JPEGs
- **Photo editor** (tap a photo, optional): crop (free, A4, square, or full photo), rotate, flip, brightness and contrast, and B&W or **Document** looks that make paperwork crisp. Edits are applied to the original photo, so you can reopen and change them without losing quality.
- **Fixed recipient, subject and message**, set once in `.env`. The screen shows them but has nothing to type. The server ignores anything else the browser sends, so the app can only ever email that one address.
- Styled with the KamTech Solutions brand, the same as Fill & Sign (pdf.kamtechsolutions.eu). Light and dark themes follow your device, with a switch in the header.
- Test mode: if no email account is set up, emails are logged instead of sent

### What gets sent
Set in `.env` (see `.env.example`):

| Setting | Default | |
|---|---|---|
| `MAIL_TO` | `uzairkamal@yahoo.com` | the only address the app sends to |
| `MAIL_SUBJECT` | `Invoice {date}` | `{date}` becomes e.g. `22 Nov 2026`, `{count}` the number of photos |
| `MAIL_BODY` | `Hello, … Please find the invoice attached. …` | use `\n` for a new line |
| `SEND_FORMAT` | `pdf` | or `image` for separate JPEGs |

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
`POST /api/send` (multipart/form-data): `photos` (1–10 JPEG/PNG files). Recipient, subject, message and format come from `.env` only.
