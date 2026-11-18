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
  const toInput = document.getElementById('to');

  const photos = []; // { blob, url }
  let stream = null;
  let facingMode = 'environment';

  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      if (!toInput.value) toInput.value = cfg.defaultTo;
      if (cfg.dryRun) setStatus('Server is in test mode: emails are logged, not actually sent.', '');
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
    photos.push({ blob, url: URL.createObjectURL(blob) });
    renderThumbs();
  }

  function renderThumbs() {
    thumbs.innerHTML = '';
    photos.forEach((p, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'thumb';
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = `Photo ${i + 1}`;
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
      thumbs.append(wrap);
    });
    sendBtn.disabled = photos.length === 0;
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!photos.length) return setStatus('Take a photo first.', 'err');

    const data = new FormData(form);
    photos.forEach((p, i) => data.append('photos', p.blob, `photo-${i + 1}.jpg`));

    sendBtn.disabled = true;
    setStatus('Sending…', '');
    try {
      const res = await fetch('/api/send', { method: 'POST', body: data });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Server error (${res.status})`);
      setStatus(
        json.dryRun
          ? `Test mode: email to ${json.to} was prepared but not sent.`
          : `Email sent to ${json.to}.`,
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
