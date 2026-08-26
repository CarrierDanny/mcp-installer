// memory.js - Memory Retrieval System module for DANMAN
// Provides persistent memory stored in Google Drive with fine-tuning config and project contexts

class MemoryManager {
  constructor() {
    this.memoryConfig = null;
    this.activeProjects = [];
    this.isInitialized = false;
    this.memoryFolderId = null;
    this.projectsFolderId = null;
  }

  /**
   * Initialize the memory manager with configuration
   * @returns {Promise<boolean>} True if initialization successful
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        return true;
      }

      const config = await ConfigManager.getConfig();

      if (!config.memory || !config.memory.enabled) {
        Logger.warn('Memory system disabled in config');
        return false;
      }

      if (!config.memory.folder_id) {
        Logger.warn('No memory folder ID configured');
        return false;
      }

      this.memoryFolderId = config.memory.folder_id;

      // Verify Drive client is available
      if (!globalThis.DriveClient) {
        Logger.error('DriveClient not available, memory system cannot initialize');
        return false;
      }

      // Load memory config from Drive
      const memoryConfig = await this.loadMemoryConfig();
      if (memoryConfig) {
        this.memoryConfig = memoryConfig;
        this.isInitialized = true;
        Logger.info('Memory manager initialized successfully');
        return true;
      }

      return false;
    } catch (error) {
      Logger.error(`Memory manager initialization failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Lazy hydration guard — MV3 workers restart and lose instance state,
   * so re-read the folder ID from config before any Drive-backed operation.
   * With createDefault=true and no folder configured, auto-create the
   * "DANMAN_Memory" default folder so memory routing always has a home —
   * the user only ever sees an error for an invalid/inaccessible ID.
   * @private
   */
  async _ensure(createDefault = false) {
    if (!this.memoryFolderId) {
      const cfg = await ConfigManager.getConfig();
      this.memoryFolderId = cfg.memory?.folder_id || cfg.memory?.drive_folder_id || null;
    }
    if (!this.memoryFolderId && createDefault) {
      const folder = await globalThis.DriveClient.getOrCreateFolder('DANMAN_Memory');
      if (folder && folder.id) {
        this.memoryFolderId = folder.id;
        await ConfigManager.updateConfig({
          memory: { folder_id: folder.id, drive_folder_id: folder.id, enabled: true }
        });
        await this.initializeMemoryFolder(folder.id);
        Logger.info('Default memory folder DANMAN_Memory created: ' + folder.id);
      }
    }
  }

  /**
   * Resolve (and cache) a routing subfolder inside the memory folder.
   * @private
   */
  async _subfolder(name) {
    this._subfolders = this._subfolders || {};
    if (this._subfolders[name]) return this._subfolders[name];
    const folder = await globalThis.DriveClient.getOrCreateFolder(name, this.memoryFolderId);
    if (!folder || !folder.id) throw new Error('Could not create memory subfolder: ' + name);
    this._subfolders[name] = folder.id;
    return folder.id;
  }

  /**
   * Route any artifact into the memory folder. Everything memory-related —
   * chat dialog, uploads/attachments, RAG saves, transcripts — lands under
   * the configured folder (or the auto-created DANMAN_Memory default).
   * @param {string} kind chat|upload|rag|transcript|other
   */
  async storeArtifact(kind, name, content, mimeType = 'text/plain') {
    await this._ensure(true);
    if (!this.memoryFolderId) {
      throw new Error('No memory folder available — check Drive access (Settings → Integrations)');
    }
    const SUBS = { chat: 'chats', upload: 'uploads', rag: 'rag', transcript: 'transcripts' };
    const subId = await this._subfolder(SUBS[kind] || 'other');
    const file = await globalThis.DriveClient.createFile(name, content, mimeType, subId);
    return { id: file && file.id, name, folder: SUBS[kind] || 'other' };
  }

  /**
   * Create a job folder under rag/ for multi-file artifacts (page rips etc.)
   * and return its id + shareable Drive link.
   */
  async createRagJobFolder(name) {
    await this._ensure(true);
    if (!this.memoryFolderId) {
      throw new Error('No memory folder available — check Drive access (Settings → Integrations)');
    }
    const ragId = await this._subfolder('rag');
    const folder = await globalThis.DriveClient.createFolder(name, ragId);
    if (!folder || !folder.id) throw new Error('Could not create RAG job folder: ' + name);
    return { id: folder.id, link: 'https://drive.google.com/drive/folders/' + folder.id };
  }

