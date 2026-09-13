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

function clockFromMs(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function durationMsFrom(info) {
  if (!info) {
    return 0;
  }
  const raw = info.durationMs
    || info.durationInSec
    || info.duration
    || info.video_details?.durationInSec
    || info.video_details?.duration;
  const value = Number(raw) || 0;
  if (value <= 0) {
    return 0;
  }
  return value > 10_000 ? value : value * 1000;
}

function seekJumpOptions(durationMs, progressMs = 0) {
  const duration = Number(durationMs) || 0;
  if (duration < 5000) {
    return [];
  }

  const step = duration <= 180_000 ? 10_000 : (duration <= 480_000 ? 15_000 : 30_000);
  const options = [];
  const seen = new Set();

  const push = (ms, description) => {
    const clamped = clampSeekMs(ms, duration);
    const value = String(clamped);
    if (seen.has(value) || options.length >= 25) {
      return;
    }
    seen.add(value);
    options.push({
      label: clockFromMs(clamped),
      description,
      value,
    });
  };

  push(0, 'início');
  for (let ms = step; ms < duration - 1000 && options.length < 24; ms += step) {
    push(ms, ms <= progressMs ? 'já passou' : 'saltar para aqui');
  }
  push(duration - 1000, 'perto do fim');
  return options;
}

module.exports = { parseSeekInput, clampSeekMs, durationMsFrom, seekJumpOptions, clockFromMs };
