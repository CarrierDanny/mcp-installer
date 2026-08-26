/**
 * Bridge_Drive.gs — Google Drive tools for the DANMAN Bridge.
 * ─────────────────────────────────────────────────────────────────────────────
 * THE POINT: a browser extension can't write to Google Drive on its own — it
 * has no standing credential. This file lets the extension do all its Drive
 * work THROUGH your Apps Script backend, which runs as YOU (Execute as: Me).
 * So once this is deployed, the extension only needs a Folder ID — no OAuth
 * token, nothing that expires. Any folder you own is reachable.
 *
 * It is additive: drop it into a project that already has a Bridge_*.gs (its
 * tools merge in) or into an empty project as the only tool file.
 *
 * INSTALL:
 * 1. Copy DANMAN_Bridge.gs (the core) + this file into a GAS project. The
 *    project must have Drive access — the default Drive scope is requested
 *    automatically the first time a Drive tool runs; approve it once.
 * 2. Wire doPost per DANMAN_Bridge.gs's header (or use its fallback doPost if
 *    the project has none of its own).
 * 3. Script Properties → set BRIDGE_SECRET to a strong value.
 * 4. Deploy → Web App (Execute as: Me, Access: Anyone). Redeploy after edits.
 * 5. In the extension: Bridge tab → Add the /exec URL + secret, dialect
 *    "DANMAN Bridge kit" → Test → Discover. Then set the memory Folder ID —
 *    it now works with just the ID.
 *
 * Folders created/served are whatever the DEPLOYING account can access, so
 * the memory Folder ID must be a folder that account owns or can edit.
 */

function danmanDriveBridgeTools_() {
  function folderById_(id) {
    try { return DriveApp.getFolderById(id); }
    catch (e) { throw new Error('Folder ID invalid or not accessible by this account: ' + id); }
  }

  function subfolder_(parent, name) {
    var it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  }

  return {
    service: 'DANMAN Drive Bridge',
    version: '1.0',
    caps: {
      // marker verb the extension routes on, plus the granular ops it calls
      'drive': 'drive_init',
      'drive.init': 'drive_init',
      'drive.list': 'drive_list',
      'drive.createFolder': 'drive_create_folder',
      'drive.createFile': 'drive_create_file',
      'drive.updateFile': 'drive_update_file',
      'drive.readFile': 'drive_read_file'
    },
    tools: {
      drive_init: {
        description: 'Validate a memory folder and create its routing subfolders',
        category: 'drive',
        params: [{ key: 'folderId', label: 'Folder ID', type: 'string', required: true }],
        handler: function (a) {
          var root = folderById_(a.folderId);
          var subs = {};
          ['projects', 'chats', 'uploads', 'rag', 'transcripts'].forEach(function (n) {
            subs[n] = subfolder_(root, n).getId();
          });
          return { ok: true, folderId: root.getId(), name: root.getName(), subfolders: subs };
        }
      },
      drive_list: {
        description: 'List files/folders in a folder (optional exact-name filter)',
        category: 'drive',
        params: [
          { key: 'folderId', label: 'Folder ID', type: 'string', required: true },
          { key: 'nameQuery', label: 'Exact name (optional)', type: 'string', required: false }
        ],
        handler: function (a) {
          var folder = folderById_(a.folderId);
          var out = [];
          var files = a.nameQuery ? folder.getFilesByName(a.nameQuery) : folder.getFiles();
          while (files.hasNext()) { var f = files.next(); out.push({ id: f.getId(), name: f.getName(), mimeType: f.getMimeType() }); }
          var folders = a.nameQuery ? folder.getFoldersByName(a.nameQuery) : folder.getFolders();
          while (folders.hasNext()) { var d = folders.next(); out.push({ id: d.getId(), name: d.getName(), mimeType: 'application/vnd.google-apps.folder' }); }
          return { files: out };
        }
      },
      drive_create_folder: {
        description: 'Create (or reuse) a subfolder',
        category: 'drive',
        params: [
          { key: 'name', label: 'Name', type: 'string', required: true },
          { key: 'parentId', label: 'Parent folder ID', type: 'string', required: true }
        ],
        handler: function (a) {
          var parent = folderById_(a.parentId);
          var folder = subfolder_(parent, a.name); // idempotent
          return { id: folder.getId(), name: folder.getName() };
        }
      },
      drive_create_file: {
        description: 'Create a file (text, or base64 for binary/media)',
        category: 'drive',
        params: [
          { key: 'name', label: 'Name', type: 'string', required: true },
          { key: 'content', label: 'Content', type: 'text', required: true },
          { key: 'mimeType', label: 'MIME type', type: 'string', required: false },
          { key: 'folderId', label: 'Folder ID', type: 'string', required: true },
          { key: 'base64', label: 'Content is base64', type: 'boolean', required: false }
        ],
        handler: function (a) {
          var folder = folderById_(a.folderId);
          var mime = a.mimeType || 'text/plain';
          var file;
          if (a.base64 || a.contentEncoding === 'base64') {
            var blob = Utilities.newBlob(Utilities.base64Decode(a.content), mime, a.name);
            file = folder.createFile(blob);
          } else {
            file = folder.createFile(a.name, a.content, mime);
          }
          return { id: file.getId(), name: file.getName(), mimeType: file.getMimeType() };
        }
      },
      drive_update_file: {
        description: 'Overwrite a text file\'s content',
        category: 'drive',
        params: [
          { key: 'fileId', label: 'File ID', type: 'string', required: true },
          { key: 'content', label: 'Content', type: 'text', required: true },
          { key: 'mimeType', label: 'MIME type', type: 'string', required: false }
        ],
        handler: function (a) {
          var file = DriveApp.getFileById(a.fileId);
          file.setContent(a.content);
          return { id: file.getId(), name: file.getName() };
        }
      },
      drive_read_file: {
        description: 'Read a text file\'s content',
        category: 'drive',
        params: [{ key: 'fileId', label: 'File ID', type: 'string', required: true }],
        handler: function (a) {
          var file = DriveApp.getFileById(a.fileId);
          return { id: file.getId(), name: file.getName(), content: file.getBlob().getDataAsString() };
        }
      }
    }
  };
}
