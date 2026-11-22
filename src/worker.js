/**
 * InvoMail Worker: serves the app (from /public) and emails what the browser sends.
 *
 * Settings (Cloudflare dashboard → Worker → Settings → Variables and Secrets):
 *   GMAIL_USER          Gmail address the email is sent FROM               (text)
 *   GMAIL_APP_PASSWORD  16-character Gmail App Password                    (secret)
 *   MAIL_TO             the only address emails go to                      (text)
 *   MAIL_SUBJECT        e.g. "Invoice {date}"                              (text, optional)
 *   MAIL_BODY           message; use \n for new lines                      (text, optional)
 *   SEND_FORMAT         "pdf" (default) or "image"                         (text, optional)
 *   TIME_ZONE           for {date}, e.g. "Europe/Brussels" (default UTC)   (text, optional)
 *   DRY_RUN             "true" to build emails without sending              (text, optional)
 *
 * The browser only sends the attachment(s). Recipient, subject and message come from
 * these settings, so the Worker can never be used to email anyone else.
 */
import { WorkerMailer } from 'worker-mailer';

const MAX_FILES = 10;
// Gmail allows 25 MB per email; attachments grow by a third when encoded.
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
const ALLOWED_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg' };
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function settings(env) {
  const timeZone = env.TIME_ZONE || 'UTC';
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone });
  const fill = (text, count) =>
    String(text).replace(/\\n/g, '\n').replace(/\{date\}/g, date).replace(/\{count\}/g, String(count));
  return {
    to: (env.MAIL_TO || '').trim(),
    subject: (count) => fill(env.MAIL_SUBJECT || 'Invoice {date}', count),
    body: (count) => fill(env.MAIL_BODY || 'Hello,\n\nPlease find the invoice attached.\n\nKind regards', count),
    format: String(env.SEND_FORMAT).toLowerCase() === 'image' ? 'image' : 'pdf',
    user: (env.GMAIL_USER || '').trim(),
    pass: (env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''), // Google shows it in groups of 4
    dryRun: String(env.DRY_RUN).toLowerCase() === 'true' || !env.GMAIL_USER || !env.GMAIL_APP_PASSWORD,
    timeZone,
  };
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function stamp(timeZone) {
  // e.g. 2026-11-22-1405 in the configured time zone
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}${p.second}`;
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Turn common SMTP failures into a message a person can act on. */
function explain(err) {
  const msg = String(err?.message || err);
  if (/535|auth|credentials|username and password/i.test(msg)) {
    return 'Gmail rejected the login. Check GMAIL_USER and use a 16-character App Password (not your normal password); 2-Step Verification must be on.';
  }
  if (/timeout|timed out|connect|socket/i.test(msg)) {
    return 'Could not reach Gmail. Please try again in a moment.';
  }
  return `Could not send email: ${msg}`;
}

async function handleSend(request, env) {
  const s = settings(env);
  if (!EMAIL_RE.test(s.to)) {
    return json({ error: 'MAIL_TO is not set to a valid email address in the Worker settings.' }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Bad upload.' }, 400);
  }
  const files = form.getAll('files').filter((f) => typeof f === 'object' && f && 'arrayBuffer' in f);
  if (!files.length) return json({ error: 'Please take or upload a photo first.' }, 400);
  if (files.length > MAX_FILES) return json({ error: `At most ${MAX_FILES} files per email.` }, 400);

  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL_BYTES) return json({ error: 'The attachment is too large for Gmail. Try fewer photos.' }, 413);

  const id = stamp(s.timeZone);
  const attachments = [];
  for (const [i, f] of files.entries()) {
    const ext = ALLOWED_TYPES[f.type];
    if (!ext) return json({ error: 'Only PDF or JPEG files can be sent.' }, 400);
    const suffix = files.length > 1 ? `-${i + 1}` : '';
    attachments.push({ filename: `invoice-${id}${suffix}.${ext}`, content: toBase64(await f.arrayBuffer()), mimeType: f.type });
  }

  // Photos count for {count}: the browser tells us how many went into the PDF.
  const count = Math.max(1, Math.min(MAX_FILES, parseInt(form.get('count'), 10) || files.length));
  const email = {
    from: { name: env.FROM_NAME || 'InvoMail', email: s.user || 'invomail@example.com' },
    to: s.to,
    subject: s.subject(count),
    text: s.body(count),
    attachments,
  };
  const names = attachments.map((a) => a.filename);

  if (s.dryRun) {
    console.log(`[DRY RUN] Would send "${email.subject}" to ${s.to} with ${names.join(', ')}`);
    return json({ ok: true, dryRun: true, to: s.to, attachments: names });
  }

  try {
    await WorkerMailer.send(
      {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        credentials: { username: s.user, password: s.pass },
        authType: ['plain', 'login'],
      },
      email
    );
  } catch (err) {
    console.error('Send failed:', err);
    return json({ error: explain(err) }, 502);
  }
  console.log(`Sent "${email.subject}" to ${s.to} (${names.join(', ')})`);
  return json({ ok: true, dryRun: false, to: s.to, attachments: names });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/config' && request.method === 'GET') {
      const s = settings(env);
      return json({ to: s.to, subject: s.subject(1), body: s.body(1), format: s.format, dryRun: s.dryRun });
    }
    if (pathname === '/api/send') {
      if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
      return handleSend(request, env);
    }
    if (pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);

    return env.ASSETS.fetch(request);
  },
};
