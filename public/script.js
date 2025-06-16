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
  // ENV Elements
  const envSelect = document.getElementById('envSelect');
  const envNameInput = document.getElementById('envName');
  const envContentArea = document.getElementById('envContent');
  const saveEnvButton = document.getElementById('saveEnvButton');
  const deleteEnvButton = document.getElementById('deleteEnvButton');

  let currentEnvs = [];
  let selectedEnvFromServer = null;

  // --- API Helpers ---
  async function apiCall(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(errData.error);
    }
    return res.status === 204 ? null : res.json();
  }

  // --- Main Status & Config Update ---
  async function fetchStatus() {
    try {
      const data = await apiCall('/status');
      statusDiv.textContent = data.running ? 'Running' : 'Stopped';
      startButton.hidden = data.running;
      stopButton.hidden = !data.running;
      commandInput.value = data.command;
      basePathInput.value = data.basePath || 'N/A';
      lastUploadSpan.textContent = data.lastUploadDate ? new Date(data.lastUploadDate).toLocaleString() : 'N/A';
      selectedEnvFromServer = data.selectedEnv;
      updateEnvDropdown();
    } catch (err) {
      statusDiv.textContent = 'Error getting status';
      console.error(err);
    }
  }

  // --- ENV Management ---
  async function fetchEnvs() {
    try {
      currentEnvs = await apiCall('/api/envs');
      updateEnvDropdown();
    } catch (err) {
      alert(`Error fetching envs: ${err.message}`);
    }
  }

  function updateEnvDropdown() {
    const currentVal = envSelect.value;
    envSelect.innerHTML = '<option value="">[None]</option><option value="__new__">[Create New]</option>';
    currentEnvs.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      envSelect.appendChild(option);
    });
    envSelect.value = selectedEnvFromServer || (currentEnvs.includes(currentVal) ? currentVal : '');
    handleEnvSelection();
  }

  async function handleEnvSelection() {
    const selected = envSelect.value;
    if (selected === '__new__') {
      envNameInput.value = '';
      envContentArea.value = '';
      envNameInput.readOnly = false;
      deleteEnvButton.hidden = true;
    } else if (selected) {
      try {
        const data = await apiCall(`/api/envs/${selected}`);
        envNameInput.value = data.name;
        envContentArea.value = data.content;
        envNameInput.readOnly = true;
        deleteEnvButton.hidden = false;
      } catch (err) {
        alert(`Error loading env: ${err.message}`);
      }
    } else {
      envNameInput.value = '';
      envContentArea.value = '';
      envNameInput.readOnly = true;
      deleteEnvButton.hidden = true;
    }
  }

  // --- Event Listeners ---

  // Main config form
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiCall('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: commandInput.value }),
      });
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
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) progressEl.value = (evt.loaded / evt.total) * 100;
    };
    xhr.onloadstart = () => { progressEl.hidden = false; progressEl.value = 0; };
    xhr.onload = () => {
      progressEl.hidden = true;
      alert(xhr.responseText);
      if (xhr.status === 200) fetchStatus();
    };
    xhr.onerror = () => { progressEl.hidden = true; alert('Upload failed'); };
    xhr.send(formData);
  });

  // Action buttons
  startButton.addEventListener('click', () => apiCall('/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: commandInput.value }),
  }).then(fetchStatus).catch(alert));
  stopButton.addEventListener('click', () => apiCall('/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }).then(fetchStatus).catch(alert));

  // ENV Listeners
  envSelect.addEventListener('change', async () => {
    const selected = envSelect.value;
    if (selected !== '__new__') {
      try {
        await apiCall('/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedEnv: selected || null }),
        });
        selectedEnvFromServer = selected;
      } catch (err) {
        alert(`Failed to set active env: ${err.message}`);
      }
    }
    handleEnvSelection();
  });

  saveEnvButton.addEventListener('click', async () => {
    const name = envNameInput.value.trim();
    if (!name) return alert('Config Name is required.');
    try {
      await apiCall('/api/envs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content: envContentArea.value }),
      });
      alert('Environment config saved.');
      selectedEnvFromServer = name; // Select the newly saved env
      await fetchEnvs(); // this will re-render dropdown and select the new one
    } catch (err) {
      alert(`Error saving env: ${err.message}`);
    }
  });

  deleteEnvButton.addEventListener('click', async () => {
    const name = envNameInput.value;
    if (!name || !confirm(`Are you sure you want to delete the '${name}' config?`)) return;
    try {
      await apiCall(`/api/envs/${name}`, { method: 'DELETE' });
      alert('Environment config deleted.');
      envNameInput.value = '';
      envContentArea.value = '';
      selectedEnvFromServer = null; // Unset selection
      await fetchEnvs();
    } catch (err) {
      alert(`Error deleting env: ${err.message}`);
    }
  });

  // --- Initialization ---
  function init() {
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProto}//${location.host}`);
    ws.onmessage = (evt) => {
      logsPre.textContent += evt.data;
      logsPre.scrollTop = logsPre.scrollHeight;
    };

    fetchEnvs();
    setInterval(fetchStatus, 5000); // Poll less frequently
    fetchStatus();
  }

  init();
})();
