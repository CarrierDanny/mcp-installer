// sidebar/tabs/studio-tab.js — Screenshot Studio (ported from PARADICE Workbench)
(function () {
  'use strict';

  var container = document.getElementById('tab-studio');
  if (!container) return;

  var learn = (typeof GPD_ProgressiveLearn !== 'undefined') ? GPD_ProgressiveLearn : null;
  var cv = null;
  var ctx = null;
  var img = null;
  var shapes = [];
  var redo = [];
  var tool = 'pen';
  var drawing = false;
  var cur = null;

  function $(sel) { return container.querySelector(sel); }
  function toast(msg, kind) {
    if (window.Toast) {
      if (kind === 'bad') Toast.error(msg);
      else if (kind === 'warn') Toast.warning(msg);
      else Toast.success(msg);
    }
  }
  function record(action, detail) {
    if (learn && learn.record) learn.record(action, detail);
  }
  function dataUrlB64(url) {
    var i = String(url || '').indexOf(',');
    return i >= 0 ? url.slice(i + 1) : url;
  }
  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  var style = document.createElement('style');
  style.textContent = [
    '.stu-wrap { display:flex; flex-direction:column; gap:10px; }',
    '.stu-layout { display:flex; flex-direction:column; gap:10px; }',
    '@media (min-width: 700px) { .stu-layout { flex-direction:row; align-items:stretch; } .stu-canvas-col { flex:1.4; } .stu-side { flex:1; min-width:220px; } }',
    '.stu-canvas-host { position:relative; background:#0b1220; border:1px dashed #334155; border-radius:8px; min-height:220px; overflow:auto; }',
    '.stu-canvas-host.drop { border-color:#38bdf8; background:rgba(56,189,248,0.06); }',
    '.stu-canvas-host canvas { display:block; max-width:100%; height:auto; cursor:crosshair; }',
    '.stu-empty { position:absolute; inset:16px; display:flex; align-items:center; justify-content:center; text-align:center; color:#64748b; font-size:12px; pointer-events:none; }',
    '.stu-tools { display:grid; grid-template-columns:1fr 1fr; gap:4px; }',
    '.stu-tools button { padding:6px 4px; font-size:11px; background:#0f172a; border:1px solid #334155; color:#94a3b8; border-radius:6px; cursor:pointer; }',
    '.stu-tools button.on { border-color:#38bdf8; color:#38bdf8; background:rgba(56,189,248,0.08); }',
    '.stu-row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:6px; }',
    '.stu-row .grow { flex:1; }',
    '.stu-ocr { width:100%; min-height:90px; background:#0f172a; border:1px solid #334155; border-radius:6px; color:#e2e8f0; font-size:11px; padding:8px; resize:vertical; }'
  ].join('\n');
  document.head.appendChild(style);

  container.innerHTML =
    '<div class="tab-title">Screenshot Studio</div>' +
    '<div class="tab-desc">Paste or drop an image. Mark it up, OCR it, send it to DANMAN with context.</div>' +
    '<div class="stu-wrap">' +
      '<div class="stu-row">' +
        '<button class="btn btn-secondary btn-sm" id="stu-open">Open image</button>' +
        '<button class="btn btn-secondary btn-sm" id="stu-clear">Clear</button>' +
        '<span class="text-xs text-muted" style="margin-left:auto;">Paste image: Ctrl+V</span>' +
        '<input type="file" id="stu-file" accept="image/*" style="display:none">' +
      '</div>' +
      '<div class="stu-layout">' +
        '<div class="stu-canvas-col">' +
          '<div class="stu-canvas-host" id="stu-host">' +
            '<canvas id="stu-canvas" width="900" height="560"></canvas>' +
            '<div class="stu-empty" id="stu-empty">Paste an image here (Ctrl+V), drop a file, or click Open image.</div>' +
          '</div>' +
        '</div>' +
        '<div class="stu-side">' +
          '<div class="card">' +
            '<div class="section-title">Markup</div>' +
            '<div class="stu-tools" id="stu-tools">' +
              '<button data-tool="pen" class="on">Pen</button><button data-tool="line">Line</button>' +
              '<button data-tool="arrow">Arrow</button><button data-tool="rect">Box</button>' +
              '<button data-tool="ellipse">Oval</button><button data-tool="hilite">Hi-lite</button>' +
              '<button data-tool="text">Text</button><button data-tool="redact">Redact</button>' +
            '</div>' +
            '<div class="stu-row">' +
              '<input type="color" id="stu-color" value="#ff3355" style="width:38px;height:30px;padding:2px;background:#0f172a;border:1px solid #334155;border-radius:6px">' +
              '<input type="range" id="stu-size" min="2" max="18" value="4" style="flex:1">' +
              '<button class="btn btn-sm btn-secondary" id="stu-undo">Undo</button>' +
              '<button class="btn btn-sm btn-secondary" id="stu-redo">Redo</button>' +
            '</div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="section-title">OCR</div>' +
            '<div class="stu-row">' +
              '<button class="btn btn-secondary btn-sm grow" id="stu-ocr-local">Local OCR</button>' +
              '<button class="btn btn-secondary btn-sm grow" id="stu-ocr-ai">AI Vision OCR</button>' +
            '</div>' +
            '<textarea class="stu-ocr" id="stu-ocr-out" placeholder="Extracted text appears here…"></textarea>' +
            '<div class="stu-row">' +
              '<button class="btn btn-sm btn-secondary" id="stu-ocr-copy">Copy</button>' +
              '<button class="btn btn-sm btn-secondary" id="stu-ocr-clip">Save as clip</button>' +
            '</div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="section-title">Use it</div>' +
            '<div class="stu-row">' +
              '<button class="btn btn-secondary btn-sm grow" id="stu-copy-img">Copy image</button>' +
              '<button class="btn btn-secondary btn-sm grow" id="stu-save-clip">Save as clip</button>' +
            '</div>' +
            '<button class="btn btn-primary" id="stu-to-chat" style="width:100%;margin-top:6px;">Send to DANMAN chat</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  cv = $('#stu-canvas');
  ctx = cv.getContext('2d');

  function pos(e) {
    var r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (cv.width / Math.max(1, r.width)),
      y: (e.clientY - r.top) * (cv.height / Math.max(1, r.height))
    };
  }

  function drawShape(c, s) {
    c.strokeStyle = s.color;
    c.fillStyle = s.color;
    c.lineWidth = s.size;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (s.type === 'pen') {
      c.beginPath();
      s.pts.forEach(function (p, i) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); });
      c.stroke();
    } else if (s.type === 'line') {
      c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke();
    } else if (s.type === 'arrow') {
      c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke();
      var ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      var len = 10 + s.size * 2;
      c.beginPath();
      c.moveTo(s.x2, s.y2);
      c.lineTo(s.x2 - len * Math.cos(ang - 0.45), s.y2 - len * Math.sin(ang - 0.45));
      c.lineTo(s.x2 - len * Math.cos(ang + 0.45), s.y2 - len * Math.sin(ang + 0.45));
      c.closePath(); c.fill();
    } else if (s.type === 'rect') {
      c.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
    } else if (s.type === 'ellipse') {
      c.beginPath();
      c.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.abs(s.x2 - s.x1) / 2, Math.abs(s.y2 - s.y1) / 2, 0, 0, Math.PI * 2);
      c.stroke();
    } else if (s.type === 'hilite') {
      c.save(); c.globalAlpha = 0.3;
      c.fillRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
      c.restore();
    } else if (s.type === 'text') {
      c.font = (14 + s.size * 2) + 'px system-ui';
      c.fillText(s.text, s.x, s.y);
    } else if (s.type === 'redact') {
      var x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
      var w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
      if (w < 3 || h < 3) return;
      var off = document.createElement('canvas');
      off.width = Math.max(1, Math.round(w / 12));
      off.height = Math.max(1, Math.round(h / 12));
      var octx = off.getContext('2d');
      octx.drawImage(cv, x, y, w, h, 0, 0, off.width, off.height);
      c.save(); c.imageSmoothingEnabled = false;
      c.drawImage(off, 0, 0, off.width, off.height, x, y, w, h);
      c.restore();
    }
  }

  function draw(preview) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (img) ctx.drawImage(img, 0, 0, cv.width, cv.height);
    shapes.forEach(function (s) { drawShape(ctx, s); });
    if (preview) drawShape(ctx, preview);
  }

  function merged() { return cv.toDataURL('image/png'); }

  function loadDataUrl(url) {
    var im = new Image();
    im.onload = function () {
      img = im;
      var maxW = 1400, maxH = 1000;
      var w = im.width, h = im.height;
      var sc = Math.min(1, maxW / w, maxH / h);
      cv.width = Math.round(w * sc);
      cv.height = Math.round(h * sc);
      shapes = []; redo = [];
      $('#stu-empty').style.display = 'none';
      draw();
      record('studio:load');
    };
    im.src = url;
  }

  container.querySelectorAll('#stu-tools button').forEach(function (b) {
    b.onclick = function () {
      tool = b.getAttribute('data-tool');
      container.querySelectorAll('#stu-tools button').forEach(function (x) {
        x.classList.toggle('on', x === b);
      });
    };
  });

  cv.addEventListener('mousedown', function (e) {
    if (!img) return;
    var p = pos(e);
    drawing = true;
    redo = [];
    var base = { color: $('#stu-color').value, size: +$('#stu-size').value };
    if (tool === 'pen') cur = Object.assign({ type: 'pen', pts: [p] }, base);
    else if (tool === 'text') {
      var txt = prompt('Text:');
      if (txt) shapes.push(Object.assign({ type: 'text', x: p.x, y: p.y, text: txt }, base));
      drawing = false;
      draw();
      return;
    } else {
      cur = Object.assign({ type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y }, base);
    }
  });

  cv.addEventListener('mousemove', function (e) {
    if (!drawing || !cur) return;
    var p = pos(e);
    if (cur.type === 'pen') cur.pts.push(p);
    else { cur.x2 = p.x; cur.y2 = p.y; }
    draw(cur);
  });

  window.addEventListener('mouseup', function () {
    if (drawing && cur) shapes.push(cur);
    drawing = false;
    cur = null;
    draw();
  });

  var host = $('#stu-host');
  ['dragover', 'drop'].forEach(function (ev) {
    host.addEventListener(ev, function (e) {
      e.preventDefault();
      host.classList.toggle('drop', ev === 'dragover');
      if (ev === 'drop') {
        host.classList.remove('drop');
        var f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f && f.type.indexOf('image/') === 0) {
          readFileAsDataUrl(f).then(loadDataUrl);
        }
      }
    });
  });

  document.addEventListener('paste', function (e) {
    if (!container.classList.contains('active') && !container.closest('.tab-content.active')) {
      var tab = document.getElementById('tab-studio');
      if (!tab || !tab.classList.contains('active')) return;
    }
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image/') === 0) {
        var f = items[i].getAsFile();
        if (f) {
          e.preventDefault();
          readFileAsDataUrl(f).then(loadDataUrl);
        }
        break;
      }
    }
  });

  $('#stu-open').onclick = function () { $('#stu-file').click(); };
  $('#stu-file').onchange = function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) readFileAsDataUrl(f).then(loadDataUrl);
    e.target.value = '';
  };
  $('#stu-clear').onclick = function () {
    img = null; shapes = []; redo = [];
    draw();
    $('#stu-empty').style.display = 'flex';
  };
  $('#stu-undo').onclick = function () {
    var s = shapes.pop();
    if (s) redo.push(s);
    draw();
  };
  $('#stu-redo').onclick = function () {
    var s = redo.pop();
    if (s) shapes.push(s);
    draw();
  };

  async function ocrLocal() {
    if (!img) return toast('Load an image first', 'warn');
    var out = $('#stu-ocr-out');
    out.value = 'Loading Tesseract…';
    try {
      if (!window.Tesseract) {
        await new Promise(function (res, rej) {
          var s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
          s.onload = res;
          s.onerror = function () { rej(new Error('CDN blocked')); };
          document.head.appendChild(s);
        });
      }
      out.value = 'Recognizing… 0%';
      var worker = await Tesseract.createWorker('eng', 1, {
        logger: function (m) {
          if (m.status === 'recognizing text') {
            out.value = 'Recognizing… ' + Math.round(m.progress * 100) + '%';
          }
        }
      });
      var result = await worker.recognize(merged());
      await worker.terminate();
      out.value = (result.data && result.data.text || '').trim() || '(no text found)';
      record('studio:ocr', 'local');
    } catch (e) {
      out.value = '';
      toast('Local OCR failed (' + (e.message || e) + ') — try AI Vision OCR', 'bad');
    }
  }

  async function ocrAi() {
    if (!img) return toast('Load an image first', 'warn');
    var out = $('#stu-ocr-out');
    out.value = 'Asking AI to transcribe…';
    try {
      var r = await window.sendToBackground('OCR_RUN', {
        images: [{ dataUrl: merged(), index: 0 }],
        provider: 'auto',
        mode: 'vision'
      });
      if (r && (r.ok || r.success) && (r.data || r.text)) {
        var text = (r.data && (r.data.text || r.data.fullText)) || r.text || '';
        out.value = text;
        record('studio:ocr', 'ai');
      } else if (r && r.error) {
        out.value = '';
        toast('AI OCR failed: ' + r.error, 'bad');
      } else {
        // Fallback: DANMAN chat vision-style via BACKEND_POST if available
        var cfg = await window.sendToBackground('CONFIG_LOAD');
        var provider = (cfg && cfg.ai_provider) || 'claude';
        var chat = await window.sendToBackground('DANMAN_CHAT', {
          provider: provider,
          system: 'Transcribe all visible text from the image. Output plain text only.',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'OCR this annotated screenshot.' },
              { type: 'image', mime: 'image/png', data: dataUrlB64(merged()) }
            ]
          }]
        });
        if (chat && (chat.ok || chat.text)) {
          out.value = chat.text || (chat.data && chat.data.text) || '';
          record('studio:ocr', 'chat');
        } else {
          out.value = '';
          toast('AI OCR failed', 'bad');
        }
      }
    } catch (e) {
      out.value = '';
      toast('AI OCR failed: ' + (e.message || e), 'bad');
    }
  }

  $('#stu-ocr-local').onclick = function () { ocrLocal(); };
  $('#stu-ocr-ai').onclick = function () { ocrAi(); };
  $('#stu-ocr-copy').onclick = function () {
    var v = $('#stu-ocr-out').value || '';
    navigator.clipboard.writeText(v).then(function () { toast('Copied'); }).catch(function () { toast('Copy failed', 'warn'); });
  };
  $('#stu-ocr-clip').onclick = function () {
    var v = ($('#stu-ocr-out').value || '').trim();
    if (!v) return toast('Nothing to save', 'warn');
    window.sendToBackground('CLIPBOARD_NEW_CAPTURE', {
      content: v,
      contentType: 'text',
      sourceUrl: 'studio-ocr'
    }).then(function () {
      toast('Saved as clip');
      record('clip:add', 'ocr');
    });
  };
  $('#stu-copy-img').onclick = async function () {
    if (!img) return toast('Load an image first', 'warn');
    try {
      var blob = await (await fetch(merged())).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Annotated image copied');
    } catch (e) {
      toast('Copy blocked — use Save as clip', 'warn');
    }
  };
  $('#stu-save-clip').onclick = function () {
    if (!img) return toast('Load an image first', 'warn');
    window.sendToBackground('CLIPBOARD_NEW_CAPTURE', {
      content: merged(),
      contentType: 'image',
      sourceUrl: 'studio'
    }).then(function () {
      toast('Saved to clipboard history');
      record('clip:add', 'studio-image');
    });
  };
  $('#stu-to-chat').onclick = function () {
    if (!img) return toast('Load an image first', 'warn');
    var ocr = ($('#stu-ocr-out').value || '').trim();
    var payload = {
      imageDataUrl: merged(),
      ocrText: ocr,
      name: 'annotated screenshot'
    };
    try {
      window.dispatchEvent(new CustomEvent('gpd-studio-to-chat', { detail: payload }));
    } catch (_) {}
    // Switch to DANMAN tab and post-message attach if available
    var danmanBtn = document.querySelector('#tab-bar .tab[data-tab="danman"]');
    if (danmanBtn) danmanBtn.click();
    setTimeout(function () {
      window.postMessage({ type: 'GPD_STUDIO_ATTACH', payload: payload }, '*');
    }, 120);
    toast('Screenshot attached — open DANMAN chat');
    record('studio:tochat');
  };

  if (learn && learn.load) learn.load();
})();