  /**
   * Append a chat exchange to this session's log file in chats/. One file
   * per session (per worker lifetime — a restart starts a fresh part file).
   * Best-effort by design: callers wrap in try/catch.
   */
  async appendChatLog(sessionId, userMsg, assistantMsg, meta = {}) {
    await this._ensure(true);
    if (!this.memoryFolderId) return null;
    this._chatBuf = this._chatBuf || {};
    this._chatFile = this._chatFile || {};
    const stamp = new Date().toISOString();
    let entry = '\n---\n### ' + stamp + (meta.model ? ' · ' + meta.model : '') + '\n\n';
    entry += '**User:**\n\n' + (userMsg || '') + '\n\n**DANMAN:**\n\n' + (assistantMsg || '') + '\n';
    this._chatBuf[sessionId] = (this._chatBuf[sessionId] || ('# DANMAN chat log — ' + sessionId + '\n')) + entry;
    if (this._chatFile[sessionId]) {
      await globalThis.DriveClient.updateFileContent(this._chatFile[sessionId], this._chatBuf[sessionId], 'text/markdown');
    } else {
      const subId = await this._subfolder('chats');
      const file = await globalThis.DriveClient.createFile(
        'chat-' + sessionId + '-' + Date.now() + '.md',
        this._chatBuf[sessionId], 'text/markdown', subId
      );
      if (file && file.id) this._chatFile[sessionId] = file.id;
    }
    return true;
  }

  /**
   * Check if memory is properly configured
   * @returns {Promise<boolean>}
   */
  async isMemoryConfigured() {
    try {
      await this._ensure();
      const config = await ConfigManager.getConfig();
      return config.memory &&
             config.memory.enabled &&
             config.memory.folder_id ? true : false;
    } catch (error) {
      Logger.error(`Error checking memory configuration: ${error.message}`);
      return false;
    }
  }

  /**
   * Get default memory configuration
   * @returns {Object} Default memory config
   */
  getDefaultMemoryConfig() {
    return {
      system_prompt_override: '',
      max_tokens: 2000,
      temperature: 0.7,
      response_style: 'professional', // professional, casual, technical, concise
      custom_instructions: '',
      context_window: 4000,
      personality_notes: '',
      domain_knowledge: [] // array of strings for domain expertise areas
    };
  }

  /**
   * Load memory configuration from Drive
   * @returns {Promise<Object|null>} Memory config or null if not found
   */
  async loadMemoryConfig() {
    try {
      await this._ensure();
      if (!this.memoryFolderId) {
        Logger.warn('No memory folder ID set');
        return null;
      }

      const files = await globalThis.DriveClient.listFiles(this.memoryFolderId, "name='config.json'");

      if (!files || files.length === 0) {
        Logger.info('No config.json found in memory folder');
        return this.getDefaultMemoryConfig();
      }

      const configFile = files[0];
      const content = await globalThis.DriveClient.readFile(configFile.id);

      if (!content) {
        Logger.warn('Failed to read config.json content');
        return this.getDefaultMemoryConfig();
      }

      const parsed = JSON.parse(content);
      const defaultConfig = this.getDefaultMemoryConfig();

      // Merge with defaults to ensure all keys exist
      const merged = { ...defaultConfig, ...parsed };

      Logger.info('Memory config loaded successfully');
      return merged;
    } catch (error) {
      Logger.error(`Error loading memory config: ${error.message}`);
      return this.getDefaultMemoryConfig();
    }
  }

