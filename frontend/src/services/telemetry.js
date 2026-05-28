import api from './api';

// Simple helper to detect environment on frontend
function getEnvironmentInfo() {
  const ua = navigator.userAgent || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const deviceType = isMobile ? 'mobile' : 'desktop';

  let osName = 'unknown';
  if (/Android/i.test(ua)) osName = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) osName = 'iOS';
  else if (/Windows/i.test(ua)) osName = 'Windows';
  else if (/Mac OS X/i.test(ua)) osName = 'macOS';

  let browserName = 'unknown';
  if (/Chrome\/\d+/i.test(ua) && !/Edge\/\d+/i.test(ua) && !/OPR\/\d+/i.test(ua)) browserName = 'Chrome';
  else if (/Safari\/\d+/i.test(ua) && !/Chrome\/\d+/i.test(ua)) browserName = 'Safari';
  else if (/Firefox\/\d+/i.test(ua)) browserName = 'Firefox';
  else if (/Edg\/\d+/i.test(ua) || /Edge\/\d+/i.test(ua)) browserName = 'Edge';

  const isInAppBrowser =
    /FBAN|FBAV|Instagram|WhatsApp|wv/.test(ua) ||
    (window.navigator.standalone === false && /iPhone|iPad|iPod/.test(ua));

  const browserVersionMatch = ua.match(/(Chrome|Firefox|Safari|Edg|Edge)\/([\d.]+)/i);
  const browserVersion = browserVersionMatch ? browserVersionMatch[2] : 'unknown';

  return {
    deviceType,
    osName,
    osVersion: 'unknown',
    browserName,
    browserVersion,
    userAgent: ua,
    isInAppBrowser,
    isHttps: window.location.protocol === 'https:',
    pageOrigin: window.location.origin,
  };
}

export async function sendEnvironmentTelemetry(sessionId, role) {
  try {
    const env = getEnvironmentInfo();
    await api.post('/telemetry/environment', {
      sessionId,
      role,
      ...env,
    });
  } catch (e) {
    // Non-blocking; ignore errors
    console.error('Failed to send environment telemetry:', e);
  }
}

export async function sendCallEventTelemetry(sessionId, role, eventType, details = {}) {
  try {
    await api.post('/telemetry/event', {
      sessionId,
      role,
      eventType,
      eventTimestamp: new Date().toISOString(),
      details,
    });
  } catch (e) {
    console.error('Failed to send call event telemetry:', e);
  }
}

