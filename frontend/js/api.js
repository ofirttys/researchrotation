/* api.js — talks to the Apps Script backend. No OAuth; every authenticated
   call sends the session token issued at login. */
'use strict';

const Api = (() => {

  function getToken() {
    const s = Session.get();
    return s ? s.token : null;
  }

  // Every call is a POST with a JSON body (text/plain content-type avoids a
  // CORS preflight, same trick used by the earlier CV app / Teaching Tracker).
  async function call(action, payload) {
    const url = window.APP_CONFIG.APPS_SCRIPT_URL;
    if (!url || url.indexOf('PASTE_YOUR') === 0) {
      throw new Error('Backend not configured yet — set APPS_SCRIPT_URL in config.js');
    }
    const body = Object.assign({ action, token: getToken() }, payload || {});
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    if (!resp.ok) throw new Error('Server error (HTTP ' + resp.status + ')');
    const data = await resp.json();
    if (data.error) {
      if (/session|not logged in|please log in/i.test(data.error)) {
        Session.clear();
        if (typeof window.onSessionExpired === 'function') window.onSessionExpired();
      }
      throw new Error(data.error);
    }
    return data;
  }

  return {
    login: (username, password) => call('login', { username, password }),
    logout: () => call('logout', {}),
    getMyData: () => call('getMyData', {}),
    saveProject: (project) => call('saveProject', { project }),
    deleteProject: (projectId) => call('deleteProject', { projectId }),
    changePassword: (oldPassword, newPassword) => call('changePassword', { oldPassword, newPassword }),

    adminListUsers: (role) => call('adminListUsers', { role }),
    adminGetUserData: (username) => call('adminGetUserData', { username }),
    adminAddUser: (firstName, lastName, role, pgyYear) => call('adminAddUser', { firstName, lastName, role, pgyYear }),
    adminUpdateUser: (username, firstName, lastName, pgyYear) => call('adminUpdateUser', { username, firstName, lastName, pgyYear }),
    adminResetPassword: (username) => call('adminResetPassword', { username }),
    adminSaveProject: (username, project) => call('adminSaveProject', { username, project }),
    adminDeleteProject: (username, projectId) => call('adminDeleteProject', { username, projectId }),
  };
})();
