// ============================================================================
// Research Rotation Tracker — Backend (Google Apps Script)
// Deploy as: Web App > Execute as: Me > Who has access: Anyone
//
// Storage: a single Google Sheet with 4 tabs, auto-created on first run:
//   Users      - fellow + admin accounts (login, name, hashed password)
//   Projects   - one row per research/advocacy/QI project
//   Milestones - one row per milestone within a project
//   Sessions   - active login tokens (sliding 14-day expiry)
//
// All requests go through doPost with a JSON body: { action: '...', token, ...}
// (login is the only action that doesn't require a token).
// ============================================================================

const EMAIL_DOMAIN = 'sinaihealth.ca';
const SESSION_DAYS = 14;

const SHEET_NAMES = {
  USERS: 'Users',
  PROJECTS: 'Projects',
  MILESTONES: 'Milestones',
  SESSIONS: 'Sessions',
};

const SHEET_HEADERS = {
  Users: ['username', 'firstName', 'lastName', 'email', 'role', 'pgyYear', 'passwordHash', 'passwordSalt', 'createdAt'],
  Projects: ['projectId', 'username', 'type', 'title', 'studyDesign', 'pi', 'coPi', 'collaborators', 'createdAt', 'updatedAt'],
  Milestones: ['projectId', 'name', 'completedBy', 'targetDate', 'actualDate'],
  Sessions: ['token', 'username', 'role', 'createdAt', 'expiresAt'],
};

// Fixed milestone lists per project type (from the original Excel tracker).
const MILESTONE_TEMPLATES = {
  research: ['Conceptualization', 'Proposal and protocol', 'REB submission', 'REB approval', 'Optional: Grant Application', 'Data collection/experiment execution', 'Data analysis', 'Abstract submission', 'Conference presentation', 'Manuscript preparation', 'Manuscript submission for publication', 'Publication', 'Research Rounds Presentation'],
  advocacy: ['Identify opportunity', 'Propose and approve project', 'Collaborate and plan', 'Implement', 'Present Rounds', 'Optional: Abstract submission', 'Optional: Presentation', 'Optional: Manuscript preparation'],
  qi: ['Identify gap', 'Propose and approve project', 'Collaborate', 'Plan', 'Do', 'Study', 'Act', 'Present Rounds', 'Optional: Abstract submission', 'Optional: Presentation', 'Optional: Manuscript preparation'],
};

const COMPLETED_BY_OPTIONS = ['Fellow', 'PI/co-PI', 'Collaborator1', 'Collaborator2', 'Collaborator3', 'Collaborator4'];

// ── ROUTING ──────────────────────────────────────────────────────────────────

