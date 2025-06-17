(() => {
  // --- DOM Elements ---
  const commandInput = document.getElementById('command');
  const basePathInput = document.getElementById('basePath');
  const persistentFoldersInput = document.getElementById('persistentFolders');
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
  let isCreatingNewEnv = false; // Track when user is creating new env
  let isEditingEnvContent = false; // Track when user is editing envContent

  // --- ENV Content Editing State ---
  envContentArea.addEventListener('focus', () => {
    isEditingEnvContent = true;
    console.debug('[EnvContent] Editing started');
  });
  envContentArea.addEventListener('blur', () => {
    isEditingEnvContent = false;
    console.debug('[EnvContent] Editing ended');
  });

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

  // Track user editing state for command/basePath/persistentFolders
  let isEditingCommand = false;
  let isEditingBasePath = false;
  let isEditingPersistentFolders = false;

  commandInput.addEventListener('focus', () => { isEditingCommand = true; });
  commandInput.addEventListener('blur', () => { isEditingCommand = false; });
  basePathInput.addEventListener('focus', () => { isEditingBasePath = true; });
  basePathInput.addEventListener('blur', () => { isEditingBasePath = false; });
  persistentFoldersInput.addEventListener('focus', () => { isEditingPersistentFolders = true; });
  persistentFoldersInput.addEventListener('blur', () => { isEditingPersistentFolders = false; });

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
      if (!isEditingCommand) commandInput.value = data.command;
      if (!isEditingBasePath) basePathInput.value = data.basePath || 'N/A';
      if (!isEditingPersistentFolders) persistentFoldersInput.value = data.persistentFoldersUI || '';
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
      // Convert versions to deployment objects with formatted date
      const deployments = versions.map(version => ({
        version,
        date: formatVersionToDate(version)
      }));
      renderDeployments(deployments, currentObj.current);
    } catch (err) {
      deploymentsList.innerHTML = '<li class="text-error">Failed to load deployments</li>';
      currentDeploymentSpan.textContent = 'N/A';
      currentDeploymentText.textContent = 'N/A';
      console.debug('[Deployments] Error:', err);
    }
  }

  // Helper function to format deployment version string to human-readable date
  function formatVersionToDate(version) {
    try {
      //Assume version = 2025-06-17T13-53-57-029Z
      

      //First split by T
      const [datePart, timePart] = version.split('T');
      if (!timePart) return version;

      //I want to render DD/MM/YYYY HH:mm:ss
      const [year, month, day] = datePart.split('-');
      const [hours, minutes, seconds] = timePart.split('-');
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch (err) {
      console.error('Failed to format version:', version, err);
      return version;
    }
  }

  function renderDeployments(deployments, current) {
    let currentFormatted = formatVersionToDate(current);
    deploymentsList.innerHTML = '';
    currentDeploymentSpan.textContent = currentFormatted || 'N/A';
    currentDeploymentText.textContent = currentFormatted || 'N/A';

    if (!deployments?.length) {
      deploymentsList.innerHTML = '<li class="text-base-content/60">No deployments found</li>';
      return;
    }

    deployments.forEach(deployment => {
      const { version, date } = deployment;
      const li = document.createElement('li');
      li.className = 'flex justify-between items-center p-2 bg-base-200 rounded-lg';

      // Version and date container
      const versionContainer = document.createElement('div');
      versionContainer.className = 'flex flex-col';

      const dateDiv = document.createElement('div');
      dateDiv.textContent = date;
      if (version === current) {
        dateDiv.className = 'font-bold text-primary';
      }

      const versionDiv = document.createElement('div');
      versionDiv.textContent = version;
      versionDiv.className = 'text-xs opacity-75';

      versionContainer.appendChild(dateDiv);
      versionContainer.appendChild(versionDiv);

      li.appendChild(versionContainer);

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
    console.debug('[Deployments] Rendered', { deployments, current });
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
    // Preserve "[Create New]" selection or use server selection
    if (isCreatingNewEnv) {
      envSelect.value = '__new__';
    } else {
      envSelect.value = selectedEnvFromServer || (currentEnvs.includes(currentVal) ? currentVal : '');
    }
    handleEnvSelection();
  }

  async function handleEnvSelection() {
    const selected = envSelect.value;
    if (selected === '__new__') {
      isCreatingNewEnv = true;
      // Only clear inputs if they're empty or this is a direct user selection change
      // Don't clear if user is actively typing (preserve existing values)
      if (!envNameInput.value.trim()) {
        envNameInput.value = '';
      }
      if (!envContentArea.value.trim()) {
        envContentArea.value = '';
      }
      envNameInput.readOnly = false;
      deleteEnvButton.hidden = true;
    } else if (selected) {
      isCreatingNewEnv = false;
      try {
        const data = await apiCall(`/api/envs/${selected}`);
        envNameInput.value = data.name;
        if (!isEditingEnvContent) {
          envContentArea.value = data.content;
          console.debug('[EnvContent] Updated from server', data.content);
        } else {
          console.debug('[EnvContent] Skipped update, user editing');
        }
        envNameInput.readOnly = true;
        deleteEnvButton.hidden = false;
      } catch (err) {
        showToast(`Error loading env: ${err.message}`, 'error');
      }
    } else {
      isCreatingNewEnv = false;
      envNameInput.value = '';
      if (!isEditingEnvContent) {
        envContentArea.value = '';
        console.debug('[EnvContent] Cleared');
      } else {
        console.debug('[EnvContent] Skipped clear, user editing');
      }
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
        body: JSON.stringify({ 
          command: commandInput.value,
          persistentFoldersUI: persistentFoldersInput.value
        }),
      });
      showToast('Configuration saved', 'success');
      fetchStatus();
    } catch (err) {
      showToast(`Error saving config: ${err.message}`, 'error');
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
      isCreatingNewEnv = false;
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
      isCreatingNewEnv = false; // Reset after saving
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
      isCreatingNewEnv = false; // Reset after deleting
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
