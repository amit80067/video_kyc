/**
 * Join link for user KYC — must match DLT-approved URL shape when using HiTech in India.
 *
 * Default: {FRONTEND_URL}/join/{uuid}
 * Optional JOIN_LINK_DLT_QUERY_PAIR=true: {FRONTEND_URL}/join/?{first16hex}{last16hex}
 *   (matches DLT templates like .../join/?{#var#}{#var#} with two concatenated vars)
 */

function getFrontendBase() {
  return (process.env.FRONTEND_URL || 'https://kyc.virtualinvestigation.xyz').replace(/\/$/, '');
}

function buildJoinLink(sessionId) {
  const base = getFrontendBase();
  const id = String(sessionId || '').trim();
  if (!id) return `${base}/join/`;

  if (process.env.JOIN_LINK_DLT_QUERY_PAIR === 'true') {
    const hex = id.replace(/-/g, '').toLowerCase();
    if (hex.length === 32 && /^[0-9a-f]{32}$/.test(hex)) {
      return `${base}/join/?${hex.slice(0, 16)}${hex.slice(16)}`;
    }
  }

  return `${base}/join/${id}`;
}

module.exports = { buildJoinLink, getFrontendBase };
