/* fellow.js — the fellow's own dashboard, report, and account settings pages. */
'use strict';

const Fellow = (() => {

  async function loadDashboard() {
    UI.loading(true, 'Loading your projects…');
    try {
      const data = await Api.getMyData();
      APP.milestoneTemplates = data.milestoneTemplates;
      APP.completedByOptions = data.completedByOptions;
      APP.viewedData = { user: data.user, projects: data.projects };
      renderDashboard();
    } catch (e) {
      UI.toast(e.message, 'error');
    } finally {
      UI.loading(false);
    }
  }

  function renderDashboard() {
    const { user, projects } = APP.viewedData;
    document.getElementById('fellowWelcome').textContent = 'Welcome back, ' + user.firstName;
    document.getElementById('fellowSubtitle').textContent =
      (user.pgyYear ? user.pgyYear + ' rotation · ' : '') + 'UofT GREI Fellowship Program';
    document.getElementById('fellowStats').innerHTML = Render.statCards(Render.computeStats(projects));
    Render.renderProjectLists('', projects);

    document.getElementById('accountUsername').value = user.username;
    document.getElementById('accountEmail').value = user.email;
  }

  function bindDashboardEvents() {
    document.querySelectorAll('#fellow-dashboard [data-add-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        Projects.open({
          username: APP.viewedData.user.username,
          isAdmin: false,
          projectId: null,
          type: btn.getAttribute('data-add-type'),
          onSaved: loadDashboard,
        });
      });
    });

    document.getElementById('fellow-dashboard').addEventListener('click', e => {
      const btn = e.target.closest('[data-edit-project]');
      if (!btn) return;
      const projectId = btn.getAttribute('data-edit-project');
      const project = APP.viewedData.projects.find(p => p.projectId === projectId);
      Projects.open({
        username: APP.viewedData.user.username,
        isAdmin: false,
        projectId,
        type: project.type,
        onSaved: loadDashboard,
      });
    });
  }

  // Re-render project lists whenever a card's Edit button is clicked, since
  // project lists are re-created by innerHTML each load (event delegation
  // above on the container handles this without re-binding).

  async function submitChangePassword(e) {
    e.preventDefault();
    UI.showError('pwChangeError', '');
    const oldPassword = document.getElementById('pwCurrent').value;
    const newPassword = document.getElementById('pwNew').value;
    const confirmPassword = document.getElementById('pwConfirm').value;
    if (newPassword !== confirmPassword) {
      UI.showError('pwChangeError', 'New password and confirmation do not match.');
      return;
    }
    UI.loading(true, 'Updating password…');
    try {
      await Api.changePassword(oldPassword, newPassword);
      UI.toast('Password updated', 'success');
      document.getElementById('changePasswordForm').reset();
    } catch (e2) {
      UI.showError('pwChangeError', e2.message);
    } finally {
      UI.loading(false);
    }
  }

  function bindAccountEvents() {
    document.getElementById('changePasswordForm').addEventListener('submit', submitChangePassword);
  }

  function bindReportEvents() {
    document.getElementById('fellowGenerateReportBtn').addEventListener('click', async () => {
      UI.loading(true, 'Building your PDF report…');
      try {
        await Pdf.downloadForFellow(APP.viewedData.user, APP.viewedData.projects);
      } catch (e) {
        UI.toast(e.message, 'error');
      } finally {
        UI.loading(false);
      }
    });
  }

  function bindAll() {
    bindDashboardEvents();
    bindAccountEvents();
    bindReportEvents();
  }

  return { loadDashboard, renderDashboard, bindAll };
})();
