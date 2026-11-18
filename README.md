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

## Setup
```bash
npm install
cp .env.example .env   # then fill in your SMTP details
npm start              # opens on http://localhost:3000
```

### SMTP settings
The app sends through any SMTP account. Most providers need an **app password**, not your normal password:

| Provider | SMTP_HOST | SMTP_PORT | SMTP_SECURE |
|---|---|---|---|
| Gmail (App Password) | smtp.gmail.com | 465 | true |
| Yahoo (App Password) | smtp.mail.yahoo.com | 465 | true |
| Outlook / Microsoft 365 | smtp.office365.com | 587 | false |

Set `MAIL_FROM` to the same address as `SMTP_USER`, otherwise many providers reject the message.

## Using it on a phone
Browsers only allow the live camera on **HTTPS** or `localhost`. On a phone, either:
- deploy it somewhere with HTTPS (Render, Railway, Fly.io, a VPS behind Caddy/Nginx), or
- use the **Upload** button, which opens the phone's camera app even over plain HTTP.

## API
`POST /api/send` (multipart/form-data): `photos` (1–10 JPEG/PNG files), `to`, `subject`, `body`, `format` (`pdf` or `image`).
