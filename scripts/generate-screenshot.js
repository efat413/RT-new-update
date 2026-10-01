import fs from 'fs';
import zlib from 'zlib';

function createPng(width, height, drawFn) {
  // RGBA buffer: height rows, each width * 4 bytes + 1 filter byte
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a !== undefined ? a : 255;
    }
  }

  const deflated = zlib.deflateSync(rawData, { level: 9 });

  function crc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  // Precompute CRC table
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[i] = c;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const chunkDataForCrc = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(chunkDataForCrc), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // PNG Header
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA (6)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate an elegant 1200x900 theme preview screenshot
const width = 1200;
const height = 900;

const pngBuffer = createPng(width, height, (x, y, w, h) => {
  // Background: Deep luxurious obsidian slate with subtle warm vignette
  const dx = (x - w / 2) / (w / 2);
  const dy = (y - h / 2) / (h / 2);
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Theme header bar (y: 0 to 70)
  if (y < 70) {
    // Dark header bar
    if (y === 69) return [38, 38, 38, 255]; // hairline divider
    return [15, 15, 17, 255];
  }

  // Top navigation mock dots & elements
  if (y >= 26 && y <= 44) {
    // Brand mark block (x: 60 to 180)
    if (x >= 60 && x <= 180) return [245, 245, 245, 255];
    // Nav links (x: 500 to 800)
    if ((x >= 520 && x <= 580) || (x >= 610 && x <= 670) || (x >= 700 && x <= 760)) {
      return [160, 160, 160, 255];
    }
    // Action button (x: 1040 to 1140)
    if (x >= 1040 && x <= 1140) return [217, 119, 6, 255]; // Warm amber accent
  }

  // Main Canvas
  // Hero section container (y: 100 to 420)
  if (y >= 110 && y <= 420 && x >= 60 && x <= 1140) {
    // Hero layout
    // Kicker text line (y: 130 to 142, x: 80 to 240)
    if (y >= 130 && y <= 140 && x >= 80 && x <= 260) return [217, 119, 6, 255];

    // Giant Headline lines
    if (y >= 165 && y <= 195 && x >= 80 && x <= 720) return [250, 250, 250, 255];
    if (y >= 210 && y <= 240 && x >= 80 && x <= 620) return [240, 240, 240, 255];

    // Subtitle paragraph
    if (y >= 265 && y <= 275 && x >= 80 && x <= 600) return [140, 140, 145, 255];
    if (y >= 285 && y <= 295 && x >= 80 && x <= 500) return [140, 140, 145, 255];

    // Primary CTA Button
    if (y >= 330 && y <= 370 && x >= 80 && x <= 220) return [217, 119, 6, 255];
    // Secondary CTA Button
    if (y >= 330 && y <= 370 && x >= 240 && x <= 380) {
      if (y === 330 || y === 369 || x === 240 || x === 379) return [100, 100, 105, 255];
      return [24, 24, 27, 255];
    }

    // Hero right visual card (x: 760 to 1120, y: 130 to 390)
    if (x >= 760 && x <= 1120 && y >= 130 && y <= 390) {
      const rx = (x - 760) / 360;
      const ry = (y - 130) / 260;
      // Elegant architectural gradient block
      const r = Math.floor(30 + rx * 25);
      const g = Math.floor(35 + ry * 30);
      const b = Math.floor(45 + (rx + ry) * 35);
      // Border around card
      if (x === 760 || x === 1120 || y === 130 || y === 390) return [60, 60, 70, 255];
      return [r, g, b, 255];
    }
  }

  // Bento Grid Section (y: 450 to 760, x: 60 to 1140)
  if (y >= 460 && y <= 760 && x >= 60 && x <= 1140) {
    // Card 1 (x: 60 to 400)
    if (x >= 60 && x <= 400) {
      if (x === 60 || x === 400 || y === 460 || y === 760) return [45, 45, 50, 255];
      // Card content
      if (y >= 490 && y <= 620 && x >= 80 && x <= 380) return [30, 32, 38, 255]; // Card image
      if (y >= 650 && y <= 668 && x >= 80 && x <= 320) return [240, 240, 245, 255]; // Title
      if (y >= 685 && y <= 695 && x >= 80 && x <= 360) return [120, 120, 125, 255]; // Excerpt
      return [20, 20, 23, 255];
    }

    // Card 2 (x: 430 to 770)
    if (x >= 430 && x <= 770) {
      if (x === 430 || x === 770 || y === 460 || y === 760) return [45, 45, 50, 255];
      if (y >= 490 && y <= 620 && x >= 450 && x <= 750) return [28, 35, 42, 255];
      if (y >= 650 && y <= 668 && x >= 450 && x <= 690) return [240, 240, 245, 255];
      if (y >= 685 && y <= 695 && x >= 450 && x <= 730) return [120, 120, 125, 255];
      return [20, 20, 23, 255];
    }

    // Card 3 (x: 800 to 1140)
    if (x >= 800 && x <= 1140) {
      if (x === 800 || x === 1140 || y === 460 || y === 760) return [45, 45, 50, 255];
      if (y >= 490 && y <= 620 && x >= 820 && x <= 1120) return [36, 32, 40, 255];
      if (y >= 650 && y <= 668 && x >= 820 && x <= 1060) return [240, 240, 245, 255];
      if (y >= 685 && y <= 695 && x >= 820 && x <= 1100) return [120, 120, 125, 255];
      return [20, 20, 23, 255];
    }
  }

  // Footer bar (y: 820 to 900)
  if (y >= 830) {
    if (y === 830) return [38, 38, 38, 255];
    if (y >= 855 && y <= 867 && x >= 60 && x <= 220) return [130, 130, 135, 255];
    if (y >= 855 && y <= 867 && x >= 920 && x <= 1140) return [100, 100, 105, 255];
    return [15, 15, 17, 255];
  }

  // Background field
  const baseShade = Math.max(12, Math.floor(18 - dist * 6));
  return [baseShade, baseShade + 1, baseShade + 3, 255];
});

fs.writeFileSync('/screenshot.png', pngBuffer);
fs.mkdirSync('/public', { recursive: true });
fs.writeFileSync('/public/screenshot.png', pngBuffer);
fs.mkdirSync('/assets/images', { recursive: true });
fs.writeFileSync('/assets/images/screenshot.png', pngBuffer);

console.log('Successfully generated screenshot.png at /screenshot.png and /public/screenshot.png');
