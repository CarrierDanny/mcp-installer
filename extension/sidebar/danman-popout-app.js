// danman-popout-app.js

const MODE = 'popout';
let history             = [];
let sheetContext        = null;
let contextLoaded       = false;
let toastTimer          = null;
let pasteHintTimer      = null;
let resizeDebounceTimer = null;
let pendingAttachments  = [];
let attIdCounter        = 0;
let dragSrcId           = null;
let fillsApplied        = false;

// Filler shared state
var fillerColumnInfo  = null;
var fillerCaseNumbers = [];
var fillerRuleCounter = 0;
var activeFillerTab   = 'ai'; // 'ai' | 'bulk'

const IMAGE_TYPES = ['image/png','image/jpeg','image/gif','image/webp'];
const MAX_FILES = 20, MAX_MB = 50;
const MAX_INPUT_CHARS = 100000;

function updateCharCount() {
  var input = document.getElementById('user-input');
  var el = document.getElementById('char-count');
  if (!input || !el) return;
  var len = input.value.length;
  el.textContent = len + ' / ' + MAX_INPUT_CHARS;
  el.classList.remove('near-limit', 'at-limit');
  if (len >= MAX_INPUT_CHARS) el.classList.add('at-limit');
  else if (len >= MAX_INPUT_CHARS * 0.9) el.classList.add('near-limit');
}

// ── Init ──────────────────────────────────────────────────────────────────
var popoutUiReady = false;

function onUserInputChange() {
  var userInput = document.getElementById('user-input');
  if (!userInput) return;
  if (userInput.value.length > MAX_INPUT_CHARS) {
    userInput.value = userInput.value.slice(0, MAX_INPUT_CHARS);
  }
  autoResize(userInput);
  updateCharCount();
}

function initPopoutChatInput() {
  var userInput = document.getElementById('user-input');
  var sendBtn = document.getElementById('send-btn');
  if (!userInput || userInput.dataset.danmanBound === '1') return;
  userInput.dataset.danmanBound = '1';
  userInput.setAttribute('maxlength', String(MAX_INPUT_CHARS));
  userInput.addEventListener('input', onUserInputChange);
  userInput.addEventListener('keyup', onUserInputChange);
  userInput.addEventListener('change', onUserInputChange);
  userInput.addEventListener('paste', function() {
    setTimeout(onUserInputChange, 0);
  });
  userInput.addEventListener('keydown', function(e) {
    handleKey(e);
  });
  updateCharCount();
  if (sendBtn && sendBtn.dataset.danmanBound !== '1') {
    sendBtn.dataset.danmanBound = '1';
    sendBtn.addEventListener('click', function(e) {
      e.preventDefault();
      sendMessage();
    });
  }
}

function bindPopoutDelegatedActions() {
  if (document.body.dataset.popoutDelegate === '1') return;
  document.body.dataset.popoutDelegate = '1';

  var fileInput = document.getElementById('file-input');
  if (fileInput && fileInput.dataset.danmanBound !== '1') {
    fileInput.dataset.danmanBound = '1';
    fileInput.addEventListener('change', function() {
      handleFileUpload(this.files);
    });
  }

  document.body.addEventListener('click', function(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    switch (action) {
      case 'send-message': e.preventDefault(); sendMessage(); return;
      case 'pick-files': e.preventDefault(); if (fileInput) fileInput.click(); return;
      case 'preset': applyPreset(parseInt(el.getAttribute('data-w'), 10), parseInt(el.getAttribute('data-h'), 10)); return;
      case 'reset-window-size': resetWindowSize(); return;
      case 'toggle-context': toggleContext(); return;
      case 'clear-chat': clearChat(); return;
      case 'refresh-context': refreshContext(); return;
      case 'quick-prompt': quickPrompt(el.getAttribute('data-prompt') || ''); return;
      case 'fill-sheet': triggerFillSheet(); return;
      case 'clear-fills': triggerClearFills(); return;
      case 'open-case-filler': openCaseFiller(); return;
      case 'close-case-filler': closeCaseFiller(); return;
      case 'filler-tab': switchTab(el.getAttribute('data-tab') || 'ai'); return;
      case 'scan-sheet-filler': scanSheetForFiller(); return;
      case 'trigger-ai-suggest': triggerAISuggest(); return;
      case 'clear-all-rules': clearAllRules(); return;
      case 'add-rule-row': addRuleRow(); return;
      case 'run-case-filler': runCaseFiller(); return;
      case 'bulk-select-all': bulkSelectAll(el.getAttribute('data-checked') === 'true'); return;
      case 'bulk-set-mode': bulkSetMode(el.getAttribute('data-mode') || 'blank'); return;
      case 'run-bulk-fill': runBulkFill(); return;
      default: break;
    }
  });
}

function initPopoutUi() {
  if (popoutUiReady) return;
  popoutUiReady = true;
  bindPopoutDelegatedActions();
  initPopoutChatInput();
  loadSheetContext();
  if (MODE === 'popout') { initResizeHandles(); loadSavedWindowSize(); initOsResizeListener(); }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var ov = document.getElementById('filler-overlay');
      if (ov && ov.style.display !== 'none') closeCaseFiller();
    }
  });
  document.addEventListener('paste', function(e) {
    var ov = document.getElementById('filler-overlay');
    if (ov && ov.style.display !== 'none') return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var found = false;
    Array.from(items).forEach(function(item) {
      if (item.type.indexOf('image/') !== 0) return;
      found = true; e.preventDefault();
      var file = item.getAsFile(); if (!file) return;
      var ext = item.type.split('/')[1] || 'png';
      readFileAsAttachment(file, 'screenshot_' + Date.now() + '.' + ext, item.type);
    });
    if (found) showPasteHint();
  });
}

// ── Context ───────────────────────────────────────────────────────────────
function loadSheetContext(){
  var ctxContent=document.getElementById('ctx-content');
  var ctxStatus=document.getElementById('ctx-status');
  if(!ctxContent||!ctxStatus)return;
  google.script.run
    .withSuccessHandler(function(ctx){sheetContext=ctx;contextLoaded=true;ctxContent.textContent=ctx||'No data found.';ctxStatus.textContent=ctx?'✅ loaded':'⚠️ empty';})
    .withFailureHandler(function(e){ctxContent.textContent='Error: '+e.message;ctxStatus.textContent='❌ error';})
    .getSpreadsheetContext();
}
function refreshContext(){document.getElementById('ctx-status').textContent='loading...';document.getElementById('ctx-content').textContent='...';loadSheetContext();}
function toggleContext(){var p=document.getElementById('ctx-panel');p.classList.toggle('visible');if(p.classList.contains('visible')&&!contextLoaded)loadSheetContext();}

