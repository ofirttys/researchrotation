/* ui.js — small shared UI helpers: modals, toasts, loading overlay, nav. */
'use strict';

const UI = (() => {
  function openModal(id) { document.getElementById(id).classList.add('open'); }
  function closeModal(id) { document.getElementById(id).classList.remove('open'); }

  function toast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast ' + (type || '');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  function loading(show, label) {
    const el = document.getElementById('loadingOverlay');
    document.getElementById('loadingLabel').textContent = label || 'Loading…';
    el.classList.toggle('show', !!show);
  }

  function showError(elId, message) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
  }

  // Not every page has a sidebar entry (e.g. the admin's fellow-detail page
  // is reached via a row button, not a nav item) — only touch nav-item
  // active states when a matching one actually exists.
  function nav(pageId) {
    const navItem = document.querySelector('.nav-item[data-page="' + pageId + '"]');
    if (navItem) {
      const sidebar = navItem.parentElement;
      sidebar.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      navItem.classList.add('active');
    } else {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
  }

  function copyToClipboard(elId) {
    const el = document.getElementById(elId);
    const text = el.innerText;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast('Copied to clipboard', 'success'),
        () => fallbackCopy(text)
      );
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('Copied to clipboard', 'success'); }
    catch (e) { toast('Could not copy — please select and copy manually', 'error'); }
    document.body.removeChild(ta);
  }

  const EYE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  // Wraps every password input on the page with a show/hide "eye" toggle
  // button. Safe to call more than once — already-wrapped inputs are skipped.
  function enablePasswordToggles() {
    document.querySelectorAll('input[type="password"]').forEach(input => {
      if (input.dataset.pwToggled) return;
      input.dataset.pwToggled = '1';

      const wrap = document.createElement('div');
      wrap.className = 'pw-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pw-toggle';
      btn.setAttribute('aria-label', 'Show password');
      btn.innerHTML = EYE_ICON;
      btn.addEventListener('click', () => {
        const showing = input.type === 'password';
        input.type = showing ? 'text' : 'password';
        btn.innerHTML = showing ? EYE_OFF_ICON : EYE_ICON;
        btn.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
      });
      wrap.appendChild(btn);
    });
  }

  // Wire up every element with data-close="modalId" and data-copy="elId" once at startup.
  function bindGlobalHandlers() {
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close')));
    });
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => copyToClipboard(btn.getAttribute('data-copy')));
    });
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) backdrop.classList.remove('open');
      });
    });
  }

  return { openModal, closeModal, toast, loading, showError, nav, copyToClipboard, bindGlobalHandlers, enablePasswordToggles };
})();
