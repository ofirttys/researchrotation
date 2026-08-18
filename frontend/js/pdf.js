/* pdf.js — sends already-loaded fellow data to the Netlify PDF function and
   triggers a browser download of the result. No Google credentials involved
   here; the function just turns JSON into a PDF. */
'use strict';

const Pdf = (() => {

  async function requestPdf(payload, filename) {
    const url = window.APP_CONFIG.PDF_FUNCTION_URL;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      let msg = 'Could not generate the PDF (HTTP ' + resp.status + ')';
      try { const err = await resp.json(); if (err.error) msg = err.error; } catch (e) {}
      throw new Error(msg);
    }
    const blob = await resp.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }

  async function downloadForFellow(user, projects) {
    const filename = `Research_Rotation_Report_${user.firstName}_${user.lastName}_${todayStamp()}.pdf`;
    await requestPdf({ mode: 'single', fellow: { user, projects } }, filename);
  }

  async function downloadForAll(fellows) {
    const filename = `Research_Rotation_Report_All_Fellows_${todayStamp()}.pdf`;
    await requestPdf({ mode: 'all', fellows }, filename);
  }

  function todayStamp() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  return { downloadForFellow, downloadForAll };
})();
