/* render.js — turns app state into DOM. No network calls here; fellow.js and
   admin.js own fetching data and call these render functions with the result. */
'use strict';

const Render = (() => {

  function initials(first, last) {
    return ((first || '?')[0] + (last || '?')[0]).toUpperCase();
  }

  // Classifies a project by its milestones: done / overdue / soon / pending.
  function projectStatus(milestones) {
    if (!milestones.length) return 'pending';
    const total = milestones.length;
    const done = milestones.filter(m => !!m.actualDate).length;
    if (done === total) return 'done';
    const now = Date.now();
    const overdue = milestones.some(m => !m.actualDate && m.targetDate && new Date(m.targetDate).getTime() < now);
    if (overdue) return 'overdue';
    const soon = milestones.some(m => !m.actualDate && m.targetDate && new Date(m.targetDate).getTime() < now + 30 * 24 * 60 * 60 * 1000);
    if (soon) return 'soon';
    return done > 0 ? 'soon' : 'pending';
  }

  function badgeFor(status) {
    const map = { done: ['done', 'Complete'], soon: ['soon', 'Due soon'], overdue: ['overdue', 'Overdue'], pending: ['pending', 'Not started'] };
    const [cls, label] = map[status] || map.pending;
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function projectCard(project, type, opts) {
    opts = opts || {};
    const total = project.milestones.length;
    const done = project.milestones.filter(m => !!m.actualDate).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const status = projectStatus(project.milestones);
    const title = escapeHtml(project.title || '(untitled project)');

    return `<div class="project-card">
      <div class="project-card-top">
        <div>
          <h4>${title}</h4>
          <div class="project-meta">
            ${type === 'research' && project.studyDesign ? `<div>Study design: <b>${escapeHtml(project.studyDesign)}</b></div>` : ''}
            ${project.pi ? `<div>PI: <b>${escapeHtml(project.pi)}</b>${project.coPi ? ` &nbsp;·&nbsp; Co-PI: <b>${escapeHtml(project.coPi)}</b>` : ''}</div>` : ''}
          </div>
        </div>
        <div style="text-align:right;">
          ${badgeFor(status)}
          <div style="margin-top:8px;"><button class="btn btn-outline btn-sm" data-edit-project="${project.projectId}">Edit</button></div>
        </div>
      </div>
      <div class="progress-wrap">
        <div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>
        <div class="progress-pct">${pct}%</div>
      </div>
      <div class="project-meta" style="margin-top:6px;">${done} of ${total} milestones complete</div>
    </div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function computeStats(projects) {
    const allMilestones = projects.flatMap(p => p.milestones);
    const total = allMilestones.length;
    const done = allMilestones.filter(m => !!m.actualDate).length;
    const now = Date.now();
    const overdue = allMilestones.filter(m => !m.actualDate && m.targetDate && new Date(m.targetDate).getTime() < now).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { pct, activeProjects: projects.length, done, total, overdue };
  }

  function statCards(stats) {
    return `
      <div class="stat-card"><div class="label">Overall completion</div><div class="value">${stats.pct}%</div></div>
      <div class="stat-card"><div class="label">Active projects</div><div class="value">${stats.activeProjects}</div></div>
      <div class="stat-card"><div class="label">Milestones done</div><div class="value">${stats.done} / ${stats.total}</div></div>
      <div class="stat-card"><div class="label">Overdue milestones</div><div class="value ${stats.overdue > 0 ? 'warn' : ''}">${stats.overdue}</div></div>
    `;
  }

  function renderProjectLists(prefix, projects) {
    const byType = { research: [], advocacy: [], qi: [] };
    projects.forEach(p => { if (byType[p.type]) byType[p.type].push(p); });
    ['research', 'advocacy', 'qi'].forEach(type => {
      // Fellow dashboard uses e.g. "researchList" / "countResearch";
      // admin detail view uses e.g. "detailResearchList" / "detailCountResearch".
      const listId = prefix ? prefix + capitalize(type) + 'List' : type + 'List';
      const countId = prefix ? prefix + 'Count' + capitalize(type) : 'count' + capitalize(type);
      const listEl = document.getElementById(listId);
      const countEl = document.getElementById(countId);
      if (listEl) listEl.innerHTML = byType[type].map(p => projectCard(p, type)).join('') || '<p class="empty-state">No projects yet.</p>';
      if (countEl) countEl.textContent = byType[type].length;
    });
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function milestoneRows(type, milestones, completedByOptions) {
    const template = APP.milestoneTemplates[type];
    const byName = {};
    (milestones || []).forEach(m => { byName[m.name] = m; });
    return template.map(name => {
      const m = byName[name] || {};
      const options = completedByOptions.map(o =>
        `<option value="${o}" ${m.completedBy === o ? 'selected' : ''}>${o}</option>`
      ).join('');
      return `<tr data-name="${escapeHtml(name)}">
        <td>${escapeHtml(name)}</td>
        <td><select><option value="">—</option>${options}</select></td>
        <td><input type="date" class="m-target" value="${m.targetDate ? toDateInputValue(m.targetDate) : ''}"></td>
        <td><input type="date" class="m-actual" value="${m.actualDate ? toDateInputValue(m.actualDate) : ''}"></td>
      </tr>`;
    }).join('');
  }

  function toDateInputValue(v) {
    // Accepts an ISO string or date-only string and returns YYYY-MM-DD.
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v).slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  function renderFellowTable(users) {
    let rows = `<tr><th>Fellow</th><th>Username</th><th>PGY / Year</th><th>Projects (R/A/Q)</th><th>Completion</th><th>Overdue</th><th></th></tr>`;
    users.forEach(f => {
      rows += `<tr>
        <td><div class="fellow-name-cell"><div class="avatar" style="width:26px;height:26px;font-size:10.5px;">${initials(f.firstName, f.lastName)}</div>${escapeHtml(f.firstName + ' ' + f.lastName)}</div></td>
        <td>${escapeHtml(f.username)}</td>
        <td>${escapeHtml(f.pgyYear || '—')}</td>
        <td>${f.counts.research} / ${f.counts.advocacy} / ${f.counts.qi}</td>
        <td><div class="row-progress"><div class="progress-bar"><div class="fill" style="width:${f.pctComplete}%"></div></div><span style="font-size:12px;font-weight:700;color:var(--primary-dark);">${f.pctComplete}%</span></div></td>
        <td>${f.overdueCount > 0 ? `<span class="badge overdue">${f.overdueCount}</span>` : `<span class="badge done">0</span>`}</td>
        <td>
          <button class="icon-btn" data-view-fellow="${f.username}">View</button>
          <button class="icon-btn" data-edit-fellow="${f.username}">✎ Edit</button>
          <button class="icon-btn" data-reset-fellow="${f.username}">🔑 Reset</button>
          <button class="icon-btn" data-pdf-fellow="${f.username}">⬇ PDF</button>
        </td>
      </tr>`;
    });
    document.getElementById('adminFellowTable').innerHTML = rows;
  }

  function renderAdminStats(users) {
    const total = users.length;
    const avgPct = total ? Math.round(users.reduce((s, u) => s + u.pctComplete, 0) / total) : 0;
    const totalProjects = users.reduce((s, u) => s + u.counts.research + u.counts.advocacy + u.counts.qi, 0);
    const overdue = users.reduce((s, u) => s + u.overdueCount, 0);
    document.getElementById('adminStats').innerHTML = `
      <div class="stat-card"><div class="label">Total fellows</div><div class="value">${total}</div></div>
      <div class="stat-card"><div class="label">Avg. completion</div><div class="value">${avgPct}%</div></div>
      <div class="stat-card"><div class="label">Total projects</div><div class="value">${totalProjects}</div></div>
      <div class="stat-card"><div class="label">Overdue milestones</div><div class="value ${overdue > 0 ? 'warn' : ''}">${overdue}</div></div>
    `;
  }

  function renderAdminTable(admins) {
    let rows = `<tr><th>Name</th><th>Username</th><th>Email</th><th>Added</th><th></th></tr>`;
    admins.forEach(a => {
      rows += `<tr>
        <td><div class="fellow-name-cell"><div class="avatar" style="width:26px;height:26px;font-size:10.5px;">${initials(a.firstName, a.lastName)}</div>${escapeHtml(a.firstName + ' ' + a.lastName)}</div></td>
        <td>${escapeHtml(a.username)}</td>
        <td>${escapeHtml(a.email)}</td>
        <td>${a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—'}</td>
        <td>
          <button class="icon-btn" data-edit-fellow="${a.username}">✎ Edit</button>
          <button class="icon-btn" data-reset-fellow="${a.username}">🔑 Reset</button>
        </td>
      </tr>`;
    });
    document.getElementById('adminAdminTable').innerHTML = rows;
  }

  function renderReportsTable(users) {
    let rows = `<tr><th>Fellow</th><th>PGY / Year</th><th>Completion</th><th></th></tr>`;
    users.forEach(f => {
      rows += `<tr>
        <td>${escapeHtml(f.firstName + ' ' + f.lastName)}</td>
        <td>${escapeHtml(f.pgyYear || '—')}</td>
        <td>${f.pctComplete}%</td>
        <td><button class="icon-btn" data-pdf-fellow="${f.username}">⬇ PDF</button></td>
      </tr>`;
    });
    document.getElementById('reportsTable').innerHTML = rows;
  }

  return {
    initials, projectStatus, badgeFor, projectCard, escapeHtml, computeStats, statCards,
    renderProjectLists, milestoneRows, toDateInputValue, renderFellowTable, renderAdminStats,
    renderAdminTable, renderReportsTable,
  };
})();