  /**
   * Save memory configuration to Drive
   * @param {Object} memoryConfig - Configuration to save
   * @returns {Promise<boolean>} True if save successful
   */
  async saveMemoryConfig(memoryConfig) {
    try {
      await this._ensure();
      if (!this.memoryFolderId) {
        Logger.error('No memory folder ID set');
        return false;
      }

      // Validate config has required fields
      if (!memoryConfig || typeof memoryConfig !== 'object') {
        Logger.error('Invalid memory config format');
        return false;
      }

      // UIs send {finetuning:{camelCase}} — map onto the snake_case schema,
      // merging with the existing stored config
      if (memoryConfig.finetuning) {
        const ft = memoryConfig.finetuning;
        const existing = this.memoryConfig || (await this.loadMemoryConfig()) || this.getDefaultMemoryConfig();
        memoryConfig = {
          ...existing,
          system_prompt_override: ft.systemPrompt !== undefined ? ft.systemPrompt : existing.system_prompt_override,
          custom_instructions: ft.customInstructions !== undefined ? ft.customInstructions : existing.custom_instructions,
          personality_notes: ft.personalityNotes !== undefined ? ft.personalityNotes : existing.personality_notes,
          max_tokens: ft.maxTokens !== undefined ? ft.maxTokens : existing.max_tokens,
          response_style: ft.responseStyle !== undefined ? ft.responseStyle : existing.response_style,
          domain_knowledge: ft.domainKnowledge !== undefined ? ft.domainKnowledge : existing.domain_knowledge
        };
      }

      const files = await globalThis.DriveClient.listFiles(this.memoryFolderId, "name='config.json'");
      const configContent = JSON.stringify(memoryConfig, null, 2);

      if (files && files.length > 0) {
        // Update existing file
        const success = await globalThis.DriveClient.updateFileContent(files[0].id, configContent, 'application/json');
        if (success) {
          this.memoryConfig = memoryConfig;
          Logger.info('Memory config updated successfully');
          return true;
        }
      } else {
        // Create new file
        const success = await globalThis.DriveClient.createFile(
          'config.json',
          configContent,
          'application/json',
          this.memoryFolderId
        );
        if (success) {
          this.memoryConfig = memoryConfig;
          Logger.info('Memory config created successfully');
          return true;
        }
      }

      return false;
    } catch (error) {
      Logger.error(`Error saving memory config: ${error.message}`);
      return false;
    }
  }

  /**
   * Initialize a memory folder with default structure
   * @param {string} folderId - Google Drive folder ID
   * @returns {Promise<boolean>} True if initialization successful
   */
  async initializeMemoryFolder(folderId) {
    try {
      if (!folderId) {
        Logger.error('No folder ID provided for memory initialization');
        return false;
      }

      // Validate ACCESS first. Distinguish an actual folder problem (Drive
      // reached us and said no) from a transport/config problem (we never
      // reached Drive at all) — reporting a NetworkError as "folder not
      // shared" sends the user chasing the wrong thing.
      try {
        await globalThis.DriveClient.listFiles(folderId);
      } catch (accessErr) {
        const m = (accessErr && accessErr.message) || String(accessErr);
        const transport = /NetworkError|Failed to fetch|No webhook|not configured|timed out|Webhook|non-JSON|auth redirect|OAuth token/i.test(m);
        this._lastInitError = transport
          ? 'Could not reach Google Drive (connection/credential problem, not the folder): ' + m
          : 'Folder ID is invalid or not accessible/shared: ' + m;
        Logger.error(this._lastInitError);
        return false;
      }

      this.memoryFolderId = folderId;
      this._subfolders = {}; // reset cache — new root

      // Full routing tree, idempotent (getOrCreateFolder won't duplicate):
      // projects/ (structured project memory), chats/ (all chat dialog),
      // uploads/ (attached & uploaded items), rag/ (vectorized-save copies),
      // transcripts/ (audio transcriptions)
      const projectsId = await this._subfolder('projects');
      await this._subfolder('chats');
      await this._subfolder('uploads');
      await this._subfolder('rag');
      await this._subfolder('transcripts');
      this.projectsFolderId = projectsId;

      // config.json — only create if the folder doesn't already have one
      const defaultConfig = this.getDefaultMemoryConfig();
      const existing = await globalThis.DriveClient.listFiles(folderId, "name='config.json'");
      if (!existing || !existing.length) {
        const configFile = await globalThis.DriveClient.createFile(
          'config.json',
          JSON.stringify(defaultConfig, null, 2),
          'application/json',
          folderId
        );
        if (!configFile || !configFile.id) {
          Logger.error('Failed to create config.json in memory folder');
          return false;
        }
        this.memoryConfig = defaultConfig;
      }

      Logger.info('Memory folder initialized with routing subfolders');
      return true;
    } catch (error) {
      Logger.error(`Error initializing memory folder: ${error.message}`);
      this._lastInitError = error.message || String(error);
      return false;
    }
  }

