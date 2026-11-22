(() => {
  const MAX_DIM = 2000; // longest side of the saved photo, in pixels
  const MAX_PHOTOS = 10;

  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const cameraMsg = document.getElementById('cameraMsg');
  const captureBtn = document.getElementById('captureBtn');
  const switchBtn = document.getElementById('switchBtn');
  const fileInput = document.getElementById('fileInput');
  const thumbs = document.getElementById('thumbs');
  const form = document.getElementById('mailForm');
  const sendBtn = document.getElementById('sendBtn');
  const statusEl = document.getElementById('status');
  const editHint = document.getElementById('editHint');

  // original: photo as taken; blob: what gets sent (edited or original); state: editor settings
  const photos = []; // { original, blob, url, state }
  let stream = null;
  let facingMode = 'environment';
  let sendFormat = 'pdf';

  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      document.getElementById('sumTo').textContent = cfg.to;
      document.getElementById('sumSubject').textContent = cfg.subject;
      sendFormat = cfg.format === 'image' ? 'image' : 'pdf';
      document.getElementById('sumFormat').textContent = sendFormat === 'image' ? 'Image (JPEG)' : 'PDF';
      document.getElementById('sumBody').textContent = cfg.body;
      if (cfg.dryRun) setStatus('Test mode: add the Gmail settings to the Worker to send for real.', '');
    })
    .catch(() => {});

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  function showCameraMsg(msg) {
    cameraMsg.textContent = msg;
    cameraMsg.hidden = !msg;
  }

  async function startCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      showCameraMsg('Live camera is not available here (it needs HTTPS or localhost). Use "Upload" to take or pick a photo.');
      captureBtn.disabled = true;
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      video.srcObject = stream;
      showCameraMsg('');
      captureBtn.disabled = false;
    } catch (err) {
      showCameraMsg('Could not open the camera (' + err.name + '). Use "Upload" to take or pick a photo.');
      captureBtn.disabled = true;
    }
  }

  /** Draw a source onto the canvas, downscaled, and return a JPEG blob. */
  function toJpeg(source, w, h) {
    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  }

  function addPhoto(blob) {
    if (photos.length >= MAX_PHOTOS) {
      setStatus(`You can attach up to ${MAX_PHOTOS} photos.`, 'err');
      return;
    }
    photos.push({ original: blob, blob, url: URL.createObjectURL(blob), state: null });
    renderThumbs();
  }

  function renderThumbs() {
    thumbs.innerHTML = '';
    photos.forEach((p, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'thumb';
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = `Photo ${i + 1} (tap to edit)`;
      img.title = 'Tap to crop or edit';
      img.onclick = () => editPhoto(p);
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = 'Remove';
      del.onclick = () => {
        URL.revokeObjectURL(p.url);
        photos.splice(i, 1);
        renderThumbs();
      };
      wrap.append(img, del);
      if (p.state) {
        const tag = document.createElement('span');
        tag.className = 'edited';
        tag.textContent = 'Edited';
        wrap.append(tag);
      }
      thumbs.append(wrap);
    });
    sendBtn.disabled = photos.length === 0;
    editHint.hidden = photos.length === 0;
  }

  async function editPhoto(p) {
    const result = await PhotoEditor.open(p.original, p.state);
    if (!result) return;
    URL.revokeObjectURL(p.url);
    p.blob = result.blob;
    p.state = result.state;
    p.url = URL.createObjectURL(result.blob);
    renderThumbs();
  }

  captureBtn.addEventListener('click', async () => {
    if (!video.videoWidth) return;
    addPhoto(await toJpeg(video, video.videoWidth, video.videoHeight));
  });

  switchBtn.addEventListener('click', () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    startCamera();
  });

  fileInput.addEventListener('change', async () => {
    for (const file of fileInput.files) {
      try {
        const bmp = await createImageBitmap(file);
        addPhoto(await toJpeg(bmp, bmp.width, bmp.height));
        bmp.close?.();
      } catch {
        setStatus(`Could not read "${file.name}". Try a JPEG or PNG.`, 'err');
      }
    }
    fileInput.value = '';
  });

  /** Build one A4 PDF in the browser: one photo per page, scaled to fit. */
  async function buildPdf(blobs) {
    const { jsPDF } = window.jspdf;
    const margin = 28; // points (about 1 cm)
    let doc = null;
    for (const blob of blobs) {
      const bmp = await createImageBitmap(blob);
      const landscape = bmp.width > bmp.height;
      bmp.close?.();
      const orientation = landscape ? 'landscape' : 'portrait';
      if (!doc) doc = new jsPDF({ unit: 'pt', format: 'a4', orientation, compress: true });
      else doc.addPage('a4', orientation);
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const { width, height } = doc.getImageProperties(bytes);
      const scale = Math.min((pw - 2 * margin) / width, (ph - 2 * margin) / height);
      const w = width * scale;
      const h = height * scale;
      doc.addImage(bytes, 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
    }
    return doc.output('blob');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!photos.length) return setStatus('Take a photo first.', 'err');

    sendBtn.disabled = true;
    try {
      const data = new FormData();
      data.append('count', String(photos.length));
      if (sendFormat === 'pdf') {
        setStatus('Making the PDF…', '');
        data.append('files', await buildPdf(photos.map((p) => p.blob)), 'invoice.pdf');
      } else {
        photos.forEach((p, i) => data.append('files', p.blob, `photo-${i + 1}.jpg`));
      }
      setStatus('Sending…', '');
      const res = await fetch('/api/send', { method: 'POST', body: data });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Server error (${res.status})`);
      setStatus(
        json.dryRun
          ? `Test mode: email to ${json.to} was prepared but not sent.`
          : `Sent to ${json.to}. Ready for the next invoice.`,
        'ok'
      );
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      photos.length = 0;
      renderThumbs();
    } catch (err) {
      setStatus(err.message, 'err');
      sendBtn.disabled = photos.length === 0;
    }
  });

  startCamera();
})();

/* ---------- Theme toggle and footer year ---------- */
(() => {
  document.getElementById('yr').textContent = new Date().getFullYear();
  document.getElementById('theme').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('im-theme', root.dataset.theme); } catch (e) {}
  });
})();