function doGet(e) {
  return jsonResponse({ status: 'Research Rotation Tracker backend is running. Use POST.' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: 'Invalid request body.' });
  }

  const action = body.action;
  try {
    switch (action) {
      case 'login':               return handleLogin(body);
      case 'logout':              return handleLogout(body);
      case 'getMyData':           return withSession(body, ctx => getUserData(ctx.user.username));
      case 'saveProject':         return withSession(body, ctx => saveProject(ctx.user, body, /*asAdmin*/false));
      case 'deleteProject':       return withSession(body, ctx => deleteProject(ctx.user, body, /*asAdmin*/false));
      case 'changePassword':      return withSession(body, ctx => changePassword(ctx.user, body));

      case 'adminListUsers':      return withSession(body, ctx => requireAdmin(ctx) || adminListUsers(body));
      case 'adminGetUserData':    return withSession(body, ctx => requireAdmin(ctx) || getUserData(body.username));
      case 'adminAddUser':        return withSession(body, ctx => requireAdmin(ctx) || adminAddUser(body));
      case 'adminUpdateUser':     return withSession(body, ctx => requireAdmin(ctx) || adminUpdateUser(body));
      case 'adminResetPassword':  return withSession(body, ctx => requireAdmin(ctx) || adminResetPassword(body));
      case 'adminSaveProject':    return withSession(body, ctx => requireAdmin(ctx) || saveProject({ username: body.username }, body, true));
      case 'adminDeleteProject':  return withSession(body, ctx => requireAdmin(ctx) || deleteProject({ username: body.username }, body, true));

      default:
        return jsonResponse({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    Logger.log(err.stack);
    return jsonResponse({ error: err.message });
  }
}

// ── SESSION HANDLING ─────────────────────────────────────────────────────────

// Wraps an action that requires a valid session. Looks up the token, checks
// expiry, extends it (sliding window), and passes { user, session } to fn.
function withSession(body, fn) {
  const token = body.token;
  if (!token) return jsonResponse({ error: 'Not logged in.' });

  const sessions = getSheet(SHEET_NAMES.SESSIONS);
  const rows = readRows(sessions);
  const idx = rows.findIndex(r => r.token === token);
  if (idx === -1) return jsonResponse({ error: 'Session not found. Please log in again.' });

  const session = rows[idx];
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    deleteRowAt(sessions, idx + 2); // +2: header row + 1-based index
    return jsonResponse({ error: 'Your session has expired. Please log in again.' });
  }

  const user = getUserByUsername(session.username);
  if (!user) return jsonResponse({ error: 'Account no longer exists. Please log in again.' });

  // Slide the expiry forward.
  const newExpiry = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  updateRowAt(sessions, idx + 2, { expiresAt: newExpiry.toISOString() });

  const result = fn({ user, session });
  return result || jsonResponse({ error: 'Unexpected server error.' });
}

// Used inside a withSession callback: `requireAdmin(ctx) || doTheThing()`
// Returns a jsonResponse (truthy) to short-circuit if not an admin, otherwise
// returns null/undefined so the `||` falls through to the real handler.
function requireAdmin(ctx) {
  if (ctx.user.role !== 'admin') {
    return jsonResponse({ error: 'Admin access required.' });
  }
  return null;
}

function handleLogin(body) {
  const username = normalizeUsername(body.username || '');
  const password = body.password || '';
  const user = getUserByUsername(username);
  if (!user) return jsonResponse({ error: 'Incorrect username or password.' });

  const computed = hashPassword(password, user.passwordSalt);
  if (computed !== user.passwordHash) {
    return jsonResponse({ error: 'Incorrect username or password.' });
  }

  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  appendRow(getSheet(SHEET_NAMES.SESSIONS), {
    token, username: user.username, role: user.role,
    createdAt: now.toISOString(), expiresAt: expires.toISOString(),
  });

  return jsonResponse({
    success: true,
    token,
    user: publicUser(user),
  });
}

function handleLogout(body) {
  const token = body.token;
  if (token) {
    const sessions = getSheet(SHEET_NAMES.SESSIONS);
    const rows = readRows(sessions);
    const idx = rows.findIndex(r => r.token === token);
    if (idx !== -1) deleteRowAt(sessions, idx + 2);
  }
  return jsonResponse({ success: true });
}

// ── FELLOW DATA (used by both self-service and admin views) ──────────────────

function getUserData(username) {
  const user = getUserByUsername(username);
  if (!user) return jsonResponse({ error: 'User not found.' });

  const allProjects = readRows(getSheet(SHEET_NAMES.PROJECTS)).filter(p => p.username === username);
  const allMilestones = readRows(getSheet(SHEET_NAMES.MILESTONES));

  const projects = allProjects.map(p => ({
    projectId: p.projectId,
    type: p.type,
    title: p.title,
    studyDesign: p.studyDesign,
    pi: p.pi,
    coPi: p.coPi,
    collaborators: p.collaborators,
    milestones: allMilestones
      .filter(m => m.projectId === p.projectId)
      .map(m => ({ name: m.name, completedBy: m.completedBy, targetDate: m.targetDate, actualDate: m.actualDate })),
  }));

  return jsonResponse({
    success: true,
    user: publicUser(user),
    projects,
    milestoneTemplates: MILESTONE_TEMPLATES,
    completedByOptions: COMPLETED_BY_OPTIONS,
  });
}

// ── PROJECTS ──────────────────────────────────────────────────────────────────

// body.project = { projectId?, type, title, studyDesign, pi, coPi, collaborators,
//                  milestones: [{ name, completedBy, targetDate, actualDate }] }
function saveProject(actingUser, body, asAdmin) {
  const project = body.project;
  if (!project || !project.type || !MILESTONE_TEMPLATES[project.type]) {
    return jsonResponse({ error: 'Invalid project type.' });
  }
  const owner = asAdmin ? body.username : actingUser.username;
  if (!owner) return jsonResponse({ error: 'No target username specified.' });

  const projectsSheet = getSheet(SHEET_NAMES.PROJECTS);
  const rows = readRows(projectsSheet);
  const now = new Date().toISOString();

  let projectId = project.projectId;
  let rowIndex = projectId ? rows.findIndex(r => r.projectId === projectId) : -1;

  const record = {
    projectId: projectId || randomId(),
    username: owner,
    type: project.type,
    title: project.title || '',
    studyDesign: project.studyDesign || '',
    pi: project.pi || '',
    coPi: project.coPi || '',
    collaborators: project.collaborators || '',
    updatedAt: now,
  };

  if (rowIndex === -1) {
    record.createdAt = now;
    appendRow(projectsSheet, record);
  } else {
    if (rows[rowIndex].username !== owner) {
      return jsonResponse({ error: 'You do not own this project.' });
    }
    updateRowAt(projectsSheet, rowIndex + 2, record);
  }
  projectId = record.projectId;

  // Replace all milestone rows for this project with the submitted list.
  const milestonesSheet = getSheet(SHEET_NAMES.MILESTONES);
  const mRows = readRows(milestonesSheet);
  // Delete existing rows for this project (bottom-up to keep indices valid).
  for (let i = mRows.length - 1; i >= 0; i--) {
    if (mRows[i].projectId === projectId) deleteRowAt(milestonesSheet, i + 2);
  }
  const template = MILESTONE_TEMPLATES[project.type];
  const submitted = {};
  (project.milestones || []).forEach(m => { submitted[m.name] = m; });
  template.forEach(name => {
    const m = submitted[name] || {};
    appendRow(milestonesSheet, {
      projectId,
      name,
      completedBy: m.completedBy || '',
      targetDate: m.targetDate || '',
      actualDate: m.actualDate || '',
    });
  });

  return jsonResponse({ success: true, projectId });
}

function deleteProject(actingUser, body, asAdmin) {
  const projectId = body.projectId;
  if (!projectId) return jsonResponse({ error: 'No project specified.' });

  const projectsSheet = getSheet(SHEET_NAMES.PROJECTS);
  const rows = readRows(projectsSheet);
  const idx = rows.findIndex(r => r.projectId === projectId);
  if (idx === -1) return jsonResponse({ error: 'Project not found.' });

  const owner = rows[idx].username;
  if (!asAdmin && owner !== actingUser.username) {
    return jsonResponse({ error: 'You do not own this project.' });
  }

  // Enforce at least one project of each type per fellow.
  const sameOwnerSameType = rows.filter(r => r.username === owner && r.type === rows[idx].type);
  if (sameOwnerSameType.length <= 1) {
    return jsonResponse({ error: 'Each fellow needs at least one ' + rows[idx].type + ' project — add a replacement before deleting this one.' });
  }

  deleteRowAt(projectsSheet, idx + 2);

  const milestonesSheet = getSheet(SHEET_NAMES.MILESTONES);
  const mRows = readRows(milestonesSheet);
  for (let i = mRows.length - 1; i >= 0; i--) {
    if (mRows[i].projectId === projectId) deleteRowAt(milestonesSheet, i + 2);
  }

  return jsonResponse({ success: true });
}

// ── PASSWORD MANAGEMENT ───────────────────────────────────────────────────────

function changePassword(user, body) {
  const oldPassword = body.oldPassword || '';
  const newPassword = body.newPassword || '';
  if (newPassword.length < 8) {
    return jsonResponse({ error: 'New password must be at least 8 characters.' });
  }
  const computed = hashPassword(oldPassword, user.passwordSalt);
  if (computed !== user.passwordHash) {
    return jsonResponse({ error: 'Current password is incorrect.' });
  }
  const salt = randomSalt();
  const hash = hashPassword(newPassword, salt);
  updateUserByUsername(user.username, { passwordHash: hash, passwordSalt: salt });
  return jsonResponse({ success: true });
}

function adminResetPassword(body) {
  const username = normalizeUsername(body.username || '');
  const user = getUserByUsername(username);
  if (!user) return jsonResponse({ error: 'User not found.' });

  const tempPassword = randomPassword();
  const salt = randomSalt();
  const hash = hashPassword(tempPassword, salt);
  updateUserByUsername(username, { passwordHash: hash, passwordSalt: salt });

  return jsonResponse({ success: true, username, tempPassword });
}

// ── ADMIN: USER MANAGEMENT ────────────────────────────────────────────────────

function adminListUsers(body) {
  const roleFilter = body.role; // 'fellow' | 'admin' | undefined (all)
  const users = readRows(getSheet(SHEET_NAMES.USERS))
    .filter(u => !roleFilter || u.role === roleFilter);

  const projects = readRows(getSheet(SHEET_NAMES.PROJECTS));
  const milestones = readRows(getSheet(SHEET_NAMES.MILESTONES));

  const list = users.map(u => {
    const myProjects = projects.filter(p => p.username === u.username);
    const myProjectIds = myProjects.map(p => p.projectId);
    const myMilestones = milestones.filter(m => myProjectIds.indexOf(m.projectId) !== -1);
    const total = myMilestones.length;
    const done = myMilestones.filter(m => !!m.actualDate).length;
    const overdue = myMilestones.filter(m => {
      if (m.actualDate || !m.targetDate) return false;
      return new Date(m.targetDate).getTime() < Date.now();
    }).length;

    return {
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      pgyYear: u.pgyYear,
      createdAt: u.createdAt,
      counts: {
        research: myProjects.filter(p => p.type === 'research').length,
        advocacy: myProjects.filter(p => p.type === 'advocacy').length,
        qi: myProjects.filter(p => p.type === 'qi').length,
      },
      milestonesTotal: total,
      milestonesDone: done,
      pctComplete: total ? Math.round((done / total) * 100) : 0,
      overdueCount: overdue,
    };
  });

  return jsonResponse({ success: true, users: list });
}

// body: { firstName, lastName, role: 'fellow'|'admin', pgyYear? }
function adminAddUser(body) {
  const firstName = (body.firstName || '').trim();
  const lastName = (body.lastName || '').trim();
  const role = body.role === 'admin' ? 'admin' : 'fellow';
  if (!firstName || !lastName) return jsonResponse({ error: 'First and last name are required.' });

  const username = generateUniqueUsername(firstName, lastName);
  const email = username + '@' + EMAIL_DOMAIN;
  const tempPassword = randomPassword();
  const salt = randomSalt();
  const hash = hashPassword(tempPassword, salt);

  appendRow(getSheet(SHEET_NAMES.USERS), {
    username, firstName, lastName, email, role,
    pgyYear: role === 'fellow' ? (body.pgyYear || '') : '',
    passwordHash: hash, passwordSalt: salt,
    createdAt: new Date().toISOString(),
  });

  if (role === 'fellow') {
    // Seed the required minimum: 1 research, 1 advocacy, 1 QI project (empty).
    ['research', 'advocacy', 'qi'].forEach(type => {
      saveProject({ username }, { username, project: { type, title: '', studyDesign: '', pi: '', coPi: '', collaborators: '', milestones: [] } }, true);
    });
  }

  return jsonResponse({ success: true, username, email, tempPassword, role });
}

// body: { username (current), firstName, lastName, pgyYear? }
// Renames username/email if the name changed, cascading to Projects/Sessions.
function adminUpdateUser(body) {
  const oldUsername = normalizeUsername(body.username || '');
  const user = getUserByUsername(oldUsername);
  if (!user) return jsonResponse({ error: 'User not found.' });

  const firstName = (body.firstName || user.firstName).trim();
  const lastName = (body.lastName || user.lastName).trim();
  const pgyYear = body.pgyYear !== undefined ? body.pgyYear : user.pgyYear;

  const nameChanged = firstName !== user.firstName || lastName !== user.lastName;
  let newUsername = oldUsername;
  let newEmail = user.email;

  if (nameChanged) {
    newUsername = generateUniqueUsername(firstName, lastName, oldUsername);
    newEmail = newUsername + '@' + EMAIL_DOMAIN;
  }

  updateUserByUsername(oldUsername, {
    username: newUsername, firstName, lastName, email: newEmail, pgyYear,
  });

  if (nameChanged && newUsername !== oldUsername) {
    // Cascade the rename to Projects and any active Sessions.
    renameUsernameEverywhere(oldUsername, newUsername);
  }

  return jsonResponse({ success: true, username: newUsername, email: newEmail, firstName, lastName, pgyYear });
}

function renameUsernameEverywhere(oldUsername, newUsername) {
  const projectsSheet = getSheet(SHEET_NAMES.PROJECTS);
  const projectRows = readRows(projectsSheet);
  projectRows.forEach((r, i) => {
    if (r.username === oldUsername) updateRowAt(projectsSheet, i + 2, { username: newUsername });
  });

  const sessionsSheet = getSheet(SHEET_NAMES.SESSIONS);
  const sessionRows = readRows(sessionsSheet);
  sessionRows.forEach((r, i) => {
    if (r.username === oldUsername) updateRowAt(sessionsSheet, i + 2, { username: newUsername });
  });
}

// ── USER HELPERS ───────────────────────────────────────────────────────────────

function publicUser(u) {
  return {
    username: u.username, firstName: u.firstName, lastName: u.lastName,
    email: u.email, role: u.role, pgyYear: u.pgyYear,
  };
}

function normalizeUsername(u) {
  return String(u).trim().toLowerCase();
}

function getUserByUsername(username) {
  username = normalizeUsername(username);
  const rows = readRows(getSheet(SHEET_NAMES.USERS));
  return rows.find(r => r.username === username) || null;
}

function updateUserByUsername(username, patch) {
  username = normalizeUsername(username);
  const sheet = getSheet(SHEET_NAMES.USERS);
  const rows = readRows(sheet);
  const idx = rows.findIndex(r => r.username === username);
  if (idx === -1) throw new Error('User not found: ' + username);
  updateRowAt(sheet, idx + 2, patch);
}

// Builds firstname.lastname, appending a number on collision (john.doe2, ...).
function generateUniqueUsername(firstName, lastName, allowUsername) {
  const base = sanitizeForUsername(firstName) + '.' + sanitizeForUsername(lastName);
  const existing = readRows(getSheet(SHEET_NAMES.USERS)).map(r => r.username);
  if (base === allowUsername) return base;
  if (existing.indexOf(base) === -1) return base;
  let n = 2;
  while (existing.indexOf(base + n) !== -1) n++;
  return base + n;
}

function sanitizeForUsername(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── CRYPTO / RANDOM ────────────────────────────────────────────────────────────

function hashPassword(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password);
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function randomSalt() {
  return Utilities.getUuid() + Utilities.getUuid();
}

function randomToken() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function randomId() {
  return Utilities.getUuid();
}

// Generates a readable temporary password (~70 bits of entropy) from UUID
// randomness, using a charset that avoids visually-ambiguous characters.
function randomPassword() {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); // 60 hex chars
  let out = '';
  for (let i = 0; i < 12; i++) {
    const byte = parseInt(hex.substr(i * 2, 2), 16);
    out += charset[byte % charset.length];
  }
  return out;
}

// ── SHEET / SPREADSHEET HELPERS ────────────────────────────────────────────────

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const headers = SHEET_HEADERS[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0B4A52').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Reads all data rows as an array of objects keyed by the header row.
function readRows(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const obj = {};
    headers.forEach((h, c) => { obj[h] = values[i][c]; });
    rows.push(obj);
  }
  return rows;
}

// Appends a row, mapping the object's keys onto the sheet's header order.
function appendRow(sheet, obj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  sheet.appendRow(row);
}

// Updates only the given keys on a specific 1-based row number.
function updateRowAt(sheet, rowNumber, patch) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  headers.forEach((h, c) => {
    if (Object.prototype.hasOwnProperty.call(patch, h)) {
      sheet.getRange(rowNumber, c + 1).setValue(patch[h]);
    }
  });
}

