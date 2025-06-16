(() => {
  // --- DOM Elements ---
  const commandInput = document.getElementById('command');
  const basePathInput = document.getElementById('basePath');
  const configForm = document.getElementById('configForm');
  const uploadForm = document.getElementById('uploadForm');
  const fileInput = document.getElementById('fileInput');
  const statusDiv = document.getElementById('status');
  const lastUploadSpan = document.getElementById('lastUpload');
  const logsPre = document.getElementById('logs');
  const progressEl = document.getElementById('uploadProgress');
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');

  // --- API Helpers ---
  async function postAction(url) {
    try {
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Action failed');
      }
      fetchStatus(); // Refresh status after action
    } catch (err) {
      alert(err.message);
    }
  }

  // --- Status Update ---
  async function fetchStatus() {
    try {
      const res = await fetch('/status');
      const data = await res.json();

      // Update status text and buttons
      statusDiv.textContent = data.running ? 'Running' : 'Stopped';
      startButton.hidden = data.running;
      stopButton.hidden = !data.running;

      // Update config form and last upload date
      commandInput.value = data.command;
      basePathInput.value = data.basePath;
      if (data.lastUploadDate) {
        lastUploadSpan.textContent = new Date(data.lastUploadDate).toLocaleString();
      } else {
        lastUploadSpan.textContent = 'N/A';
      }

    } catch (err) {
      statusDiv.textContent = 'Error getting status';
    }
  }

  // --- Event Listeners ---

  // Config form
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { command: commandInput.value };
    try {
      const res = await fetch('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save config');
      alert('Config saved');
    } catch (err) {
      alert(err.message);
    }
  });

  // Upload form
  uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!fileInput.files.length) return;
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload');

    xhr.upload.addEventListener('loadstart', () => {
      progressEl.hidden = false;
      progressEl.value = 0;
    });
    xhr.upload.addEventListener('progress', (evt) => {
      if (evt.lengthComputable) {
        progressEl.value = (evt.loaded / evt.total) * 100;
      }
    });
    xhr.onload = () => {
      progressEl.hidden = true;
      if (xhr.status === 200) {
        alert('Upload successful');
        fileInput.value = '';
        fetchStatus();
      } else {
        alert('Upload failed');
      }
    };
    xhr.onerror = () => {
      progressEl.hidden = true;
      alert('Upload failed');
    };
    xhr.send(formData);
  });

  // Action buttons
  startButton.addEventListener('click', () => postAction('/start'));
  stopButton.addEventListener('click', () => postAction('/stop'));

  // --- Initialization ---

  // WebSocket for logs
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${wsProto}//${location.host}`);
  ws.onmessage = (evt) => {
    logsPre.textContent += evt.data;
    logsPre.scrollTop = logsPre.scrollHeight;
  };

  // Initial status poll
  setInterval(fetchStatus, 2000);
  fetchStatus();
})();
