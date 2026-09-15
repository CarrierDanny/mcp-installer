/**
 * VERSION: V002R015
 * DATE: 2026-09-15
 * CHANGE: Class renamed SetupWizardImpl so it no longer shadows globalThis.SetupWizard (SETUP_* routes threw "not a function")
 * HISTORY:
 *   V001R1157 2026-08-26 Baseline import (unstamped)
 */
// ============================================================================
// File: setup-wizard.js
// Purpose: One-Click Backend Setup module for GetPower DANMAN Firefox extension
// Handles creating entire backend infrastructure with minimal user input
// ============================================================================

/**
 * SetupWizard - Orchestrates backend infrastructure setup
 * Manages Google API authentication, Spreadsheet creation, Drive folder structure,
 * and Apps Script webhook deployment
 */
// Named SetupWizardImpl so the class binding does not shadow globalThis.SetupWizard
// (see memory.js for the same fix).
class SetupWizardImpl {
  constructor() {
    this.browser = globalThis.Browser;
    this.configManager = globalThis.ConfigManager;
    this.logger = globalThis.Logger;

    // Setup state tracking
    this.setupState = {
      oauthToken: null,
      spreadsheetId: null,
      folderId: null,
      folderStructure: {},
      webhookCode: null,
      completedSteps: [],
      errors: []
    };
  }

  /**
   * Check what's already configured and what's missing
   * @returns {Promise<Object>} Status object with missing components
   */
  async getSetupStatus() {
    try {
      this.logger.info('[SetupWizard] Checking setup status');

      const config = await this.configManager.getAll();
      const status = {
        spreadsheetConfigured: !!config.google_spreadsheet_id,
        spreadsheetId: config.google_spreadsheet_id || null,
        folderConfigured: !!config.google_drive_folder_id,
        folderId: config.google_drive_folder_id || null,
        oauthTokenConfigured: !!config.google_oauth_token,
        webhookUrlConfigured: !!config.apps_script_webhook_url,
        needsSetup: {
          spreadsheet: !config.google_spreadsheet_id,
          folders: !config.google_drive_folder_id,
          oauth: !config.google_oauth_token,
          webhook: !config.apps_script_webhook_url,
          llmKeys: !config.anthropic_api_key && !config.openai_api_key
        },
        allRequirementsmet: !!(config.google_spreadsheet_id && config.google_drive_folder_id && config.google_oauth_token),
        missingLlmKeys: !config.anthropic_api_key && !config.openai_api_key
      };

      this.logger.info('[SetupWizard] Setup status:', status);
      return status;
    } catch (error) {
      this.logger.error('[SetupWizard] Error checking setup status:', error);
      throw error;
    }
  }