function deleteRowAt(sheet, rowNumber) {
  sheet.deleteRow(rowNumber);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ── ONE-TIME SETUP ─────────────────────────────────────────────────────────────
// Run this once manually from the Apps Script editor (select bootstrapAdmin in
// the function dropdown, click Run) to create the sheet tabs and the first
// admin account. Change the password immediately after logging in.
function bootstrapAdmin() {
  getSheet(SHEET_NAMES.USERS);
  getSheet(SHEET_NAMES.PROJECTS);
  getSheet(SHEET_NAMES.MILESTONES);
  getSheet(SHEET_NAMES.SESSIONS);

  if (getUserByUsername('jennia.michaeli')) {
    Logger.log('Admin already exists — skipping.');
    return;
  }

  const tempPassword = randomPassword();
  const salt = randomSalt();
  const hash = hashPassword(tempPassword, salt);
  appendRow(getSheet(SHEET_NAMES.USERS), {
    username: 'jennia.michaeli', firstName: 'Jennia', lastName: 'Michaeli',
    email: 'jennia.michaeli@' + EMAIL_DOMAIN, role: 'admin', pgyYear: '',
    passwordHash: hash, passwordSalt: salt, createdAt: new Date().toISOString(),
  });

  Logger.log('Admin account created.');
  Logger.log('Username: jennia.michaeli');
  Logger.log('Temporary password: ' + tempPassword);
}
