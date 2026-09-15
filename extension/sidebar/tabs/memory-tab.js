// memory-tab.js — DANMAN Memory Manager v4.5.1
// Fixed: sendToBackground uses Promise .then() not callbacks
(function() {
  'use strict';

  var container = document.getElementById('tab-memory');
  if (!container) return;

  var currentConfig = {};
  var currentProjects = [];
  var memoryStats = { totalProjects: 0, totalFiles: 0, contextTokens: 0 };
  var memoryConfigured = false;

  // ============================================================================
  // INIT
  // ============================================================================

  function initTab() {
    var learn = (typeof GPD_ProgressiveLearn !== 'undefined') ? GPD_ProgressiveLearn : null;
    if (learn && learn.load) {
      learn.load().then(function () { render(); }).catch(function () { render(); });
    } else {
      render();
    }
    loadConfig();
    checkMemoryConfigured();
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  function render() {
    container.innerHTML =
      '<div class="memory-tab-container">' +
        renderProgressiveLearnCard() +
        renderMemoryStatusCard() +
        renderMemoryInitCard() +
        renderFinetuningCard() +
        renderProjectsCard() +
        renderActionsCard() +
      '</div>';
    attachEventListeners();
    attachProgressiveListeners();
  }

  function renderProgressiveLearnCard() {
    var learn = (typeof GPD_ProgressiveLearn !== 'undefined') ? GPD_ProgressiveLearn : null;
    var stats = learn ? learn.getStatsPairs() : [];
    var memories = learn ? learn.listMemories() : [];
    var feed = learn ? learn.getFeedLog(25) : [];
    var enabled = learn && learn.getStats ? !!(learn.getStats().enabled !== false) : true;

    var statsHtml = stats.map(function (pair) {
      return '<div class="stat-box"><div class="value">' + pair[1] + '</div><div class="label">' + pair[0] + '</div></div>';
    }).join('');

    var memHtml = memories.length
      ? memories.slice(0, 20).map(function (m) {
          return '<div class="result-item" style="padding:8px;" data-mem-id="' + m.id + '">' +
            '<b>' + (m.type || 'fact') + '</b> <span class="badge">w' + (m.weight || 1) + '</span>' +
            '<div style="font-size:12px;margin-top:4px;">' + String(m.content || '').replace(/</g, '&lt;') + '</div>' +
            '<div style="margin-top:6px;display:flex;gap:4px;">' +
              '<button class="btn btn-sm btn-secondary mem-weight" data-id="' + m.id + '">+weight</button>' +
              '<button class="btn btn-sm btn-secondary mem-del" data-id="' + m.id + '">Delete</button>' +
            '</div></div>';
        }).join('')
      : '<div class="empty-state"><div class="message">No progressive memories yet. Add facts below, or use the app — learning keeps a feed log of everything fed in.</div></div>';

    var feedHtml = feed.length
      ? feed.map(function (f) {
          var when = new Date(f.ts).toLocaleString();
          return '<div style="font-size:11px;padding:4px 0;border-bottom:1px solid #1e293b;color:#94a3b8;">' +
            '<code style="color:#7dd3fc;">' + String(f.action || '').replace(/</g, '&lt;') + '</code> · ' + when +
            (f.detail ? '<div style="color:#64748b;">' + String(f.detail).replace(/</g, '&lt;') + '</div>' : '') +
            '</div>';
        }).join('')
      : '<div class="text-xs text-muted">Feed log empty — Studio OCR, Triage steps, clips, and chats will appear here.</div>';

    return '<div class="card" style="border:1px solid #38bdf8;">' +
      '<div class="card-header">' +
        '<h3 class="section-title">Progressive Learning</h3>' +
        '<label class="toggle" title="Keep a progressive log of data fed into DANMAN">' +
          '<input type="checkbox" id="prog-learn-enabled" ' + (enabled ? 'checked' : '') + '>' +
          '<span class="slider"></span>' +
        '</label>' +
      '</div>' +
      '<p style="font-size:12px;color:#94a3b8;margin-bottom:8px;">What DANMAN knows about you — and a progressive log of data it was fed. Synced across all browser tabs.</p>' +
      '<div class="stat-row" id="prog-stats">' + (statsHtml || '') + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;">' +
        '<button class="btn btn-primary btn-sm" id="prog-add-mem">+ Add memory</button>' +
        '<button class="btn btn-secondary btn-sm" id="prog-refresh">Refresh</button>' +
      '</div>' +
      '<div class="section-title" style="margin-top:8px;">Memories</div>' +
      '<div id="prog-mem-list">' + memHtml + '</div>' +
      '<div class="section-title" style="margin-top:12px;">Feed log</div>' +
      '<div id="prog-feed-log" style="max-height:220px;overflow:auto;">' + feedHtml + '</div>' +
    '</div>';
  }

  function attachProgressiveListeners() {
    var learn = (typeof GPD_ProgressiveLearn !== 'undefined') ? GPD_ProgressiveLearn : null;
    if (!learn) return;

    var en = document.getElementById('prog-learn-enabled');
    if (en) {
      en.addEventListener('change', function () {
        learn.setEnabled(en.checked);
        if (window.Toast) Toast.success(en.checked ? 'Progressive learning on' : 'Progressive learning paused');
      });
    }
    var addBtn = document.getElementById('prog-add-mem');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var type = prompt('Type (preference|fact|correction|pattern):', 'fact') || 'fact';
        var content = prompt('Memory content:');
        if (!content) return;
        learn.addMemory(type, content);
        render();
        if (window.Toast) Toast.success('Memory added');
      });
    }
    var refresh = document.getElementById('prog-refresh');
    if (refresh) refresh.addEventListener('click', function () { render(); });

    container.querySelectorAll('.mem-weight').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var m = learn.listMemories().find(function (x) { return x.id === btn.getAttribute('data-id'); });
        if (m) learn.updateMemory(m.id, { weight: (m.weight || 1) + 1 });
        render();
      });
    });
    container.querySelectorAll('.mem-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        learn.updateMemory(btn.getAttribute('data-id'), { deleted: true });
        render();
      });
    });
  }

  // Live cross-tab refresh for progressive learn
  window.addEventListener('gpd-learn-updated', function () {
    if (container.classList.contains('active') || document.querySelector('#tab-memory.active')) {
      // Soft refresh progressive section only when visible
      try {
        var card = container.querySelector('#prog-feed-log');
        if (card) render();
      } catch (_) {}
    }
  });

  function renderMemoryStatusCard() {
    var statusBadge = memoryConfigured
      ? '<span class="badge badge-green">Configured</span>'
      : '<span class="badge badge-yellow">Not Configured</span>';

    var folderId = (currentConfig.memory && currentConfig.memory.folder_id) || 'Not set';
    var enabled = currentConfig.memory && currentConfig.memory.enabled;

    return '<div class="card">' +
      '<div class="card-header">' +
        '<h3 class="section-title">Memory Status</h3>' +
        statusBadge +
      '</div>' +
      '<div style="padding:4px 0;">' +
        '<div class="form-group">' +
          '<label>Folder ID:</label>' +
          '<div style="font-size:12px;color:#94a3b8;word-break:break-all;">' + folderId + '</div>' +
        '</div>' +
        '<div class="toggle-row">' +
          '<label>Memory Enabled:</label>' +
          '<label class="toggle">' +
            '<input type="checkbox" id="memory-enabled-toggle" ' + (enabled ? 'checked' : '') + '>' +
            '<span class="slider"></span>' +
          '</label>' +
        '</div>' +
        '<div class="stat-row">' +
          '<div class="stat-box"><div class="value" id="stat-projects">' + memoryStats.totalProjects + '</div><div class="label">Projects</div></div>' +
          '<div class="stat-box"><div class="value" id="stat-files">' + memoryStats.totalFiles + '</div><div class="label">Files</div></div>' +
          '<div class="stat-box"><div class="value" id="stat-tokens">' + memoryStats.contextTokens + '</div><div class="label">Tokens</div></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderMemoryInitCard() {
    if (memoryConfigured) return '';

    return '<div class="card">' +
      '<div class="card-header"><h3 class="section-title">Initialize Memory</h3></div>' +
      '<div style="padding:4px 0;">' +
        '<p style="font-size:12px;color:#94a3b8;margin-bottom:12px;">' +
          'Memory allows DANMAN to maintain context across conversations using a Google Drive folder. ' +
          'It learns from your interactions and adapts responses based on accumulated knowledge.' +
        '</p>' +
        '<p style="font-size:11px;color:#64748b;margin-bottom:12px;padding:8px;background:#1e293b;border:1px solid #334155;border-radius:6px;">' +
          '💡 Easiest setup: connect a <strong>Drive Bridge</strong> in the Bridge tab ' +
          '(add Bridge_Drive.gs to a backend, Discover it). Then a Folder ID alone works here — ' +
          'no OAuth token, nothing that expires. Subfolders (projects, chats, uploads, rag, transcripts) ' +
          'are created for you.' +
        '</p>' +
        '<div class="form-group">' +
          '<label for="drive-folder-id">Google Drive Folder ID:</label>' +
          '<input type="text" id="drive-folder-id" placeholder="e.g., 1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p">' +
        '</div>' +
        '<button class="btn btn-primary" id="init-memory-btn">Initialize Memory</button>' +
      '</div>' +
    '</div>';
  }

  function renderFinetuningCard() {
    var config = (currentConfig.memory && currentConfig.memory.finetuning) || {};

    var domainTags = (config.domainKnowledge || []).map(function(tag) {
      return '<span class="badge badge-cyan" style="margin:2px 4px 2px 0;cursor:pointer;" data-remove-tag="' + tag + '">' + tag + ' &times;</span>';
    }).join('');

    return '<div class="card">' +
      '<div class="card-header"><h3 class="section-title">Fine-Tuning &amp; Personality</h3></div>' +
      '<div style="padding:4px 0;">' +
        '<div class="form-group">' +
          '<label for="system-prompt">System Prompt Override:</label>' +
          '<textarea id="system-prompt" rows="3" placeholder="Custom system instructions for DANMAN...">' + (config.systemPrompt || '') + '</textarea>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="custom-instructions">Custom Instructions:</label>' +
          '<textarea id="custom-instructions" rows="2" placeholder="Additional behavioral instructions...">' + (config.customInstructions || '') + '</textarea>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="personality-notes">Personality &amp; Tone Notes:</label>' +
          '<textarea id="personality-notes" rows="2" placeholder="Notes about desired personality or tone...">' + (config.personalityNotes || '') + '</textarea>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="max-tokens">Max Response Tokens: <span id="max-tokens-value">' + (config.maxTokens || 2000) + '</span></label>' +
          '<input type="range" id="max-tokens" min="500" max="8000" step="100" value="' + (config.maxTokens || 2000) + '" style="width:100%;">' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="response-style">Response Style:</label>' +
          '<select id="response-style">' +
            '<option value="professional"' + (config.responseStyle === 'professional' ? ' selected' : '') + '>Professional</option>' +
            '<option value="casual"' + (config.responseStyle === 'casual' ? ' selected' : '') + '>Casual</option>' +
            '<option value="technical"' + (config.responseStyle === 'technical' ? ' selected' : '') + '>Technical</option>' +
            '<option value="concise"' + (config.responseStyle === 'concise' ? ' selected' : '') + '>Concise</option>' +
          '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Domain Knowledge Tags:</label>' +
          '<div style="display:flex;gap:4px;">' +
            '<input type="text" id="domain-knowledge-input" placeholder="e.g., Python, HVAC, Web Dev" style="flex:1;">' +
            '<button class="btn btn-secondary btn-sm" id="add-domain-tag-btn">Add</button>' +
          '</div>' +
          '<div id="domain-tags" style="margin-top:6px;">' + domainTags + '</div>' +
        '</div>' +
        '<button class="btn btn-primary" id="save-finetuning-btn">Save Configuration</button>' +
      '</div>' +
    '</div>';
  }

  function renderProjectsCard() {
    if (!memoryConfigured) return '';

    var projectsHtml = '';
    if (currentProjects.length === 0) {
      projectsHtml = '<div class="empty-state"><div class="icon">&#128193;</div><div class="message">No projects yet. Create one to get started.</div></div>';
    } else {
      for (var i = 0; i < currentProjects.length; i++) {
        projectsHtml += renderProjectItem(currentProjects[i]);
      }
    }

    return '<div class="card">' +
      '<div class="card-header"><h3 class="section-title">Memory Projects</h3></div>' +
      '<div style="padding:4px 0;">' +
        '<div class="form-group">' +
          '<input type="text" id="project-name" placeholder="Project name">' +
        '</div>' +
        '<div class="form-group">' +
          '<textarea id="project-description" rows="2" placeholder="Project description..."></textarea>' +
        '</div>' +
        '<button class="btn btn-primary btn-sm" id="create-project-btn">Create Project</button>' +
        '<div class="divider"></div>' +
        '<div id="projects-list">' + projectsHtml + '</div>' +
      '</div>' +
    '</div>';
  }

  function renderProjectItem(project) {
    var fileCount = (project.files && project.files.length) || 0;
    var activeChecked = project.active ? ' checked' : '';

    return '<div class="result-item" style="padding:10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div>' +
          '<div style="font-weight:600;color:#e2e8f0;">' + (project.name || 'Unnamed') + '</div>' +
          '<div style="font-size:11px;color:#64748b;">' + (project.description || 'No description') + ' &mdash; ' + fileCount + ' files</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;">' +
          '<label class="toggle"><input type="checkbox" class="project-active-toggle" data-project-id="' + project.id + '"' + activeChecked + '><span class="slider"></span></label>' +
          '<button class="btn btn-danger btn-sm project-delete-btn" data-project-id="' + project.id + '">Del</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderActionsCard() {
    return '<div class="card">' +
      '<div class="card-header"><h3 class="section-title">Memory Actions</h3></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:4px 0;">' +
        '<button class="btn btn-secondary btn-sm" id="refresh-stats-btn">Refresh Stats</button>' +
        '<button class="btn btn-secondary btn-sm" id="export-config-btn">Export Config</button>' +
        '<button class="btn btn-danger btn-sm" id="clear-memory-btn">Clear All Memory</button>' +
      '</div>' +
    '</div>';
  }

  // ============================================================================
  // DATA LOADING — All use Promise .then() pattern
  // ============================================================================

  function loadConfig() {
    window.sendToBackground('CONFIG_LOAD', {}).then(function(response) {
      // CONFIG_LOAD returns the raw config object (no success wrapper)
      if (response) {
        currentConfig = response.data || response.config || response || {};
        // If the response IS the config (no wrapper), use it directly
        if (!currentConfig.memory && response.memory) {
          currentConfig = response;
        }
        loadMemoryStats();
        loadProjects();
      }
    }).catch(function(err) {
      console.warn('[DANMAN Memory] loadConfig error:', err);
    });
  }

  function checkMemoryConfigured() {
    window.sendToBackground('MEMORY_IS_CONFIGURED', {}).then(function(response) {
      if (response) {
        memoryConfigured = (response.configured === true) || (response.data && response.data.configured === true) || (response.success && response.data && response.data.configured === true);
        render();
        if (memoryConfigured) {
          loadMemoryStats();
          loadProjects();
        }
      }
    }).catch(function(err) {
      console.warn('[DANMAN Memory] checkMemoryConfigured error:', err);
    });
  }

  function loadMemoryStats() {
    window.sendToBackground('MEMORY_GET_STATS', {}).then(function(response) {
      if (response) {
        var data = response.data || response;
        memoryStats = {
          totalProjects: data.totalProjects || 0,
          totalFiles: data.totalFiles || 0,
          contextTokens: data.contextTokens || 0
        };
        updateStatsDisplay();
      }
    }).catch(function(err) {
      console.warn('[DANMAN Memory] loadMemoryStats error:', err);
    });
  }

  function updateStatsDisplay() {
    var sp = document.getElementById('stat-projects');
    var sf = document.getElementById('stat-files');
    var st = document.getElementById('stat-tokens');
    if (sp) sp.textContent = memoryStats.totalProjects;
    if (sf) sf.textContent = memoryStats.totalFiles;
    if (st) st.textContent = memoryStats.contextTokens;
  }

  function loadProjects() {
    if (!memoryConfigured) return;

    window.sendToBackground('MEMORY_LIST_PROJECTS', {}).then(function(response) {
      if (response) {
        currentProjects = response.data || response.projects || [];
        renderProjectsList();
      }
    }).catch(function(err) {
      console.warn('[DANMAN Memory] loadProjects error:', err);
    });
  }

  function renderProjectsList() {
    var projectsList = document.getElementById('projects-list');
    if (!projectsList) return;

    if (currentProjects.length === 0) {
      projectsList.innerHTML = '<div class="empty-state"><div class="icon">&#128193;</div><div class="message">No projects yet.</div></div>';
    } else {
      var html = '';
      for (var i = 0; i < currentProjects.length; i++) {
        html += renderProjectItem(currentProjects[i]);
      }
      projectsList.innerHTML = html;
    }
    attachProjectEventListeners();
  }

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================

  function attachEventListeners() {
    var memoryToggle = document.getElementById('memory-enabled-toggle');
    if (memoryToggle) {
      memoryToggle.addEventListener('change', toggleMemory);
    }

    var maxTokensSlider = document.getElementById('max-tokens');
    if (maxTokensSlider) {
      maxTokensSlider.addEventListener('input', function(e) {
        var el = document.getElementById('max-tokens-value');
        if (el) el.textContent = e.target.value;
      });
    }

    var addTagBtn = document.getElementById('add-domain-tag-btn');
    if (addTagBtn) {
      addTagBtn.addEventListener('click', addDomainTag);
    }

    attachTagRemoveListeners();

    var saveFinetuningBtn = document.getElementById('save-finetuning-btn');
    if (saveFinetuningBtn) {
      saveFinetuningBtn.addEventListener('click', saveFinetuning);
    }

    var initMemoryBtn = document.getElementById('init-memory-btn');
    if (initMemoryBtn) {
      initMemoryBtn.addEventListener('click', initializeMemory);
    }

    var createProjectBtn = document.getElementById('create-project-btn');
    if (createProjectBtn) {
      createProjectBtn.addEventListener('click', createProject);
    }

    var refreshStatsBtn = document.getElementById('refresh-stats-btn');
    if (refreshStatsBtn) {
      refreshStatsBtn.addEventListener('click', function() {
        loadMemoryStats();
        if (window.Toast) window.Toast.show('Stats refreshed');
      });
    }

    var exportConfigBtn = document.getElementById('export-config-btn');
    if (exportConfigBtn) {
      exportConfigBtn.addEventListener('click', exportConfig);
    }

    var clearMemoryBtn = document.getElementById('clear-memory-btn');
    if (clearMemoryBtn) {
      clearMemoryBtn.addEventListener('click', clearMemory);
    }

    attachProjectEventListeners();
  }

  function attachTagRemoveListeners() {
    document.querySelectorAll('[data-remove-tag]').forEach(function(badge) {
      badge.addEventListener('click', function() {
        removeDomainTag(badge.dataset.removeTag);
      });
    });
  }

  function attachProjectEventListeners() {
    document.querySelectorAll('.project-active-toggle').forEach(function(toggle) {
      toggle.addEventListener('change', function(e) {
        setProjectActive(e.target.dataset.projectId, e.target.checked);
      });
    });

    document.querySelectorAll('.project-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        deleteProject(btn.dataset.projectId);
      });
    });
  }

  // ============================================================================
  // ACTIONS — All use Promise .then() pattern
  // ============================================================================

  function toggleMemory(e) {
    var enabled = e.target.checked;
    var memCfg = currentConfig.memory || {};
    memCfg.enabled = enabled;

    window.sendToBackground('CONFIG_SAVE', { memory: memCfg }).then(function(response) {
      if (response && (response.success !== false)) {
        currentConfig.memory = memCfg;
        if (window.Toast) window.Toast.show(enabled ? 'Memory enabled' : 'Memory disabled');
      }
    }).catch(function(err) {
      console.error('[DANMAN Memory] toggleMemory error:', err);
      if (window.Toast) window.Toast.show('Failed to toggle memory', 'error');
    });
  }

  function addDomainTag() {
    var input = document.getElementById('domain-knowledge-input');
    var tag = (input && input.value) ? input.value.trim() : '';
    if (!tag) {
      if (window.Toast) window.Toast.show('Please enter a tag', 'warning');
      return;
    }

    var config = (currentConfig.memory && currentConfig.memory.finetuning) || {};
    var tags = config.domainKnowledge || [];

    if (tags.indexOf(tag) === -1) {
      tags.push(tag);
      input.value = '';
      config.domainKnowledge = tags;
      if (!currentConfig.memory) currentConfig.memory = {};
      if (!currentConfig.memory.finetuning) currentConfig.memory.finetuning = {};
      currentConfig.memory.finetuning.domainKnowledge = tags;
      updateDomainTagsDisplay(tags);
    }
  }

  function removeDomainTag(tag) {
    var config = (currentConfig.memory && currentConfig.memory.finetuning) || {};
    var tags = (config.domainKnowledge || []).filter(function(t) { return t !== tag; });
    if (!currentConfig.memory) currentConfig.memory = {};
    if (!currentConfig.memory.finetuning) currentConfig.memory.finetuning = {};
    currentConfig.memory.finetuning.domainKnowledge = tags;
    updateDomainTagsDisplay(tags);
  }

  function updateDomainTagsDisplay(tags) {
    var el = document.getElementById('domain-tags');
    if (!el) return;
    el.innerHTML = tags.map(function(tag) {
      return '<span class="badge badge-cyan" style="margin:2px 4px 2px 0;cursor:pointer;" data-remove-tag="' + tag + '">' + tag + ' &times;</span>';
    }).join('');
    attachTagRemoveListeners();
  }

  function saveFinetuning() {
    var config = {
      systemPrompt: (document.getElementById('system-prompt') || {}).value || '',
      customInstructions: (document.getElementById('custom-instructions') || {}).value || '',
      personalityNotes: (document.getElementById('personality-notes') || {}).value || '',
      maxTokens: parseInt((document.getElementById('max-tokens') || {}).value || '2000'),
      responseStyle: (document.getElementById('response-style') || {}).value || 'professional',
      domainKnowledge: (currentConfig.memory && currentConfig.memory.finetuning && currentConfig.memory.finetuning.domainKnowledge) || []
    };

    window.sendToBackground('MEMORY_SAVE_CONFIG', { finetuning: config }).then(function(response) {
      if (response && (response.success !== false)) {
        if (window.Toast) window.Toast.show('Configuration saved');
        if (!currentConfig.memory) currentConfig.memory = {};
        currentConfig.memory.finetuning = config;
      } else {
        if (window.Toast) window.Toast.show('Failed to save configuration', 'error');
      }
    }).catch(function(err) {
      console.error('[DANMAN Memory] saveFinetuning error:', err);
      if (window.Toast) window.Toast.show('Save failed: ' + err.message, 'error');
    });
  }

  function initializeMemory() {
    var input = document.getElementById('drive-folder-id');
    var folderId = input ? input.value.trim() : '';

    if (!folderId) {
      if (window.Toast) window.Toast.show('Please enter a valid folder ID', 'warning');
      return;
    }

    // Disable button during operation
    var btn = document.getElementById('init-memory-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Initializing...';
    }

    window.sendToBackground('MEMORY_INIT', { folderId: folderId }).then(function(response) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Initialize Memory';
      }

      if (response && (response.success !== false)) {
        if (window.Toast) window.Toast.show('Memory initialized successfully');
        memoryConfigured = true;
        currentConfig.memory = currentConfig.memory || {};
        currentConfig.memory.folder_id = folderId;
        currentConfig.memory.enabled = true;
        loadProjects();
        render();
      } else {
        var errMsg = (response && response.error) ? response.error : 'Unknown error';
        if (window.Toast) window.Toast.show('Failed to initialize: ' + errMsg, 'error');
      }
    }).catch(function(err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Initialize Memory';
      }
      console.error('[DANMAN Memory] initializeMemory error:', err);
      if (window.Toast) window.Toast.show('Initialize failed: ' + err.message, 'error');
    });
  }

  function createProject() {
    var nameEl = document.getElementById('project-name');
    var descEl = document.getElementById('project-description');
    var name = nameEl ? nameEl.value.trim() : '';
    var description = descEl ? descEl.value.trim() : '';

    if (!name) {
      if (window.Toast) window.Toast.show('Please enter a project name', 'warning');
      return;
    }

    window.sendToBackground('MEMORY_CREATE_PROJECT', { name: name, description: description }).then(function(response) {
      if (response && (response.success !== false)) {
        if (window.Toast) window.Toast.show('Project created');
        if (nameEl) nameEl.value = '';
        if (descEl) descEl.value = '';
        loadProjects();
      } else {
        if (window.Toast) window.Toast.show('Failed to create project', 'error');
      }
    }).catch(function(err) {
      console.error('[DANMAN Memory] createProject error:', err);
      if (window.Toast) window.Toast.show('Create failed: ' + err.message, 'error');
    });
  }

  function setProjectActive(projectId, active) {
    window.sendToBackground('MEMORY_SET_ACTIVE', { projectId: projectId, active: active }).then(function(response) {
      if (response && (response.success !== false)) {
        if (window.Toast) window.Toast.show(active ? 'Project activated' : 'Project deactivated');
      }
    }).catch(function(err) {
      console.warn('[DANMAN Memory] setProjectActive error:', err);
    });
  }

  function deleteProject(projectId) {
    if (!confirm('Are you sure you want to delete this project?')) return;

    window.sendToBackground('MEMORY_DELETE_PROJECT', { projectId: projectId }).then(function(response) {
      if (response && (response.success !== false)) {
        if (window.Toast) window.Toast.show('Project deleted');
        loadProjects();
      }
    }).catch(function(err) {
      console.error('[DANMAN Memory] deleteProject error:', err);
    });
  }

  function exportConfig() {
    var configJson = JSON.stringify(currentConfig, null, 2);
    navigator.clipboard.writeText(configJson).then(function() {
      if (window.Toast) window.Toast.show('Config copied to clipboard');
    }).catch(function() {
      if (window.Toast) window.Toast.show('Copy failed', 'error');
    });
  }

  function clearMemory() {
    if (!confirm('Clear all memory? This deletes all projects, files, and settings.')) return;

    window.sendToBackground('MEMORY_CLEAR_ALL', {}).then(function(response) {
      if (response && (response.success !== false)) {
        if (window.Toast) window.Toast.show('All memory cleared');
        memoryConfigured = false;
        currentProjects = [];
        memoryStats = { totalProjects: 0, totalFiles: 0, contextTokens: 0 };
        render();
      }
    }).catch(function(err) {
      console.error('[DANMAN Memory] clearMemory error:', err);
    });
  }

  // ============================================================================
  // INIT ON LOAD
  // ============================================================================

  initTab();

})();
// END: memory-tab.js — DANMAN Memory Manager v4.5.1