  /**
   * Main setup orchestrator
   * @param {Object} options - Setup options
   * @param {string} options.oauthToken - Google OAuth2 token
   * @param {boolean} options.createSpreadsheet - Create spreadsheet
   * @param {boolean} options.createFolders - Create folder structure
   * @param {boolean} options.generateWebhook - Generate webhook code
   * @returns {Promise<Object>} Setup progress and results
   */
  async runSetup(options = {}) {
    try {
      this.logger.info('[SetupWizard] Starting setup with options:', options);

      const {
        oauthToken,
        createSpreadsheet = true,
        createFolders = true,
        generateWebhook = true
      } = options;

      if (!oauthToken) {
        throw new Error('OAuth token is required for setup');
      }

      this.setupState.oauthToken = oauthToken;
      const progress = [];

      // Step 1: Validate OAuth token
      progress.push({
        step: 'Validating Google OAuth token',
        status: 'in_progress',
        timestamp: new Date().toISOString()
      });
      await this._validateOAuthToken(oauthToken);
      progress[progress.length - 1].status = 'completed';
      this.setupState.completedSteps.push('oauth_validation');
      this.logger.info('[SetupWizard] OAuth token validated');

      // Step 2: Create Spreadsheet
      if (createSpreadsheet) {
        progress.push({
          step: 'Creating Google Spreadsheet',
          status: 'in_progress',
          timestamp: new Date().toISOString()
        });
        const spreadsheetId = await this.createSpreadsheet(oauthToken);
        this.setupState.spreadsheetId = spreadsheetId;
        progress[progress.length - 1].status = 'completed';
        progress[progress.length - 1].result = { spreadsheetId };
        this.setupState.completedSteps.push('spreadsheet_created');
        this.logger.info('[SetupWizard] Spreadsheet created:', spreadsheetId);
      }

      // Step 3: Create Drive Folders
      if (createFolders) {
        progress.push({
          step: 'Creating Google Drive folder structure',
          status: 'in_progress',
          timestamp: new Date().toISOString()
        });
        const folderId = await this.createFolderStructure(oauthToken);
        this.setupState.folderId = folderId;
        progress[progress.length - 1].status = 'completed';
        progress[progress.length - 1].result = { folderId };
        this.setupState.completedSteps.push('folders_created');
        this.logger.info('[SetupWizard] Folder structure created:', folderId);
      }

      // Step 4: Generate Webhook Code
      if (generateWebhook && this.setupState.spreadsheetId && this.setupState.folderId) {
        progress.push({
          step: 'Generating Apps Script webhook code',
          status: 'in_progress',
          timestamp: new Date().toISOString()
        });
        const webhookCode = this.generateWebhookCode(
          this.setupState.spreadsheetId,
          this.setupState.folderId
        );
        this.setupState.webhookCode = webhookCode;
        progress[progress.length - 1].status = 'completed';
        this.setupState.completedSteps.push('webhook_generated');
        this.logger.info('[SetupWizard] Webhook code generated');
      }

      // Step 5: Save configuration
      progress.push({
        step: 'Saving configuration',
        status: 'in_progress',
        timestamp: new Date().toISOString()
      });
      await this._saveSetupConfiguration();
      progress[progress.length - 1].status = 'completed';
      this.setupState.completedSteps.push('config_saved');
      this.logger.info('[SetupWizard] Configuration saved');

      this.logger.info('[SetupWizard] Setup completed successfully');
      return {
        success: true,
        progress,
        results: {
          spreadsheetId: this.setupState.spreadsheetId,
          folderId: this.setupState.folderId,
          webhookCode: this.setupState.webhookCode
        },
        completedSteps: this.setupState.completedSteps,
        nextSteps: this._getNextSteps()
      };
    } catch (error) {
      this.logger.error('[SetupWizard] Setup failed:', error);
      this.setupState.errors.push({
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Create the master Google Spreadsheet with all required sheets
   * @param {string} oauthToken - Google OAuth2 token
   * @returns {Promise<string>} Spreadsheet ID
   */
  async createSpreadsheet(oauthToken) {
    try {
      this.logger.info('[SetupWizard.createSpreadsheet] Creating spreadsheet');

      // Create spreadsheet
      const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${oauthToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: 'DANMAN_Master_Data',
            locale: 'en_US',
            timeZone: 'UTC'
          },
          sheets: []
        })
      });

      if (!createResponse.ok) {
        throw new Error(`Failed to create spreadsheet: ${createResponse.statusText}`);
      }

      const spreadsheet = await createResponse.json();
      const spreadsheetId = spreadsheet.spreadsheetId;
      this.logger.info('[SetupWizard.createSpreadsheet] Spreadsheet created:', spreadsheetId);

      // Define sheet configurations
      const sheets = [
        {
          name: 'Activity_Log',
          headers: ['Timestamp', 'Session ID', 'Event Type', 'Details', 'URL', 'Duration', 'Status']
        },
        {
          name: 'Scrape_Results',
          headers: ['Timestamp', 'URL', 'Title', 'Word Count', 'Headings', 'Images', 'Tables', 'Session ID']
        },
        {
          name: 'Form_Fields',
          headers: ['Timestamp', 'Page URL', 'Form Index', 'Field ID', 'Field Name', 'Field Type', 'Placeholder', 'Required', 'Options', 'Accepted Values', 'Label']
        },
        {
          name: 'EJECT_History',
          headers: ['Timestamp', 'Source URL', 'Provider', 'Subject', 'From', 'Contact Name', 'Company', 'Serial', 'Phone', 'Email', 'Equipment', 'Issue', 'Confidence', 'Score', 'Status']
        },
        {
          name: 'Links',
          headers: ['Timestamp', 'Source URL', 'Link URL', 'Display Text', 'Internal/External', 'Domain', 'Session ID']
        },
        {
          name: 'Config',
          headers: ['Key', 'Value', 'Updated']
        }
      ];

      // Create each sheet with headers
      const batchUpdateRequest = {
        requests: []
      };

      for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i];

        if (i === 0) {
          // Delete the default Sheet1
          batchUpdateRequest.requests.push({
            deleteSheet: {
              sheetId: 0
            }
          });
        }

        // Create new sheet
        batchUpdateRequest.requests.push({
          addSheet: {
            properties: {
              title: sheet.name,
              gridProperties: {
                rowCount: 1000,
                columnCount: sheet.headers.length
              }
            }
          }
        });
      }