// ── Resize ────────────────────────────────────────────────────────────────
function saveWindowSize(w,h){google.script.run.withFailureHandler(function(){}).setUserProperty('danman_popout_w',String(Math.round(w)));google.script.run.withFailureHandler(function(){}).setUserProperty('danman_popout_h',String(Math.round(h)));}
function loadSavedWindowSize(){google.script.run.withSuccessHandler(function(p){if(!p)return;var w=parseInt(p.danman_popout_w,10),h=parseInt(p.danman_popout_h,10);if(w>=280&&h>=400){window.resizeTo(w,h);highlightActivePreset(w,h);}}).withFailureHandler(function(){}).getUserProperties(['danman_popout_w','danman_popout_h']);}
function initOsResizeListener(){window.addEventListener('resize',function(){clearTimeout(resizeDebounceTimer);resizeDebounceTimer=setTimeout(function(){var w=window.outerWidth,h=window.outerHeight;saveWindowSize(w,h);showResizeToast(w,h);highlightActivePreset(w,h);},800);});}
function resetWindowSize(){applyPreset(520,700);google.script.run.withFailureHandler(function(){}).clearUserProperties(['danman_popout_w','danman_popout_h']);}
function applyPreset(w,h){window.resizeTo(w,h);saveWindowSize(w,h);showResizeToast(w,h);highlightActivePreset(w,h);}
function highlightActivePreset(w,h){var P=[{w:380,h:600},{w:520,h:700},{w:720,h:860}];document.querySelectorAll('.size-btn').forEach(function(b,i){var p=P[i];if(p)b.classList.toggle('active-size',Math.abs(w-p.w)<20&&Math.abs(h-p.h)<20);});}
function initResizeHandles(){var hH=document.getElementById('resize-handle-h'),vH=document.getElementById('resize-handle-v');if(!hH||!vH)return;var dH=false,dV=false,sX,sY,sW,sHt;hH.addEventListener('mousedown',function(e){dH=true;sX=e.screenX;sW=window.outerWidth;hH.classList.add('active');e.preventDefault();});vH.addEventListener('mousedown',function(e){dV=true;sY=e.screenY;sHt=window.outerHeight;vH.classList.add('active');e.preventDefault();});document.addEventListener('mousemove',function(e){if(!dH&&!dV)return;var nW=window.outerWidth,nH=window.outerHeight;if(dH)nW=Math.max(280,Math.min(1200,sW+(sX-e.screenX)));if(dV)nH=Math.max(400,Math.min(1200,sHt+(e.screenY-sY)));window.resizeTo(nW,nH);showResizeToast(nW,nH);highlightActivePreset(nW,nH);});document.addEventListener('mouseup',function(){if(dH||dV)saveWindowSize(window.outerWidth,window.outerHeight);dH=false;dV=false;hH.classList.remove('active');vH.classList.remove('active');});}
function showResizeToast(w,h){var t=document.getElementById('resize-toast');t.textContent=Math.round(w)+' × '+Math.round(h);t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('show');},1200);}
function showPasteHint(){var t=document.getElementById('paste-hint');t.classList.add('show');clearTimeout(pasteHintTimer);pasteHintTimer=setTimeout(function(){t.classList.remove('show');},1800);}
function setLoadingState(mode,label){var indicator=document.getElementById('typing-indicator'),content=document.getElementById('typing-content'),sendBtn=document.getElementById('send-btn');if(!mode){indicator.style.display='none';sendBtn.disabled=false;return;}indicator.style.display='block';sendBtn.disabled=true;if(mode==='ocr'){content.innerHTML='<div class="typing-ocr"><div class="ocr-bar"></div>🔍 '+(label||'Running OCR…')+'</div>';}else if(mode==='fill'){content.innerHTML='<div class="typing-fill"><div class="fill-bar"></div>✍️ '+(label||'Analyzing sheet…')+'</div>';}else{content.innerHTML='<span class="typing-dots" style="display:inline-flex;gap:4px;align-items:center"><span></span><span></span><span></span></span>';}document.getElementById('messages').scrollTop=document.getElementById('messages').scrollHeight;}

