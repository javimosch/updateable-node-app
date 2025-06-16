(() => {
  const commandInput = document.getElementById('command');
  const basePathInput = document.getElementById('basePath');
  const configForm = document.getElementById('configForm');
  const uploadForm = document.getElementById('uploadForm');
  const fileInput = document.getElementById('fileInput');
  const statusDiv = document.getElementById('status');
  const logsPre = document.getElementById('logs');
  const progressEl = document.getElementById('uploadProgress');

  // Helper to update status
  async function fetchStatus() {
    try {
      const res = await fetch('/status');
      const data = await res.json();
      statusDiv.textContent = data.running ? 'Running' : 'Stopped';
    } catch (err) {
      statusDiv.textContent = 'Error getting status';
    }
  }

  // Poll status every 2s
  setInterval(fetchStatus, 2000);
  fetchStatus();

  // WebSocket for logs
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${wsProto}//${location.host}`);
  ws.onmessage = (evt) => {
    logsPre.textContent += evt.data;
    logsPre.scrollTop = logsPre.scrollHeight;
  };

  // Handle config form submit
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      command: commandInput.value,
      basePath: basePathInput.value,
    };
    try {
      const res = await fetch('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      alert('Config saved');
    } catch (err) {
      alert('Error saving config');
    }
  });

  // Handle upload form submit
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
        const percent = (evt.loaded / evt.total) * 100;
        progressEl.value = percent;
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
})();
