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

  return { openModal, closeModal, toast, loading, showError, nav, copyToClipboard, bindGlobalHandlers };
})();
