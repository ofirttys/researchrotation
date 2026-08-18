/* projects.js — the "add/edit project" modal, shared between the fellow's own
   dashboard and the admin's fellow-detail view. APP.projectModalCtx tracks
   who we're editing for and where to refresh afterwards. */
'use strict';

const Projects = (() => {

  // ctx = { username, isAdmin, projectId (null = new), type, onSaved: fn }
  function open(ctx) {
    APP.projectModalCtx = ctx;
    UI.showError('projectModalError', '');

    const project = ctx.projectId
      ? APP.viewedData.projects.find(p => p.projectId === ctx.projectId)
      : { type: ctx.type, title: '', studyDesign: '', pi: '', coPi: '', collaborators: '', milestones: [] };

    document.getElementById('projectModalTitle').textContent =
      (ctx.projectId ? 'Edit ' : 'New ') + capitalize(ctx.type) + ' Project';

    document.getElementById('pTitle').value = project.title || '';
    document.getElementById('pStudyDesign').value = project.studyDesign || '';
    document.getElementById('pPi').value = project.pi || '';
    document.getElementById('pCoPi').value = project.coPi || '';
    document.getElementById('pCollaborators').value = project.collaborators || '';
    document.getElementById('pStudyDesignField').style.display = ctx.type === 'research' ? 'block' : 'none';

    document.getElementById('milestoneTable').innerHTML =
      `<tr><th>Milestone</th><th>Completed by</th><th>Target date</th><th>Actual date</th></tr>` +
      Render.milestoneRows(ctx.type, project.milestones, APP.completedByOptions);

    // Only allow deleting if this fellow has more than one project of this type.
    const countOfType = APP.viewedData.projects.filter(p => p.type === ctx.type).length;
    const deleteBtn = document.getElementById('deleteProjectBtn');
    deleteBtn.style.display = ctx.projectId ? 'inline-flex' : 'none';
    deleteBtn.disabled = countOfType <= 1;
    deleteBtn.title = countOfType <= 1 ? 'At least one project of this type is required' : '';

    UI.openModal('projectModal');
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function collectMilestones() {
    return Array.from(document.querySelectorAll('#milestoneTable tr[data-name]')).map(tr => ({
      name: tr.getAttribute('data-name'),
      completedBy: tr.querySelector('select').value,
      targetDate: tr.querySelector('.m-target').value,
      actualDate: tr.querySelector('.m-actual').value,
    }));
  }

  async function save() {
    const ctx = APP.projectModalCtx;
    const project = {
      projectId: ctx.projectId || undefined,
      type: ctx.type,
      title: document.getElementById('pTitle').value.trim(),
      studyDesign: document.getElementById('pStudyDesign').value.trim(),
      pi: document.getElementById('pPi').value.trim(),
      coPi: document.getElementById('pCoPi').value.trim(),
      collaborators: document.getElementById('pCollaborators').value.trim(),
      milestones: collectMilestones(),
    };
    UI.loading(true, 'Saving…');
    try {
      if (ctx.isAdmin) {
        await Api.adminSaveProject(ctx.username, project);
      } else {
        await Api.saveProject(project);
      }
      UI.closeModal('projectModal');
      UI.toast('Project saved', 'success');
      await ctx.onSaved();
    } catch (e) {
      UI.showError('projectModalError', e.message);
    } finally {
      UI.loading(false);
    }
  }

  async function remove() {
    const ctx = APP.projectModalCtx;
    if (!ctx.projectId) return;
    if (!confirm('Delete this project and all of its milestones? This cannot be undone.')) return;
    UI.loading(true, 'Deleting…');
    try {
      if (ctx.isAdmin) {
        await Api.adminDeleteProject(ctx.username, ctx.projectId);
      } else {
        await Api.deleteProject(ctx.projectId);
      }
      UI.closeModal('projectModal');
      UI.toast('Project deleted', 'success');
      await ctx.onSaved();
    } catch (e) {
      UI.showError('projectModalError', e.message);
    } finally {
      UI.loading(false);
    }
  }

  function bind() {
    document.getElementById('saveProjectBtn').addEventListener('click', save);
    document.getElementById('deleteProjectBtn').addEventListener('click', remove);
  }

  return { open, bind };
})();
