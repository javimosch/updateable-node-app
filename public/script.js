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
  const logFilterInput = document.getElementById('logFilter');
  const clearLogsButton = document.getElementById('clearLogsButton');

  // Store all log lines
  let allLogs = [];

  function renderLogs() {
    const filter = logFilterInput?.value?.toLowerCase() || '';
    const filtered = filter
      ? allLogs.filter(line => line.toLowerCase().includes(filter))
      : allLogs;
    logsPre.textContent = filtered.join('');
    logsPre.scrollTop = logsPre.scrollHeight;
    console.debug('[Logs] Rendered', { filter, count: filtered.length });
  }
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

  // --- UI Helper Functions ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} fixed top-4 right-4 w-auto z-50 shadow-lg`;
    toast.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}-circle"></i>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function updateStatusBadge(running) {
    statusDiv.className = running ? 'stat-value text-lg text-success' : 'stat-value text-lg text-error';
    statusDiv.textContent = running ? 'Running' : 'Stopped';
  }

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
      updateStatusBadge(data.running);
      startButton.hidden = data.running;
      stopButton.hidden = !data.running;
      commandInput.value = data.command;
      basePathInput.value = data.basePath || 'N/A';
      lastUploadSpan.textContent = data.lastUploadDate ? new Date(data.lastUploadDate).toLocaleString() : 'N/A';
      selectedEnvFromServer = data.selectedEnv;
      updateEnvDropdown();
    } catch (err) {
      statusDiv.textContent = 'Error getting status';
      statusDiv.className = 'stat-value text-lg text-error';
      console.error(err);
    }
  }

  // --- Deployment Management ---
  const deploymentsList = document.getElementById('deploymentsList');
  const currentDeploymentSpan = document.getElementById('currentDeployment');
  const currentDeploymentText = document.getElementById('currentDeploymentText');

  async function fetchDeployments() {
    try {
      const [versions, currentObj] = await Promise.all([
        apiCall('/api/deployments'),
        apiCall('/api/deployment/current'),
      ]);
      renderDeployments(versions, currentObj.current);
    } catch (err) {
      deploymentsList.innerHTML = '<li class="text-error">Failed to load deployments</li>';
      currentDeploymentSpan.textContent = 'N/A';
      currentDeploymentText.textContent = 'N/A';
      console.debug('[Deployments] Error:', err);
    }
  }

  function renderDeployments(versions, current) {
    deploymentsList.innerHTML = '';
    currentDeploymentSpan.textContent = current || 'N/A';
    currentDeploymentText.textContent = current || 'N/A';
    
    if (!versions?.length) {
      deploymentsList.innerHTML = '<li class="text-base-content/60">No deployments found</li>';
      return;
    }
    
    versions.forEach(version => {
      const li = document.createElement('li');
      li.className = 'flex justify-between items-center p-2 bg-base-200 rounded-lg';
      
      const versionSpan = document.createElement('span');
      versionSpan.textContent = version;
      versionSpan.className = version === current ? 'font-bold text-primary' : '';
      
      li.appendChild(versionSpan);
      
      if (version !== current) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-outline btn-secondary';
        btn.innerHTML = '<i class="fas fa-undo mr-1"></i>Rollback';
        btn.onclick = async () => {
          if (!confirm(`Rollback to deployment ${version}?`)) return;
          btn.disabled = true;
          btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span>Rolling back...';
          try {
            await apiCall(`/api/deployments/rollback/${version}`, { method: 'POST' });
            await fetchDeployments();
            await fetchStatus();
            showToast(`Rolled back to ${version}`, 'success');
          } catch (err) {
            showToast(`Failed to rollback: ${err.message}`, 'error');
            console.debug('[Deployments] Rollback error:', err);
          } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-undo mr-1"></i>Rollback';
          }
        };
        li.appendChild(btn);
      } else {
        const badge = document.createElement('span');
        badge.className = 'badge badge-primary';
        badge.textContent = 'Current';
        li.appendChild(badge);
      }
      
      deploymentsList.appendChild(li);
    });
    console.debug('[Deployments] Rendered', { versions, current });
  }

  // --- ENV Management ---
  async function fetchEnvs() {
    try {
      currentEnvs = await apiCall('/api/envs');
      updateEnvDropdown();
    } catch (err) {
      showToast(`Error fetching envs: ${err.message}`, 'error');
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
        showToast(`Error loading env: ${err.message}`, 'error');
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
      showToast('Configuration saved successfully', 'success');
    } catch (err) {
      showToast(err.message, 'error');
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
      if (evt.lengthComputable) {
        const percent = (evt.loaded / evt.total) * 100;
        progressEl.value = percent;
      }
    };
    
    xhr.onloadstart = () => { 
      progressEl.hidden = false; 
      progressEl.value = 0; 
    };
    
    xhr.onload = () => {
      progressEl.hidden = true;
      if (xhr.status === 200) {
        showToast('Upload successful! Application deployed.', 'success');
        fetchStatus();
        fetchDeployments();
      } else {
        showToast('Upload failed', 'error');
      }
    };
    
    xhr.onerror = () => { 
      progressEl.hidden = true; 
      showToast('Upload failed', 'error');
    };
    
    xhr.send(formData);
  });

  // Action buttons
  startButton.addEventListener('click', async () => {
    try {
      await apiCall('/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: commandInput.value }),
      });
      showToast('Application started', 'success');
      fetchStatus();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  stopButton.addEventListener('click', async () => {
    try {
      await apiCall('/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      showToast('Application stopped', 'success');
      fetchStatus();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

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
        showToast(`Failed to set active env: ${err.message}`, 'error');
      }
    }
    handleEnvSelection();
  });

  saveEnvButton.addEventListener('click', async () => {
    const name = envNameInput.value.trim();
    if (!name) {
      showToast('Config Name is required.', 'error');
      return;
    }
    try {
      await apiCall('/api/envs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content: envContentArea.value }),
      });
      showToast('Environment config saved.', 'success');
      selectedEnvFromServer = name;
      await fetchEnvs();
    } catch (err) {
      showToast(`Error saving env: ${err.message}`, 'error');
    }
  });

  deleteEnvButton.addEventListener('click', async () => {
    const name = envNameInput.value;
    if (!name || !confirm(`Are you sure you want to delete the '${name}' config?`)) return;
    try {
      await apiCall(`/api/envs/${name}`, { method: 'DELETE' });
      showToast('Environment config deleted.', 'success');
      envNameInput.value = '';
      envContentArea.value = '';
      selectedEnvFromServer = null;
      await fetchEnvs();
    } catch (err) {
      showToast(`Error deleting env: ${err.message}`, 'error');
    }
  });

  // --- Initialization ---
  function init() {
    fetchDeployments();
    setInterval(fetchDeployments, 10000);

    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProto}//${location.host}`);
    ws.onmessage = (evt) => {
      allLogs.push(evt.data);
      renderLogs();
      console.debug('[Logs] Received message', evt.data);
    };

    fetchEnvs();
    setInterval(fetchStatus, 5000);
    fetchStatus();
  }

  // Log filter event
  logFilterInput?.addEventListener('input', () => {
    renderLogs();
    console.debug('[Logs] Filter input', logFilterInput?.value);
  });

  // Clear logs event
  clearLogsButton?.addEventListener('click', () => {
    allLogs = [];
    renderLogs();
    showToast('Logs cleared', 'info');
    console.debug('[Logs] Cleared');
  });

  init();
})();