// ── Attachments ───────────────────────────────────────────────────────────
function handleFileUpload(files){if(!files||files.length===0)return;Array.from(files).forEach(function(f){if(pendingAttachments.length>=MAX_FILES){alert('Max '+MAX_FILES+' attachments.');return;}if(f.size>MAX_MB*1024*1024){alert('"'+f.name+'" exceeds '+MAX_MB+' MB.');return;}readFileAsAttachment(f,f.name,f.type);});document.getElementById('file-input').value='';}
function readFileAsAttachment(file,name,mimeType){var reader=new FileReader();reader.onload=function(ev){var dataUrl=ev.target.result,base64=dataUrl.split(',')[1],isImage=IMAGE_TYPES.indexOf(mimeType)!==-1;pendingAttachments.push({id:'att_'+(++attIdCounter),name:name,type:mimeType,base64:base64,dataUrl:dataUrl,isImage:isImage});renderAttachmentStrip();};reader.onerror=function(){addMessage('assistant','❌ Could not read "'+name+'".');};reader.readAsDataURL(file);}
function hasPendingPDF(){return pendingAttachments.some(function(a){return a.type==='application/pdf';});}
function renderAttachmentStrip(){var strip=document.getElementById('attachment-strip'),tiles=document.getElementById('strip-tiles'),uploadBtn=document.getElementById('upload-btn'),rangePanel=document.getElementById('pdf-range-panel');tiles.innerHTML='';if(pendingAttachments.length===0){strip.classList.remove('has-files');uploadBtn.classList.remove('has-files');rangePanel.classList.remove('visible');updateSummarizeButton(false);return;}strip.classList.add('has-files');uploadBtn.classList.add('has-files');pendingAttachments.forEach(function(att,idx){tiles.appendChild(buildAttachmentTile(att,idx));});var pdfPresent=hasPendingPDF();rangePanel.classList.toggle('visible',pdfPresent);updateSummarizeButton(pdfPresent);}
function updateSummarizeButton(pdfPresent){var btn=document.getElementById('qa-summarize');if(!btn)return;if(pdfPresent){btn.textContent='📄 Summarize PDF';btn.setAttribute('data-prompt','Summarize the contents of the attached PDF.');}else{btn.textContent='📋 Summarize';btn.setAttribute('data-prompt','Summarize the cases in this sheet');}}
function buildAttachmentTile(att,idx){var tile=document.createElement('div');tile.className='att-thumb';tile.draggable=true;tile.dataset.attId=att.id;var badge=document.createElement('div');badge.className='att-order';badge.textContent=idx+1;tile.appendChild(badge);if(att.isImage){var img=document.createElement('img');img.src=att.dataUrl;img.title=att.name;tile.appendChild(img);}else{var chip=document.createElement('div');chip.className='att-file-chip'+(att.type==='application/pdf'?' pdf':'');chip.innerHTML=(att.type==='application/pdf'?'📄 ':'📋 ')+'<span title="'+att.name+'">'+att.name+'</span>';tile.appendChild(chip);}var rem=document.createElement('button');rem.className='att-remove';rem.textContent='×';rem.title='Remove';rem.onclick=function(e){e.stopPropagation();removeAttachment(att.id);};tile.appendChild(rem);tile.addEventListener('dragstart',function(e){dragSrcId=att.id;tile.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',att.id);});tile.addEventListener('dragend',function(){dragSrcId=null;tile.classList.remove('dragging');document.querySelectorAll('.att-thumb').forEach(function(t){t.classList.remove('drag-over');});});tile.addEventListener('dragover',function(e){e.preventDefault();e.dataTransfer.dropEffect='move';if(att.id!==dragSrcId)tile.classList.add('drag-over');});tile.addEventListener('dragleave',function(){tile.classList.remove('drag-over');});tile.addEventListener('drop',function(e){e.preventDefault();tile.classList.remove('drag-over');if(!dragSrcId||dragSrcId===att.id)return;var srcIdx=pendingAttachments.findIndex(function(a){return a.id===dragSrcId;});var destIdx=pendingAttachments.findIndex(function(a){return a.id===att.id;});if(srcIdx===-1||destIdx===-1)return;var moved=pendingAttachments.splice(srcIdx,1)[0];pendingAttachments.splice(destIdx,0,moved);renderAttachmentStrip();});return tile;}
function removeAttachment(id){pendingAttachments=pendingAttachments.filter(function(a){return a.id!==id;});renderAttachmentStrip();}
function clearAttachments(){pendingAttachments=[];renderAttachmentStrip();}
function getPdfPageRange(){var startVal=parseInt(document.getElementById('pdf-page-start').value,10),endVal=parseInt(document.getElementById('pdf-page-end').value,10);return{start:isNaN(startVal)||startVal<1?1:startVal,end:isNaN(endVal)||endVal<1?null:endVal};}

// ── Sheet Fill (legacy proxy) ──────────────────────────────────────────────
function triggerFillSheet(){var hint=document.getElementById('user-input').value.trim();setLoadingState('fill','Analyzing sheet for missing values…');google.script.run.withSuccessHandler(function(res){setLoadingState(null);if(res.success){if(res.filled===0&&(!res.corrected||res.corrected===0)){addMessage('assistant','✅ '+res.message);}else{fillsApplied=true;document.getElementById('qa-clear').style.display='';addFillResultMessage(res);}}else{addMessage('assistant','❌ Fill Sheet error: '+res.error);}}).withFailureHandler(function(e){setLoadingState(null);addMessage('assistant','❌ Script error: '+e.message);}).analyzeAndFillSheetProxy({userHint:hint});}
function triggerClearFills(){if(!confirm('Remove all DANMAN-generated fills from this sheet?'))return;setLoadingState('fill','Clearing DANMAN fills…');google.script.run.withSuccessHandler(function(res){setLoadingState(null);if(res.success){fillsApplied=false;document.getElementById('qa-clear').style.display='none';addMessage('assistant','🗑 Cleared '+res.cleared+' DANMAN-generated cell(s).');}else{addMessage('assistant','❌ Clear error: '+res.error);}}).withFailureHandler(function(e){setLoadingState(null);addMessage('assistant','❌ Script error: '+e.message);}).clearDANMANFillsProxy();}
function addFillResultMessage(res){var welcome=document.getElementById('welcome-msg');if(welcome)welcome.remove();var msgs=document.getElementById('messages'),div=document.createElement('div');div.className='msg assistant';var bubble=document.createElement('div');bubble.className='msg-bubble';var summary=document.createElement('div');summary.innerHTML='✅ <strong>'+res.message+'</strong>';bubble.appendChild(summary);if(res.preview&&res.preview.length>0){var table=document.createElement('table');table.className='fill-table';table.innerHTML='<tr><th>Cell</th><th>Value</th><th>Reason</th></tr>';res.preview.forEach(function(f){var tr=document.createElement('tr');tr.innerHTML='<td class="cell-ref">'+escHtml(f.cell)+'</td><td class="cell-val">'+escHtml(f.value)+'</td><td class="cell-reason">'+escHtml(f.reason)+'</td>';table.appendChild(tr);});bubble.appendChild(table);}var note=document.createElement('div');note.style.cssText='font-size:10px;color:var(--text2);margin-top:6px';note.textContent='Use 🗑 Clear Fills to undo.';bubble.appendChild(note);var meta=document.createElement('div');meta.className='msg-meta';meta.textContent='DANMAN · claude-sonnet-4-6 · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});div.appendChild(bubble);div.appendChild(meta);msgs.appendChild(div);msgs.scrollTop=msgs.scrollHeight;}

// ── Messaging ─────────────────────────────────────────────────────────────
function handleKey(e){
  if(!e) return;
  var isEnter = e.key === 'Enter' || e.keyCode === 13 || e.which === 13;
  if(!isEnter || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
  if(e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  e.stopPropagation();
  sendMessage();
}
function autoResize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,100)+'px';}
function quickPrompt(text){var el=document.getElementById('user-input');el.value=text;updateCharCount();autoResize(el);sendMessage();}
function sendMessage(){var input=document.getElementById('user-input'),text=input.value.trim();if(!text&&pendingAttachments.length===0)return;var includeCtx=document.getElementById('ctx-toggle').checked,attachmentsSnapshot=pendingAttachments.map(function(a){return{name:a.name,type:a.type,base64:a.base64,isImage:a.isImage};});var hasPDF=attachmentsSnapshot.some(function(a){return a.type==='application/pdf';}),firstPDF=hasPDF?attachmentsSnapshot.find(function(a){return a.type==='application/pdf';}):null;addMessage('user',text||'📎 (attachment only)',null,attachmentsSnapshot);input.value='';input.style.height='auto';updateCharCount();clearAttachments();if(hasPDF&&firstPDF){setLoadingState('ocr','Running OCR on '+firstPDF.name+'…');}else{setLoadingState('dots');}var pdfPageRange=hasPDF?getPdfPageRange():null,payload={message:text,history:history.slice(-16),includeSheetContext:includeCtx,attachments:attachmentsSnapshot,pdfPageRange:pdfPageRange};google.script.run.withSuccessHandler(function(res){setLoadingState(null);if(res.success){var writeMatch=res.content.match(/%%WRITE_TO_SHEET%%([\s\S]*?)%%END_WRITE%%/),displayContent=res.content,writePayload=null;if(writeMatch){writePayload=writeMatch[1].trim();displayContent=res.content.replace(/%%WRITE_TO_SHEET%%[\s\S]*?%%END_WRITE%%/,'').trim();}addMessage('assistant',displayContent,res.model);if(writePayload)addWriteToSheetButton(writePayload);var hText=text+(attachmentsSnapshot.length?' [+'+attachmentsSnapshot.length+' attachment(s)]':'');history.push({role:'user',content:hText});history.push({role:'assistant',content:displayContent});if(history.length>40)history=history.slice(-40);}else{addMessage('assistant','❌ Error: '+res.error);}}).withFailureHandler(function(e){setLoadingState(null);addMessage('assistant','❌ Script error: '+e.message);}).sendMessageToDANMAN(payload);}
function addMessage(role,content,model,attachments){var welcome=document.getElementById('welcome-msg');if(welcome)welcome.remove();var msgs=document.getElementById('messages'),div=document.createElement('div');div.className='msg '+role;var bubble=document.createElement('div');bubble.className='msg-bubble';if(attachments&&attachments.length>0){var attRow=document.createElement('div');attRow.className='bubble-attachments';attachments.forEach(function(a){if(a.isImage){var wrap=document.createElement('div');wrap.className='bubble-thumb';var img=document.createElement('img');img.src='data:'+a.type+';base64,'+a.base64;img.title=a.name;wrap.appendChild(img);attRow.appendChild(wrap);}else{var chip=document.createElement('div');chip.className='bubble-file-chip';chip.textContent=(a.type==='application/pdf'?'📄 ':'📋 ')+a.name;attRow.appendChild(chip);}});bubble.appendChild(attRow);}var textNode=document.createElement('div');textNode.innerHTML=formatMarkdown(content);bubble.appendChild(textNode);var meta=document.createElement('div');meta.className='msg-meta';var time=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});meta.textContent=role==='assistant'?'DANMAN · '+(model||'claude-sonnet-4-6')+' · '+time:'You · '+time;div.appendChild(bubble);div.appendChild(meta);msgs.appendChild(div);msgs.scrollTop=msgs.scrollHeight;}
function clearChat(){if(!confirm('Clear this conversation?'))return;history=[];clearAttachments();document.getElementById('messages').innerHTML='';addMessage('assistant','🗑️ Chat cleared. What can I help you with?');}
function addWriteToSheetButton(payloadStr){var msgs=document.getElementById('messages'),lastMsg=msgs.lastElementChild;if(!lastMsg)return;var bubble=lastMsg.querySelector('.msg-bubble');if(!bubble)return;var btn=document.createElement('button');btn.className='write-btn';btn.textContent='✍️ Apply to Sheet';btn.onclick=function(){applyWriteToSheet(payloadStr,btn);};bubble.appendChild(btn);}
function applyWriteToSheet(payloadStr,btn){btn.disabled=true;btn.textContent='⏳ Writing…';google.script.run.withSuccessHandler(function(res){if(res.success){btn.textContent='✅ Applied ('+res.filled+' cell(s))';btn.style.background='none';btn.style.border='1px solid var(--green)';btn.style.color='var(--green)';}else{btn.disabled=false;btn.textContent='❌ Error: '+(res.error||'unknown');btn.style.background='none';btn.style.border='1px solid var(--red)';btn.style.color='var(--red)';}}).withFailureHandler(function(e){btn.disabled=false;btn.textContent='❌ '+e.message;btn.style.background='none';btn.style.border='1px solid var(--red)';btn.style.color='var(--red)';}).writeToSheetFromChat(payloadStr);}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function formatMarkdown(text){return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/```([\w]*)\n?([\s\S]*?)```/g,function(_,l,c){return'<pre><code class="lang-'+(l||'text')+'">'+c.trim()+'</code></pre>';}).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/^### (.+)$/gm,'<h4 style="color:var(--accent);margin:8px 0 4px">$1</h4>').replace(/^## (.+)$/gm,'<h3 style="color:var(--accent);margin:10px 0 4px">$1</h3>').replace(/^# (.+)$/gm,'<h2 style="color:var(--accent);margin:10px 0 4px">$1</h2>').replace(/^[\-\*] (.+)$/gm,'<li style="margin-left:16px">$1</li>').replace(/^(\d+)\. (.+)$/gm,'<li style="margin-left:16px"><b>$1.</b> $2</li>').replace(/\n/g,'<br>');}

// ══════════════════════════════════════════════════════════════════════════
//  CASE FIELD INJECTOR — Tab Management
// ══════════════════════════════════════════════════════════════════════════

function openCaseFiller(){
  document.getElementById('filler-overlay').style.display='flex';
  if(!fillerColumnInfo) setTimeout(scanSheetForFiller, 80);
}
function closeCaseFiller(){
  document.getElementById('filler-overlay').style.display='none';
}

/**
 * Switches between AI Suggest and Bulk Fill tabs.
 * Scan bar buttons update visibility based on which tab is active.
 */
function switchTab(tab){
  activeFillerTab = tab;
  document.getElementById('tab-ai').classList.toggle('active',   tab==='ai');
  document.getElementById('tab-bulk').classList.toggle('active', tab==='bulk');
  document.getElementById('panel-ai').classList.toggle('active',   tab==='ai');
  document.getElementById('panel-bulk').classList.toggle('active', tab==='bulk');

  // AI tab scan bar buttons
  var aiBtn    = document.getElementById('filler-ai-btn');
  var clearBtn = document.getElementById('filler-clear-btn');
  var ctxStrip = document.getElementById('ctx-cols-strip');
  var banner   = document.getElementById('ai-summary-banner');

  if(tab === 'ai'){
    if(fillerColumnInfo){ aiBtn.style.display=''; clearBtn.style.display=''; }
    // Restore ctx strip / banner visibility
    if(ctxStrip.dataset.wasVisible==='1') ctxStrip.style.display='flex';
    if(banner.classList.contains('visible')) banner.style.display='';
  } else {
    // Bulk tab — hide AI-specific buttons from scan bar
    aiBtn.style.display='none'; clearBtn.style.display='none';
    ctxStrip.dataset.wasVisible = ctxStrip.style.display !== 'none' ? '1' : '0';
    ctxStrip.style.display='none';
    banner.style.display='none';
    // If we have scan data, render bulk cards now
    if(fillerColumnInfo) _renderBulkCards();
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  SHARED SCAN
// ══════════════════════════════════════════════════════════════════════════

function scanSheetForFiller(){
  var scanBtn=document.getElementById('filler-scan-btn');
  var pill=document.getElementById('filler-pill');
  scanBtn.disabled=true; scanBtn.textContent='⏳ Scanning…';
  pill.textContent='scanning…'; pill.style.color='var(--yellow)';

  // Reset both panels to placeholder state
  document.getElementById('filler-placeholder').style.display='block';
  document.getElementById('filler-placeholder').innerHTML='⏳ <span style="color:var(--text2)">Reading columns and validation rules…</span>';
  document.getElementById('filler-results-area').style.display='none';
  document.getElementById('ctx-cols-strip').style.display='none';
  document.getElementById('bulk-placeholder').style.display='block';
  document.getElementById('bulk-cols-section').style.display='none';
  document.getElementById('bulk-results-area').style.display='none';

  google.script.run
    .withSuccessHandler(function(res){
      scanBtn.disabled=false; scanBtn.textContent='↻ Re-scan';
      if(!res.success){
        document.getElementById('filler-placeholder').innerHTML='❌ <span style="color:var(--red)">'+escHtml(res.error)+'</span>';
        document.getElementById('bulk-placeholder').innerHTML='❌ <span style="color:var(--red)">'+escHtml(res.error)+'</span>';
        pill.textContent='error'; pill.style.color='var(--red)'; return;
      }
      fillerColumnInfo=res.columnInfo;
      fillerCaseNumbers=res.caseNumbers;

      var picklistCount=Object.values(res.columnInfo).filter(function(c){return c.picklist&&c.picklist.length>0;}).length;
      document.getElementById('filler-sheet-name').textContent='"'+res.sheetName+'" · '+Object.keys(res.columnInfo).length+' cols · '+picklistCount+' picklist'+(picklistCount!==1?'s':'');
      pill.textContent='ready'; pill.style.color='var(--green)';
      pill.style.borderColor='rgba(52,211,153,.4)'; pill.style.background='rgba(52,211,153,.08)';

      // ── AI tab setup ─────────────────────────────────────────────────
      document.getElementById('filler-placeholder').style.display='none';
      document.getElementById('filler-rules-section').style.display='block';
      document.getElementById('filler-footer').style.display='flex';
      document.getElementById('filler-ai-btn').style.display = activeFillerTab==='ai' ? '' : 'none';
      document.getElementById('filler-clear-btn').style.display = activeFillerTab==='ai' ? '' : 'none';
      if(document.getElementById('rule-rows').children.length===0) addRuleRow();
      else _rebuildAllRows();

      // ── Bulk tab setup ───────────────────────────────────────────────
      document.getElementById('bulk-placeholder').style.display='none';
      document.getElementById('bulk-cols-section').style.display='flex';
      document.getElementById('bulk-footer').style.display='flex';
      _renderBulkCards();
    })
    .withFailureHandler(function(e){
      scanBtn.disabled=false; scanBtn.textContent='🔍 Scan Sheet';
      document.getElementById('filler-placeholder').innerHTML='❌ <span style="color:var(--red)">'+escHtml(e.message)+'</span>';
      document.getElementById('bulk-placeholder').innerHTML='❌ <span style="color:var(--red)">'+escHtml(e.message)+'</span>';
      pill.textContent='error'; pill.style.color='var(--red)';
    })
    .getSheetColumnsAndValidationsProxy();
}

// ══════════════════════════════════════════════════════════════════════════
//  BULK FILL TAB
// ══════════════════════════════════════════════════════════════════════════

/**
 * Renders one card per picklist column.
 * Each card: checkbox · column name (hover tooltip) · value selector · mode toggle
 */
function _renderBulkCards(){
  var container = document.getElementById('bulk-cards');
  container.innerHTML = '';

  if(!fillerColumnInfo){ return; }

  var picklistCols = Object.keys(fillerColumnInfo).filter(function(h){
    return fillerColumnInfo[h].picklist && fillerColumnInfo[h].picklist.length > 0;
  });

  if(picklistCols.length === 0){
    document.getElementById('bulk-placeholder').style.display='block';
    document.getElementById('bulk-placeholder').innerHTML='<span style="color:var(--text2)">No picklist columns found in this sheet.</span>';
    document.getElementById('bulk-cols-section').style.display='none';
    return;
  }

  picklistCols.forEach(function(header){
    var picklist = fillerColumnInfo[header].picklist;
    var card     = document.createElement('div');
    card.className = 'col-card';
    card.dataset.field = header;

    // ── Checkbox ────────────────────────────────────────────────────────
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'col-checkbox'; cb.checked = false;
    cb.addEventListener('change', function(){
      card.classList.toggle('disabled-card', !this.checked);
      sel.disabled = !this.checked;
      _updateBulkCount();
    });
    // Start unchecked / disabled
    card.classList.add('disabled-card');

    // ── Column name + tooltip ────────────────────────────────────────────
    var nameWrap = document.createElement('div');
    nameWrap.className = 'col-name-wrap';

    var nameEl = document.createElement('span');
    nameEl.className = 'col-name';
    nameEl.title     = 'Hover for picklist values';
    nameEl.textContent = header;

    var countBadge = document.createElement('span');
    countBadge.className   = 'picklist-count-badge';
    countBadge.textContent = picklist.length + ' values';

    // Tooltip — all picklist values shown as chips
    var tooltip = document.createElement('div');
    tooltip.className = 'col-tooltip';
    var ttTitle = document.createElement('div');
    ttTitle.className   = 'col-tooltip-title';
    ttTitle.textContent = header + ' — allowed values';
    tooltip.appendChild(ttTitle);
    picklist.forEach(function(v){
      var chip = document.createElement('span');
      chip.className   = 'col-tooltip-val';
      chip.textContent = v;
      tooltip.appendChild(chip);
    });

    nameWrap.appendChild(nameEl);
    nameWrap.appendChild(countBadge);
    nameWrap.appendChild(tooltip);

    // ── Value selector ───────────────────────────────────────────────────
    var sel = document.createElement('select');
    sel.className = 'col-value-select';
    sel.disabled  = true; // mirrors unchecked state

    var blankOpt = document.createElement('option');
    blankOpt.value = ''; blankOpt.textContent = '— Select —';
    sel.appendChild(blankOpt);

    picklist.forEach(function(v){
      var opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    });

    // ── Mode toggle row ──────────────────────────────────────────────────
    var modeRow = document.createElement('div');
    modeRow.className = 'col-mode-row';

    var modeLabel = document.createElement('span');
    modeLabel.className   = 'mode-toggle-label';
    modeLabel.textContent = 'Fill mode:';

    var modeToggle = document.createElement('div');
    modeToggle.className = 'mode-toggle';

    var optBlank = document.createElement('button');
    optBlank.className   = 'mode-opt active-mode'; // default
    optBlank.textContent = 'Blank Only';
    optBlank.dataset.mode = 'blank';

    var optOver = document.createElement('button');
    optOver.className    = 'mode-opt';
    optOver.textContent  = 'Overwrite All';
    optOver.dataset.mode = 'overwrite';

    function setMode(mode){
      optBlank.classList.toggle('active-mode', mode==='blank');
      optOver.classList.toggle('active-mode',  mode==='overwrite');
      modeToggle.dataset.mode = mode;
    }
    setMode('blank');
    modeToggle.dataset.mode = 'blank';

    optBlank.onclick  = function(){ setMode('blank'); };
    optOver.onclick   = function(){ setMode('overwrite'); };

    modeToggle.appendChild(optBlank);
    modeToggle.appendChild(optOver);
    modeRow.appendChild(modeLabel);
    modeRow.appendChild(modeToggle);

    // ── Assemble card ────────────────────────────────────────────────────
    card.appendChild(cb);
    card.appendChild(nameWrap);
    card.appendChild(sel);
    card.appendChild(modeRow); // spans col 2→4 via CSS grid-column

    container.appendChild(card);
  });

  _updateBulkCount();
}

/** Select/deselect all column checkboxes */
function bulkSelectAll(state){
  document.querySelectorAll('#bulk-cards .col-card').forEach(function(card){
    var cb  = card.querySelector('.col-checkbox');
    var sel = card.querySelector('.col-value-select');
    cb.checked = state;
    card.classList.toggle('disabled-card', !state);
    sel.disabled = !state;
  });
  _updateBulkCount();
}

/** Set fill mode for ALL cards at once */
function bulkSetMode(mode){
  document.querySelectorAll('#bulk-cards .col-card').forEach(function(card){
    var opts = card.querySelectorAll('.mode-opt');
    opts.forEach(function(o){
      o.classList.toggle('active-mode', o.dataset.mode === mode);
    });
    var mt = card.querySelector('.mode-toggle');
    if(mt) mt.dataset.mode = mode;
  });
}

/** Updates the "N selected" label in the toolbar */
function _updateBulkCount(){
  var total    = document.querySelectorAll('#bulk-cards .col-card').length;
  var selected = document.querySelectorAll('#bulk-cards .col-card .col-checkbox:checked').length;
  var lbl = document.getElementById('bulk-count-label');
  if(lbl) lbl.textContent = selected + ' / ' + total + ' selected';
}

/** Collect checked cards, validate, call GAS proxy */
function runBulkFill(){
  var cards   = document.querySelectorAll('#bulk-cards .col-card');
  var rules   = [];
  var errs    = [];

  cards.forEach(function(card){
    var cb = card.querySelector('.col-checkbox');
    if(!cb || !cb.checked) return;                   // skip unchecked

    var field = card.dataset.field;
    var sel   = card.querySelector('.col-value-select');
    var mt    = card.querySelector('.mode-toggle');
    var value = sel ? sel.value.trim() : '';
    var mode  = mt  ? (mt.dataset.mode || 'blank') : 'blank';

    if(!value || value === ''){
      errs.push('"' + field + '": please select a value.');
      return;
    }
    rules.push({ field: field, value: value, overwrite: mode === 'overwrite' });
  });

  if(errs.length > 0){ alert('Fix before running:\n\n' + errs.join('\n')); return; }
  if(rules.length === 0){ alert('Select at least one column.'); return; }

  var applyBtn = document.getElementById('bulk-apply-btn');
  var status   = document.getElementById('bulk-status');
  applyBtn.disabled    = true;
  applyBtn.textContent = '⏳ Applying…';
  status.style.color   = 'var(--text2)';

  var overwriteCount = rules.filter(function(r){return r.overwrite;}).length;
  status.textContent  = rules.length + ' column(s)' +
    (overwriteCount > 0 ? ' · ' + overwriteCount + ' overwrite mode' : '') + '…';

  document.getElementById('bulk-results-area').style.display = 'none';

  google.script.run
    .withSuccessHandler(function(res){
      applyBtn.disabled    = false;
      applyBtn.textContent = '⚡ Apply to Sheet';
      if(res.success){
        status.style.color  = 'var(--green)';
        status.textContent  =
          '✅ ' + res.writeCount + ' written · ' +
          (res.overwriteCount||0) + ' overwritten · ' +
          res.skipCount + ' skipped';
        if(res.log && res.log.length > 0) _renderBulkLog(res.log);
      } else {
        status.style.color = 'var(--red)';
        status.textContent = '❌ ' + escHtml(res.error || 'Unknown error');
      }
    })
    .withFailureHandler(function(e){
      applyBtn.disabled    = false;
      applyBtn.textContent = '⚡ Apply to Sheet';
      status.style.color   = 'var(--red)';
      status.textContent   = '❌ ' + escHtml(e.message);
    })
    .bulkFillColumnProxy(JSON.stringify(rules));
}

function _renderBulkLog(logLines){
  var area = document.getElementById('bulk-results-area');
  var div  = document.getElementById('bulk-results');
  div.innerHTML = logLines.map(function(line){
    var cls = line.indexOf('✅')!==-1?'log-ok':line.indexOf('⏭')!==-1?'log-skip':line.indexOf('❌')!==-1?'log-err':'log-info';
    return '<div class="log-line '+cls+'">'+escHtml(line)+'</div>';
  }).join('');
  area.style.display='block'; area.scrollTop=area.scrollHeight;
}

// ══════════════════════════════════════════════════════════════════════════
//  AI SUGGEST TAB (from V007 — unchanged)
// ══════════════════════════════════════════════════════════════════════════

function clearAllRules(){
  document.getElementById('rule-rows').innerHTML='';
  _updateRuleCount();
  var banner=document.getElementById('ai-summary-banner');
  banner.classList.remove('visible'); banner.textContent='';
  document.getElementById('filler-status').textContent='';
  document.getElementById('filler-results-area').style.display='none';
}
function triggerAISuggest(){
  if(!fillerColumnInfo){ alert('Please scan the sheet first.'); return; }
  var aiBtn=document.getElementById('filler-ai-btn');
  var loading=document.getElementById('filler-ai-loading');
  var sub=document.getElementById('ai-loading-sub');
  aiBtn.disabled=true; loading.style.display='flex';
  var msgs=['Calling Anthropic API…','Reading Subject & Description…','Selecting best picklist values…','Almost there…'];
  var msgIdx=0;
  var msgTimer=setInterval(function(){ sub.textContent=msgs[msgIdx%msgs.length]; msgIdx++; },2200);
  google.script.run
    .withSuccessHandler(function(res){
      clearInterval(msgTimer); loading.style.display='none'; aiBtn.disabled=false;
      if(!res.success){ alert('AI Suggest error:\n\n'+res.error); return; }
      if(!res.suggestions||res.suggestions.length===0){ alert(res.message||'All picklist fields are already filled!'); return; }
      _populateAISuggestions(res);
    })
    .withFailureHandler(function(e){
      clearInterval(msgTimer); loading.style.display='none'; aiBtn.disabled=false;
      alert('Script error during AI analysis:\n\n'+e.message);
    })
    .analyzeRowsForCaseFillerProxy();
}
function _populateAISuggestions(res){
  document.getElementById('rule-rows').innerHTML='';
  var totalRows=0,highCount=0,medCount=0,lowCount=0;
  res.suggestions.forEach(function(caseSugg){
    caseSugg.fields.forEach(function(f){
      addRuleRow({caseNum:caseSugg.caseNumber,field:f.field,value:f.value,aiReason:f.reason,confidence:f.confidence||'medium',isAI:true});
      totalRows++;
      if(f.confidence==='high')highCount++; else if(f.confidence==='low')lowCount++; else medCount++;
    });
  });
  _updateRuleCount();
  if(res.contextCols&&res.contextCols.length>0){
    var strip=document.getElementById('ctx-cols-strip'),chips=document.getElementById('ctx-col-chips');
    chips.innerHTML=res.contextCols.map(function(c){return'<span class="ctx-col-chip">'+escHtml(c)+'</span>';}).join('');
    strip.style.display='flex';
  }
  var banner=document.getElementById('ai-summary-banner');
  banner.innerHTML='🤖 AI suggested <strong>'+totalRows+' values</strong> across '+res.suggestions.length+' case(s). '+'<span style="color:var(--green)">'+highCount+' high</span> · <span style="color:var(--yellow)">'+medCount+' medium</span> · <span style="color:var(--orange)">'+lowCount+' low</span> confidence. '+(res.skippedRows>0?res.skippedRows+' row(s) skipped (already complete). ':'')+' <em style="opacity:.7">Review below, then click ▶ Run All Rules.</em>';
  banner.classList.add('visible');
  document.getElementById('filler-body').scrollTop=0;
}
function _rebuildAllRows(){
  var container=document.getElementById('rule-rows'),saved=[];
  container.querySelectorAll('.rule-row').forEach(function(row){saved.push({caseNum:(row.querySelector('[data-role="case"]')||{}).value||'',field:(row.querySelector('[data-role="field"]')||{}).value||'',value:(row.querySelector('[data-role="value"]')||{}).value||'',isAI:row.classList.contains('ai-row'),aiReason:row.dataset.aiReason||'',confidence:row.dataset.confidence||'medium'});});
  container.innerHTML=''; saved.forEach(function(s){addRuleRow(s);}); _updateRuleCount();
}
function addRuleRow(prefill){
  prefill=prefill||{}; var id=++fillerRuleCounter;
  var row=document.createElement('div');
  row.className='rule-row'+(prefill.isAI?' ai-row':''); row.dataset.ruleId=id;
  if(prefill.isAI){row.dataset.aiReason=prefill.aiReason||'';row.dataset.confidence=prefill.confidence||'medium';}
  if(prefill.isAI){var badge=document.createElement('div');badge.className='ai-source-badge';badge.textContent='🤖 AI';row.appendChild(badge);}
  var caseEl;
  if(fillerCaseNumbers&&fillerCaseNumbers.length>0){caseEl=document.createElement('select');caseEl.className='filler-select';caseEl.dataset.role='case';fillerCaseNumbers.forEach(function(cn){var opt=document.createElement('option');opt.value=cn;opt.textContent=cn;if(prefill.caseNum&&String(prefill.caseNum)===String(cn))opt.selected=true;caseEl.appendChild(opt);});}else{caseEl=document.createElement('input');caseEl.type='text';caseEl.className='filler-input';caseEl.placeholder='Case #';caseEl.dataset.role='case';if(prefill.caseNum)caseEl.value=prefill.caseNum;}
  var fieldSel=document.createElement('select');fieldSel.className='filler-select';fieldSel.dataset.role='field';var blankOpt=document.createElement('option');blankOpt.value='';blankOpt.textContent='— Field —';fieldSel.appendChild(blankOpt);
  if(fillerColumnInfo){Object.keys(fillerColumnInfo).forEach(function(header){var opt=document.createElement('option');opt.value=header;var hasList=fillerColumnInfo[header].picklist&&fillerColumnInfo[header].picklist.length>0;opt.textContent=(hasList?'▾ ':'   ')+header;if(prefill.field===header)opt.selected=true;fieldSel.appendChild(opt);});}
  var valueContainer=document.createElement('div');valueContainer.className='filler-value-container';valueContainer.dataset.role='value-container';_renderValueControl(valueContainer,prefill.field||'',prefill.value||'');
  fieldSel.addEventListener('change',function(){_renderValueControl(valueContainer,this.value,'');if(prefill.isAI){row.classList.remove('ai-row');var ab=row.querySelector('.ai-source-badge');if(ab)ab.remove();}});
  caseEl.addEventListener&&caseEl.addEventListener('change',function(){if(prefill.isAI){row.classList.remove('ai-row');var ab=row.querySelector('.ai-source-badge');if(ab)ab.remove();}});
  var delBtn=document.createElement('button');delBtn.className='rule-del';delBtn.title='Remove';delBtn.textContent='×';delBtn.onclick=function(){row.remove();_updateRuleCount();};
  row.appendChild(caseEl);row.appendChild(fieldSel);row.appendChild(valueContainer);row.appendChild(delBtn);
  if(prefill.isAI&&prefill.aiReason){var conf=String(prefill.confidence||'medium').toLowerCase();var meta=document.createElement('div');meta.className='ai-meta conf-'+conf;meta.innerHTML='<div class="confidence-bar-wrap"><div class="confidence-bar"></div></div><span class="ai-reason-text" title="'+escHtml(prefill.aiReason)+'">'+escHtml(prefill.aiReason)+'</span><span class="ai-conf-chip '+conf+'">'+conf+'</span>';row.appendChild(meta);}
  document.getElementById('rule-rows').appendChild(row);_updateRuleCount();
}
function _renderValueControl(container,fieldName,currentValue){
  container.innerHTML='';
  var picklist=(fillerColumnInfo&&fieldName&&fillerColumnInfo[fieldName])?fillerColumnInfo[fieldName].picklist:null;
  if(picklist&&picklist.length>0){var sel=document.createElement('select');sel.className='filler-select';sel.dataset.role='value';var blankOpt=document.createElement('option');blankOpt.value='';blankOpt.textContent='— Select —';sel.appendChild(blankOpt);picklist.forEach(function(v){var opt=document.createElement('option');opt.value=String(v);opt.textContent=String(v);if(String(currentValue)===String(v))opt.selected=true;sel.appendChild(opt);});var customOpt=document.createElement('option');customOpt.value='__CUSTOM__';customOpt.textContent='✏️ Type custom value…';sel.appendChild(customOpt);sel.addEventListener('change',function(){if(this.value==='__CUSTOM__')_renderValueControl(container,null,'');});container.appendChild(sel);}else{var inp=document.createElement('input');inp.type='text';inp.className='filler-input';inp.placeholder=fieldName?'Value…':'Value';inp.dataset.role='value';if(currentValue&&currentValue!=='__CUSTOM__')inp.value=currentValue;container.appendChild(inp);}
}
function _updateRuleCount(){var n=document.querySelectorAll('#rule-rows .rule-row').length;var lbl=document.getElementById('filler-rule-count');if(lbl)lbl.textContent=n+' rule'+(n!==1?'s':'');}
function runCaseFiller(){
  var rows=document.querySelectorAll('#rule-rows .rule-row'),rules=[],errors=[];
  rows.forEach(function(row,idx){var caseEl=row.querySelector('[data-role="case"]'),fieldEl=row.querySelector('[data-role="field"]'),valueEl=row.querySelector('[data-role="value"]');var caseNum=caseEl?String(caseEl.value).trim():'',field=fieldEl?String(fieldEl.value).trim():'',value=valueEl?String(valueEl.value).trim():'';if(!caseNum){errors.push('Rule '+(idx+1)+': Case # required.');return;}if(!field){errors.push('Rule '+(idx+1)+': Field required.');return;}if(!value||value==='__CUSTOM__'){errors.push('Rule '+(idx+1)+': Value required.');return;}rules.push({caseNumber:caseNum,field:field,value:value});});
  if(errors.length>0){alert('Fix the following:\n\n'+errors.join('\n'));return;}
  if(rules.length===0){alert('Add at least one rule first.');return;}
  var runBtn=document.getElementById('filler-run-btn'),status=document.getElementById('filler-status');
  runBtn.disabled=true;runBtn.textContent='⏳ Running…';status.style.color='var(--text2)';status.textContent=rules.length+' rule'+(rules.length!==1?'s':'')+' queued…';
  document.getElementById('filler-results-area').style.display='none';
  google.script.run
    .withSuccessHandler(function(res){runBtn.disabled=false;runBtn.textContent='▶ Run All Rules';if(res.success){status.style.color='var(--green)';status.textContent='✅ '+res.writeCount+' written · '+res.skipCount+' skipped';if(res.log&&res.log.length>0)_renderFillerLog(res.log);}else{status.style.color='var(--red)';status.textContent='❌ '+escHtml(res.error||'Unknown error');}})
    .withFailureHandler(function(e){runBtn.disabled=false;runBtn.textContent='▶ Run All Rules';status.style.color='var(--red)';status.textContent='❌ '+escHtml(e.message);})
    .insertCaseDataDynamicProxy(JSON.stringify(rules));
}
function _renderFillerLog(logLines){var area=document.getElementById('filler-results-area'),div=document.getElementById('filler-results');div.innerHTML=logLines.map(function(line){var cls=line.indexOf('✅')!==-1?'log-ok':line.indexOf('⏭')!==-1?'log-skip':line.indexOf('❌')!==-1?'log-err':'log-info';return'<div class="log-line '+cls+'">'+escHtml(line)+'</div>';}).join('');area.style.display='block';area.scrollTop=area.scrollHeight;}

function bootPopoutUi() {
  try {
    initPopoutUi();
    document.documentElement.setAttribute('data-danman-ui', 'ready');
  } catch (err) {
    console.error('[DANMAN popout] UI init failed:', err);
    document.documentElement.setAttribute('data-danman-ui', 'error');
    var banner = document.getElementById('danman-boot-error');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'danman-boot-error';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7f1d1d;color:#fff;padding:8px 12px;font-size:12px;';
      banner.textContent = 'DANMAN UI failed to start: ' + (err && err.message ? err.message : String(err));
      document.body.appendChild(banner);
    }
  }
}

window.initPopoutUi = initPopoutUi;
window.sendMessage = sendMessage;
window.handleKey = handleKey;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootPopoutUi);
} else {
  bootPopoutUi();
}
window.addEventListener('load', function() {
  if (document.documentElement.getAttribute('data-danman-ui') !== 'ready') {
    bootPopoutUi();
  }
});