  /**
   * List all projects in memory
   * @returns {Promise<Array>} Array of project objects {name, id, description}
   */
  async listProjects() {
    try {
      await this._ensure();
      if (!this.memoryFolderId) {
        Logger.warn('No memory folder ID set');
        return [];
      }

      // Find or create projects folder
      let projectsFolderId = await this._getProjectsFolderId();
      if (!projectsFolderId) {
        Logger.warn('Projects folder not found, returning empty list');
        return [];
      }

      const folders = await globalThis.DriveClient.listFolders(projectsFolderId);
      if (!folders) {
        return [];
      }

      // For each folder, try to load manifest.json to get description
      const projects = [];
      for (const folder of folders) {
        try {
          const files = await globalThis.DriveClient.listFiles(folder.id, "name='manifest.json'");
          let description = '';

          if (files && files.length > 0) {
            const manifestContent = await globalThis.DriveClient.readFile(files[0].id);
            if (manifestContent) {
              const manifest = JSON.parse(manifestContent);
              description = manifest.description || '';
            }
          }

          projects.push({
            name: folder.name,
            id: folder.id,
            description: description
          });
        } catch (error) {
          Logger.warn(`Error loading project manifest for ${folder.name}: ${error.message}`);
          projects.push({
            name: folder.name,
            id: folder.id,
            description: ''
          });
        }
      }

      // Flag active projects so UIs can render toggles directly
      const activeNames = new Set(await this.getActiveProjects());
      projects.forEach(p => { p.active = activeNames.has(p.name); });

      Logger.info(`Found ${projects.length} projects`);
      return projects;
    } catch (error) {
      Logger.error(`Error listing projects: ${error.message}`);
      return [];
    }
  }

  /**
   * Create a new project
   * @param {string} name - Project name
   * @param {string} description - Project description
   * @returns {Promise<string|null>} Project folder ID or null
   */
  async createProject(name, description = '') {
    try {
      await this._ensure();
      if (!name || typeof name !== 'string') {
        Logger.error('Invalid project name');
        return null;
      }

      const projectsFolderId = await this._getProjectsFolderId();
      if (!projectsFolderId) {
        Logger.error('Projects folder not accessible');
        return null;
      }

      // Create project folder
      const projectFolder = await globalThis.DriveClient.createFolder(name, projectsFolderId);
      const projectId = projectFolder && projectFolder.id;
      if (!projectId) {
        Logger.error(`Failed to create project folder: ${name}`);
        return null;
      }

      // Create manifest.json
      const manifest = {
        name: name,
        description: description,
        created: new Date().toISOString(),
        files: []
      };

      const manifestSuccess = await globalThis.DriveClient.createFile(
        'manifest.json',
        JSON.stringify(manifest, null, 2),
        'application/json',
        projectId
      );

      if (!manifestSuccess) {
        Logger.warn(`Failed to create manifest.json for project: ${name}`);
      }

      Logger.info(`Project created successfully: ${name}`);
      return projectId;
    } catch (error) {
      Logger.error(`Error creating project: ${error.message}`);
      return null;
    }
  }

