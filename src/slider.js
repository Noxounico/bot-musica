const zlib = require('zlib');

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([header, body, crc]);
}

function setPixel(pixels, width, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= width) {
    return;
  }
  const offset = (y * width + x) * 4;
  pixels[offset] = r;
  pixels[offset + 1] = g;
  pixels[offset + 2] = b;
  pixels[offset + 3] = a;
}

function sliderPng(progressMs, durationMs, { width = 420, height = 28 } = {}) {
  const pixels = Buffer.alloc(width * height * 4);
  const ratio = durationMs ? Math.min(1, Math.max(0, progressMs / durationMs)) : 0;
  const padY = Math.floor(height / 2);
  const trackTop = padY - 2;
  const trackBottom = padY + 2;
  const knobX = Math.round(8 + ratio * (width - 16));
  const knobR = 6;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (y >= trackTop && y <= trackBottom && x >= 8 && x <= width - 8) {
        const filled = x <= knobX;
        setPixel(pixels, width, x, y, filled ? [167, 139, 250, 255] : [82, 82, 91, 255]);
      } else {
        setPixel(pixels, width, x, y, [0, 0, 0, 0]);
      }

      const dx = x - knobX;
      const dy = y - padY;
      if ((dx * dx) + (dy * dy) <= knobR * knobR) {
        setPixel(pixels, width, x, y, [248, 250, 252, 255]);
      }
    }
  }

  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(pixels.subarray(y * width * 4, (y + 1) * width * 4));
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { sliderPng };
