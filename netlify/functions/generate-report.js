/* generate-report.js — Netlify serverless function.
   Takes fellow project/milestone data the browser already has in memory
   (loaded from the Apps Script backend) and returns a formatted PDF.
   No Google credentials touch this function at all. */

const PDFDocument = require('pdfkit');

const COLORS = {
  primaryDark: '#0B4A52',
  primary: '#146C6C',
  text: '#1F2D2F',
  muted: '#6B7B7D',
  border: '#E2E8E8',
  headerBg: '#E4F0EF',
  stripe: '#F7FAFA',
  danger: '#D65A5A',
};

const PROJECT_TYPE_LABELS = { research: 'Research Projects', advocacy: 'Advocacy Projects', qi: 'QI Projects' };
const PROJECT_TYPE_ORDER = ['research', 'advocacy', 'qi'];

const MILESTONE_COLS = [
  { key: 'name', label: 'Milestone', width: 220 },
  { key: 'completedBy', label: 'Completed by', width: 110 },
  { key: 'targetDate', label: 'Target date', width: 90 },
  { key: 'actualDate', label: 'Actual date', width: 90 },
];

const SUMMARY_COLS = [
  { key: 'name', label: 'Fellow', width: 160 },
  { key: 'year', label: 'PGY / Year', width: 110 },
  { key: 'projects', label: 'Projects (R/A/Q)', width: 110 },
  { key: 'pct', label: 'Completion', width: 70 },
  { key: 'overdue', label: 'Overdue', width: 62 },
];

// ── LAMBDA ENTRY POINT ────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  try {
    let buffer, filename;
    if (body.mode === 'all') {
      if (!Array.isArray(body.fellows)) throw new Error('Missing "fellows" array.');
      buffer = await buildAllFellowsReport(body.fellows);
      filename = `Research_Rotation_Report_All_Fellows_${dateStamp()}.pdf`;
    } else {
      if (!body.fellow || !body.fellow.user) throw new Error('Missing "fellow" data.');
      buffer = await buildSingleFellowReport(body.fellow.user, body.fellow.projects || []);
      filename = `Research_Rotation_Report_${sanitizeFilename(body.fellow.user.firstName)}_${sanitizeFilename(body.fellow.user.lastName)}_${dateStamp()}.pdf`;
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('generate-report error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function sanitizeFilename(s) { return String(s || '').replace(/[^a-zA-Z0-9]/g, '_'); }
function dateStamp() { return new Date().toISOString().slice(0, 10); }

// ── DOCUMENT BUILDERS ─────────────────────────────────────────────────────────

function newDoc() {
  return new PDFDocument({ size: 'LETTER', margins: { top: 54, bottom: 54, left: 50, right: 50 }, bufferPages: true });
}

function buildSingleFellowReport(user, projects) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    renderFellowBody(doc, user, projects);
    finalizePageNumbers(doc);
    doc.end();
  });
}

function buildAllFellowsReport(fellows) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').fillColor(COLORS.primaryDark)
      .text('Research Rotation Tracker — All Fellows Report', { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor(COLORS.muted)
      .text(`UofT GREI Fellowship Program  ·  Generated ${formatDate(new Date())}`, { align: 'center' });
    doc.moveDown(1.2);

    drawSummaryTable(doc, fellows);

    fellows.forEach(f => {
      doc.addPage();
      renderFellowBody(doc, f.user, f.projects || []);
    });

    finalizePageNumbers(doc);
    doc.end();
  });
}

function renderFellowBody(doc, user, projects) {
  drawFellowHeader(doc, user);
  PROJECT_TYPE_ORDER.forEach(type => {
    const list = (projects || []).filter(p => p.type === type);
    if (!list.length) return;
    ensureSpace(doc, 30);
    doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.primary).text(PROJECT_TYPE_LABELS[type]);
    doc.moveDown(0.3);
    list.forEach(p => drawProjectBlock(doc, p));
  });
}

function drawFellowHeader(doc, user) {
  doc.fontSize(17).font('Helvetica-Bold').fillColor(COLORS.primaryDark)
    .text('Research Rotation Progress Report', { align: 'center' });
  doc.moveDown(0.15);
  doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.text)
    .text(`${user.firstName} ${user.lastName}`, { align: 'center' });
  doc.fontSize(9.5).font('Helvetica').fillColor(COLORS.muted)
    .text(`${user.pgyYear ? user.pgyYear + '  ·  ' : ''}UofT GREI Fellowship Program  ·  Generated ${formatDate(new Date())}`, { align: 'center' });
  doc.moveDown(1);
}

