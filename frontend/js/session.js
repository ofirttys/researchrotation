/* session.js — persists the login token + user in localStorage so refreshing
   or closing the tab doesn't log anyone out. The backend independently slides
   the token's real expiry (14 days of inactivity) on every authenticated call;
   this is just where the browser keeps its copy of that token. */
'use strict';

const Session = (() => {
  function key() { return window.APP_CONFIG.SESSION_STORAGE_KEY; }

  function get() {
    try {
      const raw = localStorage.getItem(key());
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function set(token, user) {
    localStorage.setItem(key(), JSON.stringify({ token, user }));
  }

  function clear() {
    localStorage.removeItem(key());
  }

  return { get, set, clear };
})();
