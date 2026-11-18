/* Photo editor: crop, rotate, flip, brightness/contrast and B&W / Document looks.
 * Usage: PhotoEditor.open(originalBlob, previousState) -> Promise<{ blob, state } | null>
 * Edits are always applied to the original photo, so re-editing never loses quality. */
window.PhotoEditor = (() => {
  const MAX_DIM = 2000;
  const ASPECTS = { free: NaN, a4: 210 / 297, 1: 1 };

  const el = document.getElementById('editor');
  const img = document.getElementById('edImg');
  const bright = document.getElementById('edBright');
  const contrast = document.getElementById('edContrast');
  const aspectRow = document.getElementById('edAspect');
  const filterRow = document.getElementById('edFilter');

  let cropper = null;
  let url = null;
  let resolveFn = null;
  let look = 'none';

  /** Brightness/contrast multipliers for the current settings. */
  function params() {
    const doc = look === 'doc';
    return {
      gray: look !== 'none',
      b: (bright.value / 100) * (doc ? 1.1 : 1),
      c: (contrast.value / 100) * (doc ? 1.8 : 1),
    };
  }

  /** Live preview uses CSS filters; the saved photo uses the same maths on pixels. */
  function updatePreview() {
    const { gray, b, c } = params();
    el.style.setProperty('--ed-filter', `${gray ? 'grayscale(1) ' : ''}brightness(${b}) contrast(${c})`);
  }

  function applyPixels(canvas) {
    const { gray, b, c } = params();
    if (!gray && b === 1 && c === 1) return;
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let v = Math.min(1, (i / 255) * b);
      v = Math.min(1, Math.max(0, (v - 0.5) * c + 0.5));
      lut[i] = Math.round(v * 255);
    }
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      if (gray) {
        const l = lut[Math.round(0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2])];
        p[i] = p[i + 1] = p[i + 2] = l;
      } else {
        p[i] = lut[p[i]];
        p[i + 1] = lut[p[i + 1]];
        p[i + 2] = lut[p[i + 2]];
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  function setOn(row, attr, value) {
    row.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === value));
  }

  /** Scale the (possibly rotated) photo to fit the screen and select all of it. */
  function fitAndSelectAll() {
    const cont = cropper.getContainerData();
    const can = cropper.getCanvasData();
    const s = Math.min(cont.width / can.width, cont.height / can.height);
    const w = can.width * s;
    const h = can.height * s;
    cropper.setCanvasData({ left: (cont.width - w) / 2, top: (cont.height - h) / 2, width: w, height: h });
    const fitted = cropper.getCanvasData();
    cropper.setCropBoxData({ left: fitted.left, top: fitted.top, width: fitted.width, height: fitted.height });
  }

  function setAspect(key) {
    if (key === 'full') {
      cropper.setAspectRatio(NaN);
      fitAndSelectAll();
      key = 'free';
    } else {
      cropper.setAspectRatio(ASPECTS[key]);
    }
    setOn(aspectRow, 'aspect', key);
  }

  function setLook(key) {
    look = key;
    setOn(filterRow, 'filter', key);
    updatePreview();
  }

  function close(result) {
    cropper?.destroy();
    cropper = null;
    if (url) URL.revokeObjectURL(url);
    url = null;
    el.hidden = true;
    document.body.style.overflow = '';
    resolveFn?.(result);
    resolveFn = null;
  }

  function open(original, state) {
    return new Promise((resolve) => {
      resolveFn = resolve;
      const s = state || {};
      bright.value = s.bright ?? 100;
      contrast.value = s.contrast ?? 100;
      setLook(s.look || 'none');
      setOn(aspectRow, 'aspect', s.aspect || 'free');

      el.hidden = false;
      document.body.style.overflow = 'hidden';
      url = URL.createObjectURL(original);
      img.onload = () => {
        cropper = new Cropper(img, {
          viewMode: 1,
          autoCropArea: 1,
          background: false,
          checkOrientation: false,
          toggleDragModeOnDblclick: false,
          aspectRatio: ASPECTS[s.aspect || 'free'],
          ready() {
            if (s.data) {
              cropper.rotateTo(s.data.rotate || 0);
              cropper.scaleX(s.data.scaleX || 1);
              fitAndSelectAll();
              cropper.setData(s.data);
            }
          },
        });
      };
      img.src = url;
    });
  }

  // ----- Controls -----
  el.querySelectorAll('[data-rotate]').forEach((b) =>
    b.addEventListener('click', () => {
      cropper.rotate(Number(b.dataset.rotate));
      fitAndSelectAll();
    })
  );
  document.getElementById('edFlip').addEventListener('click', () => {
    cropper.scaleX(-(cropper.getData().scaleX || 1));
  });
  document.getElementById('edReset').addEventListener('click', () => {
    cropper.reset();
    cropper.setAspectRatio(NaN);
    setOn(aspectRow, 'aspect', 'free');
    fitAndSelectAll();
    bright.value = 100;
    contrast.value = 100;
    setLook('none');
  });
  aspectRow.querySelectorAll('[data-aspect]').forEach((b) => b.addEventListener('click', () => setAspect(b.dataset.aspect)));
  filterRow.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => setLook(b.dataset.filter)));
  bright.addEventListener('input', updatePreview);
  contrast.addEventListener('input', updatePreview);

  document.getElementById('edCancel').addEventListener('click', () => close(null));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.hidden) close(null);
  });

  document.getElementById('edSave').addEventListener('click', () => {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({
      maxWidth: MAX_DIM,
      maxHeight: MAX_DIM,
      fillColor: '#fff',
      imageSmoothingQuality: 'high',
    });
    applyPixels(canvas);
    const active = aspectRow.querySelector('.on')?.dataset.aspect || 'free';
    const state = {
      data: cropper.getData(),
      bright: Number(bright.value),
      contrast: Number(contrast.value),
      look,
      aspect: active,
    };
    canvas.toBlob((blob) => close(blob ? { blob, state } : null), 'image/jpeg', 0.9);
  });

  return { open };
})();
