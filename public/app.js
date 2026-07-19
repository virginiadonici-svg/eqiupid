const API_BASE_URL = window.location.origin.startsWith('http') ? '' : 'https://eqiupid.onrender.com'; // native Capacitor app needs the explicit URL; web deploy uses same-origin

const screens = {
  scan: document.getElementById('scan-screen'),
  loading: document.getElementById('loading-screen'),
  result: document.getElementById('result-screen'),
  error: document.getElementById('error-screen'),
};

const video = document.getElementById('camera');
const canvas = document.getElementById('capture-canvas');
const captureBtn = document.getElementById('capture-btn');
const fileInput = document.getElementById('file-input');
const viewfinderHint = document.getElementById('viewfinder-hint');
const resultCard = document.getElementById('result-card');
const scanAgainBtn = document.getElementById('scan-again-btn');
const errorRetryBtn = document.getElementById('error-retry-btn');
const errorText = document.getElementById('error-text'); const privacyNotice = document.getElementById('privacy-notice'); const privacyAcceptBtn = document.getElementById('privacy-accept-btn');

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.remove('active'));
  screens[name].classList.add('active');
}

// ---------- Camera setup ----------

let streamRef = null;

let cameraReady = false;

async function startCamera() {
  try {
    streamRef = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    video.srcObject = streamRef;
    video.onloadedmetadata = () => {
      video.play();
      cameraReady = true;
    };
  } catch (err) {
    console.warn('Camera unavailable, falling back to file upload only.', err);
    viewfinderHint.textContent = 'Camera unavailable — use "choose a photo" below';
    captureBtn.disabled = true;
    captureBtn.style.opacity = '0.4';
  }
}

const PRIVACY_ACK_KEY = 'nurselens_privacy_ack'; if (localStorage.getItem(PRIVACY_ACK_KEY)) { privacyNotice.classList.add('hidden'); startCamera(); } else { privacyAcceptBtn.addEventListener('click', () => { localStorage.setItem(PRIVACY_ACK_KEY, '1'); privacyNotice.classList.add('hidden'); startCamera(); }); }

// ---------- Capture from live camera ----------

captureBtn.addEventListener('click', () => {
  if (!streamRef || !cameraReady || !video.videoWidth || !video.videoHeight) {
    viewfinderHint.textContent = 'Camera still starting up — wait a moment and try again.';
    return;
  }
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => submitImage(blob), 'image/jpeg', 0.9);
});

// ---------- Capture via file picker (also serves as camera fallback) ----------

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) submitImage(file);
  fileInput.value = '';
});

// ---------- Submit to backend ----------

async function submitImage(blob) {
  showScreen('loading');
  try {
    const base64 = await blobToBase64(blob);
    const response = await fetch(`${API_BASE_URL}/api/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, mediaType: blob.type || 'image/jpeg' }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'The server had trouble reading that image.');
    }

    const data = await response.json();
    renderResult(data);
    showScreen('result');
  } catch (err) {
    errorText.textContent = err.message || 'Something went wrong. Check your connection and try again.';
    showScreen('error');
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------- Render result ----------

function renderResult(data) {
  const {
    identified,
    name,
    category,
    purpose,
    how_to_use = [],
    watch_outs = [],
    confidence,
  } = data;

  if (!identified) {
    resultCard.innerHTML = `
      <p class="result-category">Not identified</p>
      <h2 class="result-name">Couldn't confidently identify this item</h2>
      <p class="low-confidence-note">Try moving closer, improving lighting, or capturing any printed label or model number on the item.</p>
    `;
    return;
  }

  const stepsHtml = how_to_use.length
    ? `<p class="result-section-label">General use</p><ol class="result-steps">${how_to_use.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
    : '';

  const watchHtml = watch_outs.length
    ? `<p class="result-section-label">Watch out for</p><ul class="result-watchouts">${watch_outs.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
    : '';

  const lowConfidenceHtml = confidence === 'low'
    ? `<p class="low-confidence-note">Low confidence — verify against the item's label before relying on this.</p>`
    : '';

  resultCard.innerHTML = `
    <p class="result-category">${escapeHtml(category || '')}</p>
    <h2 class="result-name">${escapeHtml(name || 'Unknown item')}</h2>
    <p class="result-confidence">confidence: ${escapeHtml(confidence || 'n/a')}</p>
    ${lowConfidenceHtml}
    <p class="result-section-label">Purpose</p>
    <p class="result-purpose">${escapeHtml(purpose || '')}</p>
    ${stepsHtml}
    ${watchHtml}
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Navigation ----------

scanAgainBtn.addEventListener('click', () => showScreen('scan'));
errorRetryBtn.addEventListener('click', () => showScreen('scan'));