  /**
   * Add a file to a project
   * @param {string} projectName - Project name
   * @param {string} fileName - File name
   * @param {string} content - File content
   * @returns {Promise<boolean>} True if file added successfully
   */
  async addFileToProject(projectName, fileName, content) {
    try {
      await this._ensure();
      if (!projectName || !fileName || content === undefined) {
        Logger.error('Invalid parameters for adding file to project');
        return false;
      }

      // Find the project folder
      const projects = await this.listProjects();
      const project = projects.find(p => p.name === projectName);

      if (!project) {
        Logger.error(`Project not found: ${projectName}`);
        return false;
      }

      // Determine MIME type based on file extension
      const mimeType = this._getMimeType(fileName);

      // Create or update file (Drive v3 q requires single-quoted values)
      const files = await globalThis.DriveClient.listFiles(project.id, `name='${fileName.replace(/'/g, "\\'")}'`);

      if (files && files.length > 0) {
        const success = await globalThis.DriveClient.updateFileContent(files[0].id, content, mimeType);
        if (success) {
          Logger.info(`File updated in project ${projectName}: ${fileName}`);
          return true;
        }
      } else {
        const success = await globalThis.DriveClient.createFile(
          fileName,
          content,
          mimeType,
          project.id
        );
        if (success) {
          Logger.info(`File added to project ${projectName}: ${fileName}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      Logger.error(`Error adding file to project: ${error.message}`);
      return false;
    }
  }

  /**
   * Get context from a specific project
   * @param {string} projectName - Project name
   * @returns {Promise<string>} Compiled context string
   */
  async getProjectContext(projectName) {
    try {
      await this._ensure();
      if (!projectName) {
        Logger.error('No project name provided');
        return '';
      }

      const projects = await this.listProjects();
      const project = projects.find(p => p.name === projectName);

      if (!project) {
        Logger.warn(`Project not found: ${projectName}`);
        return '';
      }

      const files = await globalThis.DriveClient.listFiles(project.id, 'trashed=false');
      if (!files || files.length === 0) {
        Logger.info(`No files in project: ${projectName}`);
        return '';
      }

      let contextContent = `## Project Context: ${projectName}\n\n`;

      for (const file of files) {
        // Skip manifest.json in context
        if (file.name === 'manifest.json') {
          continue;
        }

        try {
          const fileContent = await globalThis.DriveClient.readFile(file.id);
          if (fileContent) {
            contextContent += `### ${file.name}\n\n`;
            contextContent += fileContent;
            contextContent += '\n\n---\n\n';
          }
        } catch (error) {
          Logger.warn(`Failed to read file ${file.name} from project ${projectName}: ${error.message}`);
        }
      }

      return contextContent;
    } catch (error) {
      Logger.error(`Error getting project context: ${error.message}`);
      return '';
    }
  }

  /**
   * Get list of active projects
   * @returns {Promise<Array>} Array of active project names
   */
  async getActiveProjects() {
    try {
      // Hydrate config after MV3 worker restart
      if (!this.memoryConfig) {
        await this._ensure();
        if (this.memoryFolderId) {
          this.memoryConfig = await this.loadMemoryConfig();
        }
      }

      // Load from config if available
      if (this.memoryConfig && this.memoryConfig.active_projects) {
        return this.memoryConfig.active_projects;
      }

      // Otherwise return the cached active projects
      return this.activeProjects;
    } catch (error) {
      Logger.error(`Error getting active projects: ${error.message}`);
      return [];
    }
  }

  /**
   * Set which projects are active for context
   * @param {Array<string>} projectNames - Array of project names
   * @returns {Promise<boolean>} True if successfully set
   */
  async setActiveProjects(projectNames) {
    try {
      if (!Array.isArray(projectNames)) {
        Logger.error('Project names must be an array');
        return false;
      }

      // Validate that all projects exist
      const projects = await this.listProjects();
      const projectNameSet = new Set(projects.map(p => p.name));

      for (const name of projectNames) {
        if (!projectNameSet.has(name)) {
          Logger.warn(`Project does not exist: ${name}`);
          return false;
        }
      }

      this.activeProjects = projectNames;

      // Save to config
      if (!this.memoryConfig) {
        this.memoryConfig = (await this.loadMemoryConfig()) || this.getDefaultMemoryConfig();
      }
      this.memoryConfig.active_projects = projectNames;
      await this.saveMemoryConfig(this.memoryConfig);

      Logger.info(`Active projects set to: ${projectNames.join(', ')}`);
      return true;
    } catch (error) {
      Logger.error(`Error setting active projects: ${error.message}`);
      return false;
    }
  }

  /**
   * Toggle a single project's active state, resolving by ID or name
   * @param {string} idOrName - Project folder ID or project name
   * @param {boolean} active - Whether the project should be active
   * @returns {Promise<boolean>} True if successfully set
   */
  async setActiveProject(idOrName, active) {
    try {
      await this._ensure();
      if (!idOrName) {
        Logger.error('No project ID or name provided');
        return false;
      }

      const projects = await this.listProjects();
      const project = projects.find(p => p.id === idOrName || p.name === idOrName);
      if (!project) {
        Logger.warn(`Project not found: ${idOrName}`);
        return false;
      }

      if (!this.memoryConfig) {
        this.memoryConfig = (await this.loadMemoryConfig()) || this.getDefaultMemoryConfig();
      }

      const current = new Set(this.memoryConfig.active_projects || []);
      if (active) {
        current.add(project.name);
      } else {
        current.delete(project.name);
      }
      this.memoryConfig.active_projects = Array.from(current);
      this.activeProjects = this.memoryConfig.active_projects;

      const saved = await this.saveMemoryConfig(this.memoryConfig);
      Logger.info(`Project ${project.name} ${active ? 'activated' : 'deactivated'}`);
      return saved;
    } catch (error) {
      Logger.error(`Error setting active project: ${error.message}`);
      return false;
    }
  }

  /**
   * Build complete memory context for DANMAN chat messages
   * @returns {Promise<{context: string, memoryConfig: Object|null}>}
   */
  async buildMemoryContext() {
    try {
      await this._ensure();
      if (!this.memoryFolderId) {
        Logger.warn('Memory not configured');
        return { context: '', memoryConfig: null };
      }

      // Ensure memory config is loaded
      if (!this.memoryConfig) {
        this.memoryConfig = await this.loadMemoryConfig();
      }

      let contextString = '';

      // Add system prompt override if present
      if (this.memoryConfig && this.memoryConfig.system_prompt_override) {
        contextString += `## System Prompt Override\n${this.memoryConfig.system_prompt_override}\n\n`;
      }

      // Add custom instructions if present
      if (this.memoryConfig && this.memoryConfig.custom_instructions) {
        contextString += `## Custom Instructions\n${this.memoryConfig.custom_instructions}\n\n`;
      }

      // Add personality notes if present
      if (this.memoryConfig && this.memoryConfig.personality_notes) {
        contextString += `## Personality & Style\n${this.memoryConfig.personality_notes}\n\n`;
      }

      // Add domain knowledge if present
      if (this.memoryConfig && this.memoryConfig.domain_knowledge && this.memoryConfig.domain_knowledge.length > 0) {
        contextString += `## Domain Knowledge\n`;
        this.memoryConfig.domain_knowledge.forEach(domain => {
          contextString += `- ${domain}\n`;
        });
        contextString += '\n';
      }

      // Add active project contexts
      const activeProjects = await this.getActiveProjects();
      const config = await ConfigManager.getConfig();
      const maxContextTokens = config.memory?.max_context_tokens || 4000;

      let projectContexts = '';
      let totalTokens = this._estimateTokens(contextString);

      for (const projectName of activeProjects) {
        const projectContext = await this.getProjectContext(projectName);
        const projectTokens = this._estimateTokens(projectContext);

        // Check if adding this project would exceed token limit
        if (totalTokens + projectTokens > maxContextTokens) {
          Logger.info(`Skipping project ${projectName} - would exceed max_context_tokens`);
          continue;
        }

        projectContexts += projectContext;
        totalTokens += projectTokens;
      }

      contextString += projectContexts;

      Logger.info(`Memory context built - estimated tokens: ${totalTokens}`);
      return { context: contextString, memoryConfig: this.memoryConfig };
    } catch (error) {
      Logger.error(`Error building memory context: ${error.message}`);
      return { context: '', memoryConfig: this.memoryConfig || null };
    }
  }

  /**
   * Get memory statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getMemoryStats() {
    try {
      await this._ensure();
      const projects = await this.listProjects();
      let totalFileCount = 0;
      let totalSize = 0;

      for (const project of projects) {
        const files = await globalThis.DriveClient.listFiles(project.id, 'trashed=false');
        if (files) {
          totalFileCount += files.length;
          // Sum file sizes if available
          for (const file of files) {
            if (file.size) {
              totalSize += parseInt(file.size, 10);
            }
          }
        }
      }

      const activeNames = await this.getActiveProjects();
      const estimatedTokens = Math.ceil(totalSize / 4);

      return {
        projectCount: projects.length,
        fileCount: totalFileCount,
        totalSize: totalSize,
        memoryFolderId: this.memoryFolderId,
        isConfigured: !!this.memoryFolderId,
        maxContextTokens: (await ConfigManager.getConfig()).memory?.max_context_tokens || 4000,
        // Alias keys read by memory-tab, danman-tab, and options UIs
        totalProjects: projects.length,
        totalFiles: totalFileCount,
        totalMemories: totalFileCount,
        contextTokens: estimatedTokens,
        estimatedTokens: estimatedTokens,
        activeProjects: activeNames.length,
        activeProject: activeNames[0] || null
      };
    } catch (error) {
      Logger.error(`Error getting memory stats: ${error.message}`);
      return {
        projectCount: 0,
        fileCount: 0,
        totalSize: 0,
        memoryFolderId: this.memoryFolderId,
        isConfigured: !!this.memoryFolderId,
        totalProjects: 0,
        totalFiles: 0,
        totalMemories: 0,
        contextTokens: 0,
        estimatedTokens: 0,
        activeProjects: 0,
        activeProject: null,
        error: error.message
      };
    }
  }

  /**
   * Delete a project (trashes its Drive folder)
   * @param {string} projectId - Project folder ID or project name
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteProject(projectId) {
    try {
      await this._ensure();
      if (!projectId) {
        Logger.error('No project ID provided');
        return false;
      }

      const projects = await this.listProjects();
      const project = projects.find(p => p.id === projectId || p.name === projectId);
      if (!project) {
        Logger.warn(`Project not found: ${projectId}`);
        return false;
      }

      await globalThis.DriveClient.trashFile(project.id);

      // Drop from active list if present
      if (this.memoryConfig && Array.isArray(this.memoryConfig.active_projects) &&
          this.memoryConfig.active_projects.includes(project.name)) {
        this.memoryConfig.active_projects = this.memoryConfig.active_projects.filter(n => n !== project.name);
        await this.saveMemoryConfig(this.memoryConfig);
      }
      this.activeProjects = this.activeProjects.filter(n => n !== project.name);

      Logger.info(`Project deleted: ${project.name}`);
      return true;
    } catch (error) {
      Logger.error(`Error deleting project: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear all memory — trashes every project folder under the projects folder
   * @returns {Promise<boolean>} True if cleared
   */
  async clearAll() {
    try {
      await this._ensure();
      const projectsFolderId = await this._getProjectsFolderId();
      if (!projectsFolderId) {
        Logger.warn('Projects folder not found, nothing to clear');
        return true;
      }

      const folders = await globalThis.DriveClient.listFolders(projectsFolderId);
      for (const folder of (folders || [])) {
        try {
          await globalThis.DriveClient.trashFile(folder.id);
        } catch (error) {
          Logger.warn(`Failed to trash project folder ${folder.name}: ${error.message}`);
        }
      }

      if (this.memoryConfig) {
        this.memoryConfig.active_projects = [];
        await this.saveMemoryConfig(this.memoryConfig);
      }
      this.activeProjects = [];

      Logger.info('All memory projects cleared');
      return true;
    } catch (error) {
      Logger.error(`Error clearing memory: ${error.message}`);
      return false;
    }
  }

  /**
   * Internal helper: Get or find projects folder ID
   * @private
   * @returns {Promise<string|null>} Projects folder ID
   */
  async _getProjectsFolderId() {
    try {
      if (this.projectsFolderId) {
        return this.projectsFolderId;
      }

      await this._ensure();
      if (!this.memoryFolderId) {
        return null;
      }

      const files = await globalThis.DriveClient.listFolders(this.memoryFolderId);
      if (!files) {
        return null;
      }

      const projectsFolder = files.find(f => f.name === 'projects');
      if (projectsFolder) {
        this.projectsFolderId = projectsFolder.id;
        return this.projectsFolderId;
      }

      // Create projects folder if it doesn't exist
      const newProjectsFolder = await globalThis.DriveClient.createFolder(
        'projects',
        this.memoryFolderId
      );

      if (newProjectsFolder && newProjectsFolder.id) {
        this.projectsFolderId = newProjectsFolder.id;
        return this.projectsFolderId;
      }

      return null;
    } catch (error) {
      Logger.error(`Error getting projects folder ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Internal helper: Determine MIME type from filename
   * @private
   * @param {string} fileName - File name
   * @returns {string} MIME type
   */
  _getMimeType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();

    const mimeTypes = {
      'json': 'application/json',
      'txt': 'text/plain',
      'md': 'text/markdown',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'pdf': 'application/pdf',
      'csv': 'text/csv',
      'xml': 'application/xml'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Internal helper: Estimate token count for text
   * @private
   * @param {string} text - Text to estimate
   * @returns {number} Approximate token count
   */
  _estimateTokens(text) {
    if (!text) return 0;
    // Rough estimation: 1 token ~= 4 characters
    return Math.ceil(text.length / 4);
  }
}

// Export as global
globalThis.MemoryManager = new MemoryManager();

// memory.js