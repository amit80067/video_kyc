/**
 * Indian mobile validation for KYC + HiTech SMS (10 digits, no country prefix in API).
 * Accepts: 9876543210, +919876543210, 919876543210, 09876543210 (leading 0 stripped).
 */

function stripNoise(s) {
  return String(s || '').replace(/[\s\-\(\)\.]/g, '').trim();
}

/**
 * @returns {{ ok: true, e164: string, digits10: string } | { ok: false, error: string }}
 */
function validateIndianMobile(phone) {
  const raw = stripNoise(phone);
  if (!raw) {
    return { ok: false, error: 'Mobile number is required' };
  }

  let d = raw;
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('91') && d.length === 12) d = d.slice(2);
  if (d.startsWith('0') && d.length === 11) d = d.slice(1);

  if (!/^[6-9]\d{9}$/.test(d)) {
    return {
      ok: false,
      error: 'Invalid Indian mobile. Enter 10 digits starting with 6–9 (with or without +91).',
    };
  }

  return { ok: true, e164: `+91${d}`, digits10: d };
}

module.exports = { validateIndianMobile, stripNoise };
