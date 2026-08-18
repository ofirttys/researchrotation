/* admin.js — fellows overview, fellow detail, admins list, and the shared
   add/edit/reset-password modals used for both fellow and admin accounts. */
'use strict';

const Admin = (() => {

  let fellowsCache = [];

  // ── FELLOWS LIST ─────────────────────────────────────────────────────────

  async function loadFellowsList() {
    UI.loading(true, 'Loading fellows…');
    try {
      const data = await Api.adminListUsers('fellow');
      fellowsCache = data.users;
      Render.renderAdminStats(fellowsCache);
      Render.renderFellowTable(fellowsCache);
      Render.renderReportsTable(fellowsCache);
    } catch (e) {
      UI.toast(e.message, 'error');
    } finally {
      UI.loading(false);
    }
  }

  async function loadAdminsList() {
    UI.loading(true, 'Loading admins…');
    try {
      const data = await Api.adminListUsers('admin');
      Render.renderAdminTable(data.users);
    } catch (e) {
      UI.toast(e.message, 'error');
    } finally {
      UI.loading(false);
    }
  }

  // ── FELLOW DETAIL ────────────────────────────────────────────────────────

  async function openFellowDetail(username) {
    UI.loading(true, 'Loading fellow…');
    try {
      const data = await Api.adminGetUserData(username);
      APP.milestoneTemplates = data.milestoneTemplates;
      APP.completedByOptions = data.completedByOptions;
      APP.viewedData = { user: data.user, projects: data.projects };

      document.getElementById('detailFellowName').textContent = data.user.firstName + ' ' + data.user.lastName;
      document.getElementById('detailFellowMeta').textContent =
        (data.user.pgyYear ? data.user.pgyYear + ' · ' : '') + data.user.email;
      document.getElementById('detailStats').innerHTML = Render.statCards(Render.computeStats(data.projects));
      Render.renderProjectLists('detail', data.projects);

      UI.nav('admin-fellow-detail');
    } catch (e) {
      UI.toast(e.message, 'error');
    } finally {
      UI.loading(false);
    }
  }

  // ── ADD FELLOW ───────────────────────────────────────────────────────────

  function openAddFellowModal() {
    ['afFirstName', 'afLastName', 'afYear'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('afResultBlock').style.display = 'none';
    UI.showError('addFellowError', '');
    UI.openModal('addFellowModal');
  }

  async function submitAddFellow() {
    const firstName = document.getElementById('afFirstName').value.trim();
    const lastName = document.getElementById('afLastName').value.trim();
    const year = document.getElementById('afYear').value.trim();
    if (!firstName || !lastName) { UI.showError('addFellowError', 'First and last name are required.'); return; }

    UI.loading(true, 'Creating account…');
    try {
      const result = await Api.adminAddUser(firstName, lastName, 'fellow', year);
      document.getElementById('afGenUsername').value = result.username;
      document.getElementById('afGenEmail').value = result.email;
      document.getElementById('afGenPassword').value = result.tempPassword;
      document.getElementById('afWelcomeText').innerText = welcomeText(firstName, result, year);
      document.getElementById('afResultBlock').style.display = 'block';
      UI.toast('Fellow account created', 'success');
      await loadFellowsList();
    } catch (e) {
      UI.showError('addFellowError', e.message);
    } finally {
      UI.loading(false);
    }
  }

  function welcomeText(firstName, result, year) {
    return `Subject: Welcome to the Research Rotation Tracker

Hi ${firstName},

An account has been created for you in the Research Rotation Tracker${year ? ' for the ' + year + ' rotation' : ''}.

Login page: https://ResearchRotation.fertilitypreservation.ca
Username: ${result.username}
Temporary password: ${result.tempPassword}

Please log in and update your research project details. You can change your password any time from Account Settings.

Best,
Jennia Michaeli
UofT GREI Fellowship Program`;
  }

  // ── ADD ADMIN ────────────────────────────────────────────────────────────

  function openAddAdminModal() {
    ['aaFirstName', 'aaLastName'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('aaResultBlock').style.display = 'none';
    UI.showError('addAdminError', '');
    UI.openModal('addAdminModal');
  }

  async function submitAddAdmin() {
    const firstName = document.getElementById('aaFirstName').value.trim();
    const lastName = document.getElementById('aaLastName').value.trim();
    if (!firstName || !lastName) { UI.showError('addAdminError', 'First and last name are required.'); return; }

    UI.loading(true, 'Creating admin account…');
    try {
      const result = await Api.adminAddUser(firstName, lastName, 'admin');
      document.getElementById('aaGenUsername').value = result.username;
      document.getElementById('aaGenEmail').value = result.email;
      document.getElementById('aaGenPassword').value = result.tempPassword;
      document.getElementById('aaWelcomeText').innerText =
`Subject: Welcome to the Research Rotation Tracker (Admin access)

Hi ${firstName},

An administrator account has been created for you in the Research Rotation Tracker.

Login page: https://ResearchRotation.fertilitypreservation.ca
Username: ${result.username}
Temporary password: ${result.tempPassword}

As an admin you can add/edit fellow accounts, review everyone's progress, and generate reports.

Best,
Jennia Michaeli`;
      document.getElementById('aaResultBlock').style.display = 'block';
      UI.toast('Admin account created', 'success');
      await loadAdminsList();
    } catch (e) {
      UI.showError('addAdminError', e.message);
    } finally {
      UI.loading(false);
    }
  }

  // ── EDIT USER (fellow or admin) ──────────────────────────────────────────

  let editCtx = null; // { username, isFellow }

  function openEditModal(username) {
    const user = findCachedUser(username);
    editCtx = { username, isFellow: user ? user.role !== 'admin' : true };
    UI.showError('editFellowError', '');
    document.getElementById('efFirstName').value = user ? user.firstName : '';
    document.getElementById('efLastName').value = user ? user.lastName : '';
    document.getElementById('efUsernamePreview').value = username;
    document.getElementById('efEmailPreview').value = user ? user.email : '';
    document.getElementById('efYear').value = (user && user.pgyYear) || '';
    document.getElementById('efYear').closest('.field').style.display = editCtx.isFellow ? 'block' : 'none';
    document.getElementById('editFellowNote').style.display = 'none';
    window._editOrigName = user ? (user.firstName + ' ' + user.lastName) : '';
    UI.openModal('editFellowModal');
  }

  function findCachedUser(username) {
    return fellowsCache.find(u => u.username === username) ||
      (APP.viewedData && APP.viewedData.user && APP.viewedData.user.username === username ? APP.viewedData.user : null);
  }

  function bindEditPreview() {
    ['efFirstName', 'efLastName'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        const fn = document.getElementById('efFirstName').value.trim();
        const ln = document.getElementById('efLastName').value.trim();
        if (fn && ln) {
          document.getElementById('efUsernamePreview').value = (fn + '.' + ln).toLowerCase();
          document.getElementById('efEmailPreview').value = (fn + '.' + ln).toLowerCase() + '@sinaihealth.ca';
        }
        const changed = window._editOrigName && (fn + ' ' + ln !== window._editOrigName);
        document.getElementById('editFellowNote').style.display = changed ? 'block' : 'none';
      });
    });
  }

  async function submitEditUser() {
    const firstName = document.getElementById('efFirstName').value.trim();
    const lastName = document.getElementById('efLastName').value.trim();
    const pgyYear = document.getElementById('efYear').value.trim();
    if (!firstName || !lastName) { UI.showError('editFellowError', 'First and last name are required.'); return; }

    UI.loading(true, 'Saving…');
    try {
      const result = await Api.adminUpdateUser(editCtx.username, firstName, lastName, pgyYear);
      UI.closeModal('editFellowModal');
      UI.toast('Saved', 'success');
      if (editCtx.isFellow) {
        await loadFellowsList();
        if (APP.viewedData && APP.viewedData.user.username === editCtx.username) {
          await openFellowDetail(result.username);
        }
      } else {
        await loadAdminsList();
      }
    } catch (e) {
      UI.showError('editFellowError', e.message);
    } finally {
      UI.loading(false);
    }
  }

  // ── RESET PASSWORD (fellow or admin) ─────────────────────────────────────

  let resetCtx = null; // { username, firstName }

  function openResetModal(username) {
    const user = findCachedUser(username);
    resetCtx = { username, firstName: user ? user.firstName : username };
    document.getElementById('resetModalTitle').textContent = 'Reset Password — ' + resetCtx.firstName;
    document.getElementById('resetGenPassword').value = '';
    document.getElementById('resetMessageText').innerText = 'Click "Generate New Password" to create one.';
    UI.openModal('resetPasswordModal');
  }

  async function submitReset() {
    UI.loading(true, 'Generating new password…');
    try {
      const result = await Api.adminResetPassword(resetCtx.username);
      document.getElementById('resetGenPassword').value = result.tempPassword;
      document.getElementById('resetMessageText').innerText =
`Hi ${resetCtx.firstName},

Your password for the Research Rotation Tracker has been reset by the admin.

Login page: https://ResearchRotation.fertilitypreservation.ca
Username: ${result.username}
New temporary password: ${result.tempPassword}

Best,
Jennia Michaeli`;
      UI.toast('Password reset', 'success');
    } catch (e) {
      UI.toast(e.message, 'error');
    } finally {
      UI.loading(false);
    }
  }

  // ── REPORTS ──────────────────────────────────────────────────────────────

  async function generateAllReports() {
    UI.loading(true, 'Gathering data for every fellow…');
    try {
      const list = await Api.adminListUsers('fellow');
      const fellows = [];
      for (const f of list.users) {
        const data = await Api.adminGetUserData(f.username);
        fellows.push({ user: data.user, projects: data.projects });
      }
      UI.loading(true, 'Building combined PDF…');
      await Pdf.downloadForAll(fellows);
    } catch (e) {
      UI.toast(e.message, 'error');
    } finally {
      UI.loading(false);
    }
  }

  async function generateOneReport(username) {
    UI.loading(true, 'Building PDF report…');
    try {
      const data = await Api.adminGetUserData(username);
      await Pdf.downloadForFellow(data.user, data.projects);
    } catch (e) {
      UI.toast(e.message, 'error');
    } finally {
      UI.loading(false);
    }
  }

  // ── EVENT BINDING ────────────────────────────────────────────────────────

  function bindAll() {
    document.getElementById('addFellowBtn').addEventListener('click', openAddFellowModal);
    document.getElementById('createFellowBtn').addEventListener('click', submitAddFellow);
    document.getElementById('addAdminBtn').addEventListener('click', openAddAdminModal);
    document.getElementById('createAdminBtn').addEventListener('click', submitAddAdmin);
    document.getElementById('saveFellowInfoBtn').addEventListener('click', submitEditUser);
    document.getElementById('confirmResetBtn').addEventListener('click', submitReset);
    bindEditPreview();

    document.getElementById('adminFellowTable').addEventListener('click', e => {
      const view = e.target.closest('[data-view-fellow]');
      const edit = e.target.closest('[data-edit-fellow]');
      const reset = e.target.closest('[data-reset-fellow]');
      const pdf = e.target.closest('[data-pdf-fellow]');
      if (view) openFellowDetail(view.getAttribute('data-view-fellow'));
      else if (edit) openEditModal(edit.getAttribute('data-edit-fellow'));
      else if (reset) openResetModal(reset.getAttribute('data-reset-fellow'));
      else if (pdf) generateOneReport(pdf.getAttribute('data-pdf-fellow'));
    });

    document.getElementById('adminAdminTable').addEventListener('click', e => {
      const edit = e.target.closest('[data-edit-fellow]');
      const reset = e.target.closest('[data-reset-fellow]');
      if (edit) openEditModal(edit.getAttribute('data-edit-fellow'));
      else if (reset) openResetModal(reset.getAttribute('data-reset-fellow'));
    });

    document.getElementById('reportsTable').addEventListener('click', e => {
      const pdf = e.target.closest('[data-pdf-fellow]');
      if (pdf) generateOneReport(pdf.getAttribute('data-pdf-fellow'));
    });

    document.getElementById('generateAllReportBtn').addEventListener('click', generateAllReports);

    document.getElementById('detailEditBtn').addEventListener('click', () => openEditModal(APP.viewedData.user.username));
    document.getElementById('detailResetBtn').addEventListener('click', () => openResetModal(APP.viewedData.user.username));
    document.getElementById('detailReportBtn').addEventListener('click', () => generateOneReport(APP.viewedData.user.username));

    document.querySelectorAll('#admin-fellow-detail [data-add-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        Projects.open({
          username: APP.viewedData.user.username,
          isAdmin: true,
          projectId: null,
          type: btn.getAttribute('data-add-type'),
          onSaved: () => openFellowDetail(APP.viewedData.user.username),
        });
      });
    });

    document.getElementById('admin-fellow-detail').addEventListener('click', e => {
      const btn = e.target.closest('[data-edit-project]');
      if (!btn) return;
      const projectId = btn.getAttribute('data-edit-project');
      const project = APP.viewedData.projects.find(p => p.projectId === projectId);
      Projects.open({
        username: APP.viewedData.user.username,
        isAdmin: true,
        projectId,
        type: project.type,
        onSaved: () => openFellowDetail(APP.viewedData.user.username),
      });
    });
  }

  return { loadFellowsList, loadAdminsList, openFellowDetail, bindAll };
})();
