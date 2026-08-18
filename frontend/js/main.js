/* main.js — app bootstrap: login/logout, session restore, nav wiring. */
'use strict';

window.APP = {
  milestoneTemplates: null,
  completedByOptions: null,
  viewedData: null,      // { user, projects } for whoever is currently on screen
  projectModalCtx: null,
};

function showLogin() {
  document.getElementById('view-app').style.display = 'none';
  document.getElementById('view-login').style.display = 'flex';
  document.getElementById('loginPassword').value = '';
}

function enterApp(user) {
  document.getElementById('view-login').style.display = 'none';
  document.getElementById('view-app').style.display = 'block';

  document.getElementById('userAvatar').textContent = Render.initials(user.firstName, user.lastName);
  document.getElementById('userName').textContent = user.firstName + ' ' + user.lastName;
  document.getElementById('userRole').textContent = user.role === 'admin'
    ? 'Program Administrator'
    : 'Fellow' + (user.pgyYear ? ' · ' + user.pgyYear : '');

  // Account Settings (password change) is shared by both roles — populate it
  // here from the login response so it's correct even before any dashboard load.
  document.getElementById('accountUsername').value = user.username;
  document.getElementById('accountEmail').value = user.email;

  if (user.role === 'admin') {
    document.getElementById('nav-fellow').style.display = 'none';
    document.getElementById('nav-admin').style.display = 'block';
    UI.nav('admin-dashboard');
    Admin.loadFellowsList();
  } else {
    document.getElementById('nav-admin').style.display = 'none';
    document.getElementById('nav-fellow').style.display = 'block';
    UI.nav('fellow-dashboard');
    Fellow.loadDashboard();
  }
  window.scrollTo(0, 0);
}

async function submitLogin(e) {
  e.preventDefault();
  UI.showError('loginError', '');
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginSubmitBtn');
  btn.disabled = true;
  UI.loading(true, 'Logging in…');
  try {
    const result = await Api.login(username, password);
    Session.set(result.token, result.user);
    enterApp(result.user);
  } catch (err) {
    UI.showError('loginError', err.message);
  } finally {
    btn.disabled = false;
    UI.loading(false);
  }
}

async function logout() {
  try { await Api.logout(); } catch (e) { /* best-effort */ }
  Session.clear();
  showLogin();
}

function bindNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.getAttribute('data-page');
      UI.nav(page);
      if (page === 'admin-dashboard') Admin.loadFellowsList();
      if (page === 'admin-admins') Admin.loadAdminsList();
      if (page === 'admin-reports') Admin.loadFellowsList();
      if (page === 'fellow-dashboard') Fellow.loadDashboard();
    });
  });
  document.getElementById('logoutBtn').addEventListener('click', logout);
}

document.addEventListener('DOMContentLoaded', () => {
  UI.bindGlobalHandlers();
  Projects.bind();
  Fellow.bindAll();
  Admin.bindAll();
  bindNav();

  document.getElementById('loginForm').addEventListener('submit', submitLogin);
  window.onSessionExpired = () => {
    UI.toast('Your session has expired — please log in again.', 'error');
    showLogin();
  };

  const existing = Session.get();
  if (existing && existing.user) {
    // Optimistically restore the UI; the first data call will bounce us back
    // to the login screen if the token turned out to be invalid/expired.
    enterApp(existing.user);
  } else {
    showLogin();
  }
});