      const batchResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${oauthToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(batchUpdateRequest)
      });

      if (!batchResponse.ok) {
        throw new Error(`Failed to create sheets: ${batchResponse.statusText}`);
      }

      await batchResponse.json();
      this.logger.info('[SetupWizard.createSpreadsheet] Sheets created');

      // Add headers to each sheet
      const sheetsData = [];
      for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i];
        sheetsData.push({
          range: `${sheet.name}!A1`,
          values: [sheet.headers]
        });
      }

      const valuesResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${oauthToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: sheetsData,
          valueInputOption: 'RAW'
        })
      });

      if (!valuesResponse.ok) {
        throw new Error(`Failed to add headers: ${valuesResponse.statusText}`);
      }

      await valuesResponse.json();
      this.logger.info('[SetupWizard.createSpreadsheet] Headers added to all sheets');

      return spreadsheetId;
    } catch (error) {
      this.logger.error('[SetupWizard.createSpreadsheet] Error:', error);
      throw error;
    }
  }

  /**
   * Create the Google Drive folder structure
   * @param {string} oauthToken - Google OAuth2 token
   * @param {string} parentFolderId - Optional parent folder ID
   * @returns {Promise<string>} Root folder ID
   */
  async createFolderStructure(oauthToken, parentFolderId = null) {
    try {
      this.logger.info('[SetupWizard.createFolderStructure] Creating folder structure');

      const folderStructure = {
        'DANMAN_Data': {
          children: {
            'Scrapes': {},
            'Forms': {},
            'Memory': {
              children: {
                'projects': {}
              }
            },
            'Exports': {},
            'Logs': {}
          }
        }
      };

      // Create root folder
      const rootFolderId = await this._createDriveFolder(
        oauthToken,
        'DANMAN_Data',
        parentFolderId
      );

      this.setupState.folderStructure['DANMAN_Data'] = {
        id: rootFolderId,
        children: {}
      };

      // Create subfolders
      const subfolders = ['Scrapes', 'Forms', 'Exports', 'Logs'];
      for (const subfolder of subfolders) {
        const subfolderId = await this._createDriveFolder(
          oauthToken,
          subfolder,
          rootFolderId
        );
        this.setupState.folderStructure['DANMAN_Data'].children[subfolder] = {
          id: subfolderId
        };
        this.logger.info(`[SetupWizard.createFolderStructure] Created folder: ${subfolder}`);
      }

      // Create Memory folder with projects subfolder
      const memoryFolderId = await this._createDriveFolder(
        oauthToken,
        'Memory',
        rootFolderId
      );
      this.setupState.folderStructure['DANMAN_Data'].children['Memory'] = {
        id: memoryFolderId,
        children: {}
      };

      const projectsFolderId = await this._createDriveFolder(
        oauthToken,
        'projects',
        memoryFolderId
      );
      this.setupState.folderStructure['DANMAN_Data'].children['Memory'].children['projects'] = {
        id: projectsFolderId
      };

      this.logger.info('[SetupWizard.createFolderStructure] Folder structure created');
      return rootFolderId;
    } catch (error) {
      this.logger.error('[SetupWizard.createFolderStructure] Error:', error);
      throw error;
    }
  }

  /**
   * Create a single Drive folder
   * @private
   * @param {string} oauthToken - Google OAuth2 token
   * @param {string} folderName - Folder name
   * @param {string} parentFolderId - Parent folder ID
   * @returns {Promise<string>} Folder ID
   */
  async _createDriveFolder(oauthToken, folderName, parentFolderId = null) {
    try {
      const metadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      };

      if (parentFolderId) {
        metadata.parents = [parentFolderId];
      }

      const response = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${oauthToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });

      if (!response.ok) {
        throw new Error(`Failed to create folder ${folderName}: ${response.statusText}`);
      }

      const folder = await response.json();
      this.logger.info(`[SetupWizard._createDriveFolder] Folder created: ${folderName} (${folder.id})`);
      return folder.id;
    } catch (error) {
      this.logger.error('[SetupWizard._createDriveFolder] Error creating folder:', error);
      throw error;
    }
  }

  /**
   * Generate the Apps Script webhook code
   * @param {string} spreadsheetId - Google Spreadsheet ID
   * @param {string} folderId - Google Drive folder ID
   * @returns {string} Complete Apps Script code
   */
  generateWebhookCode(spreadsheetId, folderId) {
    try {
      this.logger.info('[SetupWizard.generateWebhookCode] Generating webhook code');

      const webhookCode = `
// ============================================================================
// Google Apps Script: DANMAN Backend Webhook
// Purpose: Handle data logging, sheet management, and file operations
// Generated by SetupWizard for GetPower DANMAN Firefox extension
// ============================================================================

// Configuration
const SPREADSHEET_ID = "${spreadsheetId}";
const DRIVE_FOLDER_ID = "${folderId}";
const WEBHOOK_SECRET = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET') || 'default-secret-change-me';

/**
 * Main webhook handler
 * @param {Object} e - Request event
 * @returns {TextOutput} Response
 */
function doPost(e) {
  try {
    const contentType = e.contentType;
    const postData = JSON.parse(e.postData.contents);

    // Validate secret
    if (postData.secret !== WEBHOOK_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Invalid secret'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    let response;

    switch (postData.action) {
      case 'activity_log':
        response = handleActivityLog(postData);
        break;
      case 'write_results':
        response = handleWriteResults(postData);
        break;
      case 'read':
        response = handleRead(postData);
        break;
      case 'write':
        response = handleWrite(postData);
        break;
      case 'append':
        response = handleAppend(postData);
        break;
      case 'listSheets':
        response = handleListSheets(postData);
        break;
      case 'create_file':
        response = handleCreateFile(postData);
        break;
      case 'create_folder':
        response = handleCreateFolder(postData);
        break;
      case 'list_files':
        response = handleListFiles(postData);
        break;
      case 'get_config':
      case 'sync_config':
        response = handleGetConfig(postData);
        break;
      case 'ping':
        response = { success: true, ok: true, service: 'DANMAN Backend Webhook', version: '7.5.1' };
        break;
      default:
        response = { success: false, error: 'Unknown action: ' + postData.action };
    }

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('Error in doPost: ' + error);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle activity log entries
 * @param {Object} data - Request data
 * @returns {Object} Response
 */
function handleActivityLog(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Activity_Log');

    if (!sheet) {
      return { success: false, error: 'Activity_Log sheet not found' };
    }

    const row = [
      data.timestamp || new Date().toISOString(),
      data.sessionId || '',
      data.eventType || '',
      data.details || '',
      data.url || '',
      data.duration || 0,
      data.status || 'pending'
    ];

    sheet.appendRow(row);
    return { success: true, message: 'Activity logged' };
  } catch (error) {
    Logger.log('Error in handleActivityLog: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Handle write results - routes to appropriate sheet
 * @param {Object} data - Request data
 * @returns {Object} Response
 */
function handleWriteResults(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetName = data.sheetName || 'Scrape_Results';
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return { success: false, error: 'Sheet not found: ' + sheetName };
    }

    const row = data.row || [];
    sheet.appendRow(row);
    return { success: true, message: 'Results written to ' + sheetName };
  } catch (error) {
    Logger.log('Error in handleWriteResults: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Handle read from sheet
 * @param {Object} data - Request data
 * @returns {Object} Response
 */
function handleRead(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const range = data.range || 'Activity_Log!A1:G100';
    const values = ss.getRange(range).getValues();

    return {
      success: true,
      data: values,
      message: 'Data read from ' + range
    };
  } catch (error) {
    Logger.log('Error in handleRead: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Handle write to sheet
 * @param {Object} data - Request data
 * @returns {Object} Response
 */
function handleWrite(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const range = data.range || 'Activity_Log!A1';
    const values = data.values || [];

    ss.getRange(range).setValues(values);
    return { success: true, message: 'Data written to ' + range };
  } catch (error) {
    Logger.log('Error in handleWrite: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Handle append to sheet
 * @param {Object} data - Request data
 * @returns {Object} Response
 */
function handleAppend(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetName = data.sheetName || 'Activity_Log';
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return { success: false, error: 'Sheet not found: ' + sheetName };
    }

    const row = data.row || [];
    sheet.appendRow(row);
    return { success: true, message: 'Row appended to ' + sheetName };
  } catch (error) {
    Logger.log('Error in handleAppend: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * List all sheets
 * @param {Object} data - Request data
 * @returns {Object} Response
 */
function handleListSheets(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheets = ss.getSheets();
    const sheetNames = sheets.map(function(sheet) {
      return {
        name: sheet.getName(),
        id: sheet.getSheetId(),
        rowCount: sheet.getLastRow(),
        columnCount: sheet.getLastColumn()
      };
    });

    return {
      success: true,
      sheets: sheetNames,
      message: 'Listed ' + sheetNames.length + ' sheets'
    };
  } catch (error) {
    Logger.log('Error in handleListSheets: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Create file in Drive folder
 * @param {Object} data - Request data
 * @returns {Object} Response
 */
function handleCreateFile(data) {
  try {
    const folderName = data.folderName || 'Exports';
    const fileName = data.fileName || 'file_' + new Date().getTime();
    const fileContent = data.fileContent || '';
    const mimeType = data.mimeType || 'text/plain';

    const parentFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const subfolder = parentFolder.getFoldersByName(folderName);

    if (subfolder.hasNext()) {
      const folder = subfolder.next();
      const file = folder.createFile(fileName, fileContent, mimeType);
      return {
        success: true,
        fileId: file.getId(),
        fileName: file.getName(),
        message: 'File created'
      };
    } else {
      return { success: false, error: 'Folder not found: ' + folderName };
    }
  } catch (error) {
    Logger.log('Error in handleCreateFile: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Create subfolder in Drive
 * @param {Object} data - Request data
 * @returns {Object} Response
 */
function handleCreateFolder(data) {
  try {
    const parentFolderName = data.parentFolderName || 'Exports';
    const newFolderName = data.folderName || 'subfolder_' + new Date().getTime();

    const parentFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const subfolder = parentFolder.getFoldersByName(parentFolderName);

    if (subfolder.hasNext()) {
      const folder = subfolder.next();
      const newFolder = folder.createFolder(newFolderName);
      return {
        success: true,
        folderId: newFolder.getId(),
        folderName: newFolder.getName(),
        message: 'Folder created'
      };
    } else {
      return { success: false, error: 'Parent folder not found: ' + parentFolderName };
    }
  } catch (error) {
    Logger.log('Error in handleCreateFolder: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * List files in folder
 * @param {Object} data - Request data
 * @returns {Object} Response
 */
function handleListFiles(data) {
  try {
    const folderName = data.folderName || 'Exports';
    const parentFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const subfolders = parentFolder.getFoldersByName(folderName);

    if (subfolders.hasNext()) {
      const folder = subfolders.next();
      const files = folder.getFiles();
      const fileList = [];

      while (files.hasNext()) {
        const file = files.next();
        fileList.push({
          id: file.getId(),
          name: file.getName(),
          size: file.getSize(),
          mimeType: file.getMimeType(),
          created: file.getDateCreated().toISOString()
        });
      }

      return {
        success: true,
        folder: folderName,
        files: fileList,
        count: fileList.length,
        message: 'Listed ' + fileList.length + ' files'
      };
    } else {
      return { success: false, error: 'Folder not found: ' + folderName };
    }
  } catch (error) {
    Logger.log('Error in handleListFiles: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Return IDs + Script Properties for extension unified sync.
 */
function handleGetConfig(data) {
  var props = {};
  try { props = PropertiesService.getScriptProperties().getProperties() || {}; } catch (e) { props = {}; }
  var gasUi = props.GAS_UI_URL || props.HTML_APP_URL || props.COPILOT_UI_URL || '';
  var config = {
    sheets: {
      spreadsheet_id: SPREADSHEET_ID,
      drive_folder_id: DRIVE_FOLDER_ID,
      method: 'webhook'
    },
    backend: { master_folder_id: DRIVE_FOLDER_ID },
    memory: {
      folder_id: DRIVE_FOLDER_ID,
      drive_folder_id: DRIVE_FOLDER_ID,
      enabled: true
    },
    setup: {
      spreadsheet_id: SPREADSHEET_ID,
      drive_root_folder_id: DRIVE_FOLDER_ID,
      completed: true
    },
    gas_ui: { url: gasUi },
    api_keys: {}
  };
  if (props.CLAUDE_API_KEY || props.ANTHROPIC_API_KEY) {
    config.api_keys.claude = props.CLAUDE_API_KEY || props.ANTHROPIC_API_KEY;
  }
  if (props.OPENAI_API_KEY) config.api_keys.openai = props.OPENAI_API_KEY;
  if (props.GEMINI_API_KEY || props.GOOGLE_AI_API_KEY) {
    config.api_keys.gemini = props.GEMINI_API_KEY || props.GOOGLE_AI_API_KEY;
  }
  if (props.FIRECRAWL_API_KEY) config.api_keys.firecrawl = props.FIRECRAWL_API_KEY;
  return {
    success: true,
    ok: true,
    config: config,
    properties: props,
    spreadsheet_id: SPREADSHEET_ID,
    drive_folder_id: DRIVE_FOLDER_ID,
    gas_ui_url: gasUi
  };
}

/**
 * Handle GET requests (HTML console or JSON health check)
 * @param {Object} e - Request event
 * @returns {HtmlOutput|TextOutput} Response
 */
function doGet(e) {
  var format = (e && e.parameter && e.parameter.format) || '';
  if (format === 'json') {
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'DANMAN Backend Webhook is running',
      spreadsheetId: SPREADSHEET_ID,
      folderId: DRIVE_FOLDER_ID
    })).setMimeType(ContentService.MimeType.JSON);
  }
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>DANMAN GAS Console</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px}' +
    'code{background:#1e293b;padding:2px 6px;border-radius:4px}.card{background:#1e293b;border-radius:12px;padding:16px;margin:12px 0}' +
    'a{color:#38bdf8}</style></head><body>' +
    '<h1>DANMAN Backend</h1><div class="card"><p>Webhook is live.</p>' +
    '<p>Spreadsheet: <code>' + SPREADSHEET_ID + '</code></p>' +
    '<p>Drive folder: <code>' + DRIVE_FOLDER_ID + '</code></p>' +
    '<p>Use the extension Settings tab → Sync from Webhook to import these IDs.</p></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('DANMAN GAS Console');
}
`;

      this.logger.info('[SetupWizard.generateWebhookCode] Webhook code generated');
      return webhookCode;
    } catch (error) {
      this.logger.error('[SetupWizard.generateWebhookCode] Error:', error);
      throw error;
    }
  }

  /**
   * Validate the OAuth token
   * @private
   * @param {string} oauthToken - Google OAuth2 token
   * @returns {Promise<boolean>} True if valid
   */
  async _validateOAuthToken(oauthToken) {
    try {
      this.logger.info('[SetupWizard._validateOAuthToken] Validating OAuth token');

      const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + oauthToken);

      if (!response.ok) {
        throw new Error(`Token validation failed: ${response.statusText}`);
      }

      const tokenInfo = await response.json();

      if (tokenInfo.error) {
        throw new Error(`Token error: ${tokenInfo.error}`);
      }

      this.logger.info('[SetupWizard._validateOAuthToken] Token is valid');
      return true;
    } catch (error) {
      this.logger.error('[SetupWizard._validateOAuthToken] Error:', error);
      throw error;
    }
  }

  /**
   * Save setup configuration to config manager
   * @private
   * @returns {Promise<void>}
   */
  async _saveSetupConfiguration() {
    try {
      this.logger.info('[SetupWizard._saveSetupConfiguration] Saving configuration');

      const configUpdates = {
        google_oauth_token: this.setupState.oauthToken,
        google_spreadsheet_id: this.setupState.spreadsheetId,
        google_drive_folder_id: this.setupState.folderId,
        folder_structure: JSON.stringify(this.setupState.folderStructure),
        setup_completed: new Date().toISOString(),
        setup_status: 'completed'
      };

      for (const [key, value] of Object.entries(configUpdates)) {
        await this.configManager.set(key, value);
      }

      this.logger.info('[SetupWizard._saveSetupConfiguration] Configuration saved');
    } catch (error) {
      this.logger.error('[SetupWizard._saveSetupConfiguration] Error:', error);
      throw error;
    }
  }

  /**
   * Get next steps after setup
   * @private
   * @returns {Array<string>} Next steps
   */
  _getNextSteps() {
    const steps = [];

    if (!this.setupState.webhookCode) {
      steps.push('Copy and deploy the webhook code to Google Apps Script');
    }

    steps.push('Save your LLM API keys (Anthropic or OpenAI)');
    steps.push('Test the setup by clicking "Validate Setup"');

    return steps;
  }

  /**
   * Validate that all setup components are working
   * @returns {Promise<Object>} Validation results
   */
  async validateSetup() {
    try {
      this.logger.info('[SetupWizard.validateSetup] Validating setup');

      const config = await this.configManager.getAll();
      const results = {
        spreadsheetAccessible: false,
        folderAccessible: false,
        sheetsValid: false,
        folderStructureValid: false,
        allValid: false,
        errors: []
      };

      // Test Spreadsheet access
      if (config.google_spreadsheet_id && config.google_oauth_token) {
        try {
          const sheetResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${config.google_spreadsheet_id}`,
            {
              headers: {
                'Authorization': `Bearer ${config.google_oauth_token}`
              }
            }
          );

          if (sheetResponse.ok) {
            const spreadsheet = await sheetResponse.json();
            results.spreadsheetAccessible = true;
            results.sheetsValid = spreadsheet.sheets && spreadsheet.sheets.length > 0;
            this.logger.info('[SetupWizard.validateSetup] Spreadsheet accessible');
          } else {
            results.errors.push('Cannot access spreadsheet');
          }
        } catch (error) {
          results.errors.push('Spreadsheet check failed: ' + error.message);
        }
      } else {
        results.errors.push('Spreadsheet ID or OAuth token missing');
      }

      // Test Drive Folder access
      if (config.google_drive_folder_id && config.google_oauth_token) {
        try {
          const folderResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${config.google_drive_folder_id}`,
            {
              headers: {
                'Authorization': `Bearer ${config.google_oauth_token}`
              }
            }
          );

          if (folderResponse.ok) {
            results.folderAccessible = true;
            results.folderStructureValid = true;
            this.logger.info('[SetupWizard.validateSetup] Folder accessible');
          } else {
            results.errors.push('Cannot access Drive folder');
          }
        } catch (error) {
          results.errors.push('Folder check failed: ' + error.message);
        }
      } else {
        results.errors.push('Folder ID or OAuth token missing');
      }

      results.allValid = results.spreadsheetAccessible && results.folderAccessible && results.sheetsValid;

      this.logger.info('[SetupWizard.validateSetup] Validation complete:', results);
      return results;
    } catch (error) {
      this.logger.error('[SetupWizard.validateSetup] Error:', error);
      throw error;
    }
  }

  /**
   * Get setup instructions for manual steps
   * @returns {Object} Setup instructions
   */
  getSetupInstructions() {
    try {
      this.logger.info('[SetupWizard.getSetupInstructions] Getting setup instructions');

      return {
        steps: [
          {
            step: 1,
            title: 'Google OAuth Authorization',
            description: 'Click "Authorize with Google" to grant the extension access to your Google account',
            action: 'authorize_google',
            scopes: ['drive', 'sheets', 'gmail', 'script']
          },
          {
            step: 2,
            title: 'Create Spreadsheet & Folders',
            description: 'The wizard will automatically create your DANMAN_Master_Data spreadsheet and folder structure',
            action: 'create_infrastructure',
            automatic: true
          },
          {
            step: 3,
            title: 'Deploy Apps Script Webhook',
            description: 'Copy the generated webhook code to Google Apps Script and deploy it',
            action: 'deploy_webhook',
            substeps: [
              'Go to script.google.com',
              'Click "New project"',
              'Copy and paste the webhook code provided',
              'Save the project',
              'Click "Deploy" → "New deployment"',
              'Select type "Web app"',
              'Set "Execute as" to your Google account',
              'Set "Who has access" to "Anyone"',
              'Click "Deploy" and copy the deployment URL',
              'Return to this extension and paste the URL'
            ]
          },
          {
            step: 4,
            title: 'Add LLM API Keys',
            description: 'Enter your API keys for Anthropic Claude or OpenAI',
            action: 'add_llm_keys',
            automatic: false,
            note: 'You can use either Anthropic Claude or OpenAI, or both'
          },
          {
            step: 5,
            title: 'Validate Setup',
            description: 'Test that all components are working correctly',
            action: 'validate_setup',
            automatic: false
          }
        ],
        estimatedTime: '10-15 minutes',
        requirements: [
          'Google account with Drive and Sheets access',
          'OpenAI API key OR Anthropic API key',
          'Basic familiarity with Google Apps Script'
        ]
      };
    } catch (error) {
      this.logger.error('[SetupWizard.getSetupInstructions] Error:', error);
      throw error;
    }
  }

  /**
   * Reset setup to allow reconfiguration
   * @returns {Promise<void>}
   */
  async resetSetup() {
    try {
      this.logger.info('[SetupWizard.resetSetup] Resetting setup');

      const keysToRemove = [
        'google_oauth_token',
        'google_spreadsheet_id',
        'google_drive_folder_id',
        'folder_structure',
        'apps_script_webhook_url',
        'setup_completed',
        'setup_status'
      ];

      for (const key of keysToRemove) {
        await this.configManager.remove(key);
      }

      // Reset internal state
      this.setupState = {
        oauthToken: null,
        spreadsheetId: null,
        folderId: null,
        folderStructure: {},
        webhookCode: null,
        completedSteps: [],
        errors: []
      };

      this.logger.info('[SetupWizard.resetSetup] Setup reset complete');
    } catch (error) {
      this.logger.error('[SetupWizard.resetSetup] Error:', error);
      throw error;
    }
  }
}

// Export a shared instance globally — service-worker.js calls instance
// methods directly (SetupWizard.getSetupStatus(), SetupWizard.runSetup(), …),
// so exporting the bare class made every SETUP_* route throw.
globalThis.SetupWizard = new SetupWizardImpl();
globalThis.SetupWizardClass = SetupWizardImpl;

// ============================================================================
// File: setup-wizard.js
// ============================================================================
