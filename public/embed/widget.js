/**
 * KeiroAI Embeddable Widget
 *
 * Usage: <script src="https://keiroai.com/embed/widget.js" data-key="YOUR_WIDGET_KEY"></script>
 *
 * Optional attributes:
 *   data-color="#8b5cf6"     — accent color
 *   data-position="right"   — left or right
 *   data-greeting="Bonjour!" — custom greeting
 *   data-agent="chatbot"    — chatbot (Max) or onboarding (Clara)
 *   data-lang="fr"          — language
 */
(function() {
  'use strict';

  // Config from script tag
  var script = document.currentScript || document.querySelector('script[data-key]');
  if (!script) return;

  var KEY = script.getAttribute('data-key');
  if (!KEY) { console.warn('[KeiroAI] Missing data-key'); return; }

  var API = 'https://keiroai.com/api/widget';
  var COLOR = script.getAttribute('data-color') || '#8b5cf6';
  var POS = script.getAttribute('data-position') || 'right';
  var GREETING = script.getAttribute('data-greeting') || 'Bonjour ! Comment puis-je vous aider ?';
  var AGENT = script.getAttribute('data-agent') || 'chatbot';
  var LANG = script.getAttribute('data-lang') || 'fr';

  // Session
  var SESSION_KEY = 'keiro_widget_session';
  var sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  // Check returning visitor
  var visitCount = parseInt(localStorage.getItem('keiro_visits') || '0') + 1;
  localStorage.setItem('keiro_visits', String(visitCount));

  // Visitor profile (enriched over time)
  var visitorProfile = JSON.parse(localStorage.getItem('keiro_visitor') || '{}');
  visitorProfile.device = /Mobi/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
  visitorProfile.referrer = visitorProfile.referrer || document.referrer || 'direct';
  visitorProfile.returning = visitCount > 1;
  visitorProfile.visit_count = visitCount;
  visitorProfile.pages_viewed = visitorProfile.pages_viewed || [];
  if (visitorProfile.pages_viewed.indexOf(location.pathname) === -1) {
    visitorProfile.pages_viewed.push(location.pathname);
  }
  localStorage.setItem('keiro_visitor', JSON.stringify(visitorProfile));

  // Track page view
  fetch(API + '/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ widget_key: KEY, session_id: sessionId, event: 'page_view', data: { url: location.pathname, referrer: document.referrer, device: visitorProfile.device } }),
  }).catch(function() {});

  // Track time on site
  var startTime = Date.now();
  setInterval(function() {
    visitorProfile.time_on_site = Math.round((Date.now() - startTime) / 1000);
    localStorage.setItem('keiro_visitor', JSON.stringify(visitorProfile));
  }, 30000);

  // ─── CSS ───
  var css = document.createElement('style');
  css.textContent = [
    '#keiro-widget-btn{position:fixed;bottom:20px;' + POS + ':20px;z-index:99999;width:60px;height:60px;border-radius:50%;background:' + COLOR + ';border:none;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;transition:transform 0.2s}',
    '#keiro-widget-btn:hover{transform:scale(1.1)}',
    '#keiro-widget-btn svg{width:28px;height:28px;fill:white}',
    '#keiro-widget-panel{position:fixed;bottom:90px;' + POS + ':20px;z-index:99999;width:380px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.2);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}',
    '#keiro-widget-panel.open{display:flex}',
    '#keiro-widget-header{background:' + COLOR + ';color:white;padding:16px;display:flex;align-items:center;gap:12px}',
    '#keiro-widget-header img{width:40px;height:40px;border-radius:50%;border:2px solid rgba(255,255,255,0.3)}',
    '#keiro-widget-header .name{font-weight:700;font-size:14px}',
    '#keiro-widget-header .status{font-size:11px;opacity:0.8}',
    '#keiro-widget-header .close{margin-left:auto;background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}',
    '#keiro-widget-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px}',
    '.keiro-msg{max-width:85%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5;word-wrap:break-word}',
    '.keiro-msg.bot{background:#f3f4f6;color:#1f2937;border-bottom-left-radius:4px;align-self:flex-start}',
    '.keiro-msg.user{background:' + COLOR + ';color:white;border-bottom-right-radius:4px;align-self:flex-end}',
    '.keiro-typing{display:flex;gap:4px;padding:10px 14px;align-self:flex-start}',
    '.keiro-typing span{width:6px;height:6px;border-radius:50%;background:#9ca3af;animation:keiro-bounce 1.2s infinite}',
    '.keiro-typing span:nth-child(2){animation-delay:0.15s}',
    '.keiro-typing span:nth-child(3){animation-delay:0.3s}',
    '@keyframes keiro-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}',
    '#keiro-widget-input{border-top:1px solid #e5e7eb;padding:12px;display:flex;gap:8px}',
    '#keiro-widget-input input{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;font-size:13px;outline:none}',
    '#keiro-widget-input input:focus{border-color:' + COLOR + ';box-shadow:0 0 0 2px ' + COLOR + '33}',
    '#keiro-widget-input button{background:' + COLOR + ';color:white;border:none;border-radius:8px;width:40px;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '#keiro-widget-input button:disabled{opacity:0.4;cursor:not-allowed}',
    '#keiro-badge{text-align:center;padding:4px;font-size:9px;color:#9ca3af}',
    '#keiro-badge a{color:#9ca3af;text-decoration:none}',
  ].join('\n');
  document.head.appendChild(css);

  // ─── HTML ───
  // Button
  var btn = document.createElement('button');
  btn.id = 'keiro-widget-btn';
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>';
  btn.setAttribute('aria-label', 'Ouvrir le chat');
  document.body.appendChild(btn);

  // Panel
  var panel = document.createElement('div');
  panel.id = 'keiro-widget-panel';
  var agentName = AGENT === 'onboarding' ? 'Clara' : 'Max';
  panel.innerHTML = [
    '<div id="keiro-widget-header">',
    '  <div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:20px">' + (AGENT === 'onboarding' ? '\u{1F680}' : '\u{1F916}') + '</div>',
    '  <div><div class="name">' + agentName + '</div><div class="status">\u{1F7E2} En ligne</div></div>',
    '  <button class="close" id="keiro-close">\u00D7</button>',
    '</div>',
    '<div id="keiro-widget-messages"></div>',
    '<div id="keiro-widget-input">',
    '  <input type="text" id="keiro-input" placeholder="Ecrivez votre message..." />',
    '  <button id="keiro-send"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>',
    '</div>',
    '<div id="keiro-badge"><a href="https://keiroai.com" target="_blank">Propulse par KeiroAI</a></div>',
  ].join('');
  document.body.appendChild(panel);

  // ─── State ───
  var messages = [];
  var isOpen = false;
  var isLoading = false;
  var messagesEl = document.getElementById('keiro-widget-messages');
  var inputEl = document.getElementById('keiro-input');
  var sendBtn = document.getElementById('keiro-send');

  function addMessage(role, content) {
    messages.push({ role: role, content: content });
    var div = document.createElement('div');
    div.className = 'keiro-msg ' + (role === 'user' ? 'user' : 'bot');
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    var div = document.createElement('div');
    div.className = 'keiro-typing';
    div.id = 'keiro-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    var el = document.getElementById('keiro-typing');
    if (el) el.remove();
  }

  async function sendMessage(text) {
    if (!text.trim() || isLoading) return;
    addMessage('user', text);
    inputEl.value = '';
    isLoading = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      var res = await fetch(API + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          widget_key: KEY,
          visitor_profile: visitorProfile,
        }),
      });
      var data = await res.json();
      hideTyping();
      if (data.reply) {
        addMessage('assistant', data.reply);
      }
      if (data.session_id) sessionId = data.session_id;
    } catch (e) {
      hideTyping();
      addMessage('assistant', 'Desolee, je rencontre un probleme technique. Reessayez dans un instant.');
    }

    isLoading = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }

  // ─── Events ───
  btn.addEventListener('click', function() {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    if (isOpen && messages.length === 0) {
      addMessage('assistant', GREETING);
    }
    if (isOpen) inputEl.focus();
  });

  document.getElementById('keiro-close').addEventListener('click', function() {
    isOpen = false;
    panel.classList.remove('open');
  });

  sendBtn.addEventListener('click', function() { sendMessage(inputEl.value); });
  inputEl.addEventListener('keydown', function(e) { if (e.key === 'Enter') sendMessage(inputEl.value); });

  // Auto-open after delay if configured
  var autoOpen = script.getAttribute('data-auto-open');
  if (autoOpen) {
    setTimeout(function() {
      if (!isOpen) btn.click();
    }, parseInt(autoOpen) * 1000 || 30000);
  }

  // ─── Product view tracking (for e-commerce) ───
  window.keiroTrack = function(event, data) {
    fetch(API + '/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widget_key: KEY, session_id: sessionId, event: event, data: data }),
    }).catch(function() {});

    // Update local profile
    if (event === 'product_view' && data && data.product) {
      visitorProfile.products_viewed = visitorProfile.products_viewed || [];
      if (visitorProfile.products_viewed.indexOf(data.product) === -1) {
        visitorProfile.products_viewed.push(data.product);
      }
    }
    if (event === 'cart_update') {
      visitorProfile.cart_items = data.items;
      visitorProfile.cart_value = data.value;
    }
    localStorage.setItem('keiro_visitor', JSON.stringify(visitorProfile));
  };

})();
