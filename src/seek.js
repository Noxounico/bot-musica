function parseSeekInput(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return null;
  }

  const relative = text.match(/^([+-])\s*(\d+(?:\.\d+)?)(ms|s|m)?$/i);
  if (relative) {
    const sign = relative[1] === '-' ? -1 : 1;
    const amount = Number(relative[2]);
    const unit = (relative[3] || 's').toLowerCase();
    const ms = unit === 'ms' ? amount : unit === 'm' ? amount * 60_000 : amount * 1000;
    return { type: 'relative', ms: sign * ms };
  }

  const clock = text.match(/^(\d+):([0-5]?\d)$/);
  if (clock) {
    return { type: 'absolute', ms: (Number(clock[1]) * 60 + Number(clock[2])) * 1000 };
  }

  if (/^\d+(?:\.\d+)?s?$/i.test(text)) {
    return { type: 'absolute', ms: Number(text.replace(/s$/i, '')) * 1000 };
  }

  return null;
}

function clampSeekMs(progressMs, durationMs) {
  const target = Number(progressMs) || 0;
  const duration = Number(durationMs) || 0;
  if (duration > 0) {
    return Math.max(0, Math.min(target, Math.max(0, duration - 500)));
  }
  return Math.max(0, target);
}

module.exports = { parseSeekInput, clampSeekMs };