function drawProjectBlock(doc, project) {
  ensureSpace(doc, 70);
  doc.fontSize(11.5).font('Helvetica-Bold').fillColor(COLORS.primaryDark)
    .text(project.title || '(untitled project)');

  doc.fontSize(9).font('Helvetica').fillColor(COLORS.muted);
  if (project.studyDesign) doc.text(`Study design: ${project.studyDesign}`);
  const piLine = [
    project.pi ? `PI: ${project.pi}` : null,
    project.coPi ? `Co-PI: ${project.coPi}` : null,
  ].filter(Boolean).join('     ');
  if (piLine) doc.text(piLine);
  if (project.collaborators) doc.text(`Collaborators: ${project.collaborators}`);
  doc.moveDown(0.35);

  drawTable(doc, MILESTONE_COLS, (project.milestones || []).map(m => ({
    cells: [m.name, m.completedBy || '—', formatDateStr(m.targetDate), formatDateStr(m.actualDate)],
    highlightCol: (!m.actualDate && m.targetDate && new Date(m.targetDate).getTime() < Date.now()) ? 2 : -1,
  })));
  doc.moveDown(0.9);
}

function drawSummaryTable(doc, fellows) {
  const rows = fellows.map(f => {
    const milestones = (f.projects || []).flatMap(p => p.milestones || []);
    const total = milestones.length;
    const done = milestones.filter(m => !!m.actualDate).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const overdue = milestones.filter(m => !m.actualDate && m.targetDate && new Date(m.targetDate).getTime() < Date.now()).length;
    const counts = PROJECT_TYPE_ORDER.map(t => (f.projects || []).filter(p => p.type === t).length);
    return {
      cells: [`${f.user.firstName} ${f.user.lastName}`, f.user.pgyYear || '—', counts.join(' / '), pct + '%', String(overdue)],
      highlightCol: overdue > 0 ? 4 : -1,
    };
  });
  drawTable(doc, SUMMARY_COLS, rows);
  doc.moveDown(1);
}

// Generic striped table renderer with automatic page breaks and a repeated
// header row on each new page.
function drawTable(doc, cols, rows) {
  const left = doc.page.margins.left;
  const tableWidth = cols.reduce((s, c) => s + c.width, 0);
  const rowPad = 5;

  function drawHeaderRow() {
    ensureSpace(doc, 22);
    const y = doc.y;
    doc.rect(left, y, tableWidth, 20).fill(COLORS.headerBg);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.primaryDark);
    let x = left;
    cols.forEach(c => { doc.text(c.label, x + 5, y + 6, { width: c.width - 10 }); x += c.width; });
    doc.y = y + 20;
    doc.x = left;
  }

  drawHeaderRow();
  doc.font('Helvetica').fontSize(9);

  if (!rows.length) {
    doc.fillColor(COLORS.muted).text('No milestones defined yet.', left + 5, doc.y + 6);
    doc.moveDown(1);
    doc.x = left;
    return;
  }

  rows.forEach((row, i) => {
    const heights = cols.map((c, ci) => doc.heightOfString(String(row.cells[ci]), { width: c.width - 10 }));
    const rowHeight = Math.max(...heights, 12) + rowPad * 2;

    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeaderRow();
      doc.font('Helvetica').fontSize(9);
    }

    const y = doc.y;
    if (i % 2 === 1) doc.rect(left, y, tableWidth, rowHeight).fill(COLORS.stripe);

    let x = left;
    cols.forEach((c, ci) => {
      const isHighlighted = ci === row.highlightCol;
      doc.fillColor(isHighlighted ? COLORS.danger : COLORS.text);
      doc.text(String(row.cells[ci]), x + 5, y + rowPad, { width: c.width - 10 });
      x += c.width;
    });
    doc.y = y + rowHeight;
    doc.x = left;
  });

  doc.moveTo(left, doc.y).lineTo(left + tableWidth, doc.y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
  doc.x = left;
}

function ensureSpace(doc, height) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + height > bottom) doc.addPage();
}

function formatDate(d) {
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateStr(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return formatDate(d);
}

// Adds "Page X of Y  ·  CONFIDENTIAL" to the footer of every page.
function finalizePageNumbers(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - doc.page.margins.bottom + 18;
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted)
      .text(`Page ${i - range.start + 1} of ${range.count}     CONFIDENTIAL DOCUMENT`, doc.page.margins.left, bottom, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: 'center',
      });
  }
}
