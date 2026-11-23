# InvoMail

A personal one-button app: take a photo of an invoice (or upload a photo or PDF) and press **Send email**. It goes to one fixed address, with a pre-written subject and message, as a PDF.

There is no server to run. The app is plain files, and everything happens in the browser, including building the PDF. A tiny [Cloudflare Worker](https://developers.cloudflare.com/workers/) (`src/worker.js`) serves those files and does the one thing a browser can't do safely: hand the PDF to Gmail using your password, which stays in the Worker's settings and never reaches the browser.

## Features
- Live camera preview with **Take photo** and **Switch** (front/back camera), plus **Upload** for existing photos or the phone's camera app
- Several photos per email (up to 10), combined into one PDF in the browser (one photo per A4 page, portrait or landscape to fit)
- **Upload PDFs** too: they are attached exactly as they are, under their own file name, next to the PDF made from your photos
- **Photo editor** (tap a photo, optional): crop (free, A4, square, full photo), rotate, flip, brightness, contrast, and B&W or **Document** looks
- **Fixed recipient, subject and message**, set in the Worker settings. The screen shows them but has nothing to type. The Worker ignores anything else the browser sends, so it can only email that one address.
- KamTech Solutions branding (same as Fill & Sign), light and dark themes
- Test mode: until Gmail is set up, emails are prepared but not sent

## Deploy to Cloudflare

### 1. Create a Gmail App Password
1. Sign in to the Gmail account you want to send **from**.
2. Turn on **2-Step Verification**: https://myaccount.google.com/signinoptions/twosv
3. Open https://myaccount.google.com/apppasswords, name it `InvoMail`, click **Create**, and copy the 16-character password.

### 2. Create the Worker
Either connect the GitHub repo in the Cloudflare dashboard (**Workers & Pages → Create → Import a repository**, build command empty, deploy command `npx wrangler deploy`), or deploy from your computer:
```bash
npm install
npx wrangler login
npm run deploy
```

### 3. Enter the settings
Cloudflare dashboard → **Workers & Pages → invomail → Settings → Variables and Secrets → Add**:

| Name | Type | Value |
|---|---|---|
| `GMAIL_USER` | Text | the Gmail address it sends from |
| `GMAIL_APP_PASSWORD` | **Secret** | the 16-character App Password |
| `MAIL_TO` | Text | `uzairkamal@yahoo.com` |
| `MAIL_SUBJECT` | Text | `Invoice {date}` *(optional; this is the default)* |
| `MAIL_BODY` | Text | e.g. `Hello,\n\nPlease find the invoice attached.\n\nKind regards` *(optional)* |
| `SEND_FORMAT` | Text | `pdf` (default) or `image` *(optional)* |
| `TIME_ZONE` | Text | for `{date}`, e.g. `Europe/Brussels` *(optional; default UTC)* |
| `FROM_NAME` | Text | sender name shown in the inbox *(optional; default InvoMail)* |

`{date}` becomes e.g. `22 Nov 2026`, `{count}` the number of photos, and `\n` starts a new line. Saving the settings redeploys the Worker; deploys keep them (`keep_vars` in `wrangler.jsonc`).

Open the Worker's URL (or add your own domain under **Settings → Domains & Routes**). The camera needs HTTPS, which Cloudflare provides.

## Try it locally
```bash
npm install
cp .dev.vars.example .dev.vars   # local settings; DRY_RUN=true means nothing is really sent
npm run dev                      # http://localhost:8787
```

## Files
- `public/` – the app (HTML, CSS, JS, KamTech logo, and the Cropper.js and jsPDF libraries in `public/vendor/`)
- `src/worker.js` – the Worker: `GET /api/config` shows the fixed settings, `POST /api/send` emails the attachment(s)
- `wrangler.jsonc` – Cloudflare configuration
