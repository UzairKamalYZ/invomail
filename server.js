require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

const PORT = Number(process.env.PORT) || 3000;
const DEFAULT_TO = process.env.DEFAULT_TO || 'uzairkamal@yahoo.com';
// Gmail shortcut: GMAIL_USER + GMAIL_APP_PASSWORD fill in the SMTP settings.
const GMAIL_USER = (process.env.GMAIL_USER || '').trim();
const GMAIL_PASS = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''); // Google shows it in groups of 4
const SMTP = GMAIL_USER
  ? { host: 'smtp.gmail.com', port: 465, secure: true, user: GMAIL_USER, pass: GMAIL_PASS }
  : {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: String(process.env.SMTP_SECURE ?? 'true').toLowerCase() === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    };
const MAIL_FROM = process.env.MAIL_FROM || (SMTP.user ? `InvoMail <${SMTP.user}>` : 'invomail@localhost');
const DRY_RUN = String(process.env.DRY_RUN).toLowerCase() === 'true' || !SMTP.host;
const MAX_PHOTOS = 10;

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_PHOTOS },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG or PNG images are accepted'));
  },
});

const transporter = DRY_RUN
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({
      host: SMTP.host,
      port: SMTP.port,
      secure: SMTP.secure,
      auth: { user: SMTP.user, pass: SMTP.pass },
    });

/** Turn common SMTP failures into a message a person can act on. */
function explainMailError(err) {
  if (err.code === 'EAUTH' || err.responseCode === 535) {
    return SMTP.host === 'smtp.gmail.com'
      ? 'Gmail rejected the login. Check GMAIL_USER and use a 16-character App Password (not your normal password); 2-Step Verification must be on.'
      : 'The email server rejected the login. Check the SMTP username and password.';
  }
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(err.code)) {
    return `Could not reach the email server (${SMTP.host}). Check the internet connection.`;
  }
  return `Could not send email: ${err.message}`;
}

/** Build a PDF with one photo per A4 page, scaled to fit. */
function imagesToPdf(files) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      for (const f of files) {
        doc.addPage({ size: 'A4', margin: 36 });
        const { width, height, margins } = doc.page;
        doc.image(f.buffer, margins.left, margins.top, {
          fit: [width - margins.left - margins.right, height - margins.top - margins.bottom],
          align: 'center',
          valign: 'center',
        });
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function stamp() {
  return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (_req, res) => {
  res.json({ defaultTo: DEFAULT_TO, dryRun: DRY_RUN });
});

app.post('/api/send', upload.array('photos', MAX_PHOTOS), async (req, res) => {
  try {
    const files = req.files || [];
    const to = String(req.body.to || DEFAULT_TO).trim();
    const subject = String(req.body.subject || 'Photo from InvoMail').trim().slice(0, 200);
    const body = String(req.body.body || '').slice(0, 10000);
    const format = req.body.format === 'image' ? 'image' : 'pdf';

    if (!files.length) return res.status(400).json({ error: 'Please take at least one photo.' });
    if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'Recipient email address is not valid.' });

    const id = stamp();
    let attachments;
    if (format === 'pdf') {
      attachments = [
        { filename: `photo-${id}.pdf`, content: await imagesToPdf(files), contentType: 'application/pdf' },
      ];
    } else {
      attachments = files.map((f, i) => {
        const ext = f.mimetype === 'image/png' ? 'png' : 'jpg';
        return { filename: `photo-${id}-${i + 1}.${ext}`, content: f.buffer, contentType: f.mimetype };
      });
    }

    const info = await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      text: body || 'Please find the attached photo(s).',
      attachments,
    });

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would send "${subject}" to ${to} with ${attachments.map((a) => a.filename).join(', ')}`);
    } else {
      console.log(`Sent "${subject}" to ${to} (${info.messageId})`);
    }

    res.json({
      ok: true,
      dryRun: DRY_RUN,
      to,
      attachments: attachments.map((a) => ({ filename: a.filename, bytes: a.content.length })),
    });
  } catch (err) {
    console.error('Send failed:', err);
    res.status(500).json({ error: explainMailError(err) });
  }
});

// Multer / validation errors
app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || 'Bad request' });
});

app.listen(PORT, () => {
  console.log(`InvoMail running at http://localhost:${PORT}`);
  if (DRY_RUN) {
    console.log('TEST MODE: emails are logged, not sent. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env to send for real.');
    return;
  }
  transporter
    .verify()
    .then(() => console.log(`Email login OK: sending from ${SMTP.user} via ${SMTP.host}`))
    .catch((err) => console.error(`Email login FAILED: ${explainMailError(err)}`));
});
