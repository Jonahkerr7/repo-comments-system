const { createCanvas } = require('canvas');
const fs = require('fs');

[16, 32, 48, 128].forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background circle
  ctx.fillStyle = '#7B61FF';
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fill();

  // Comment bubble
  const scale = size / 48;
  ctx.fillStyle = 'white';
  ctx.beginPath();

  // Bubble body
  const x = size/2 - (8 * scale);
  const y = size/2 - (5 * scale);
  const w = 16 * scale;
  const h = 10 * scale;
  const r = 2 * scale;

  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + (w/2) + (2*scale), y + h);
  ctx.lineTo(x + (w/2), y + h + (3*scale));
  ctx.lineTo(x + (w/2) - (2*scale), y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`icons/icon${size}.png`, buffer);
  console.log(`Generated icon${size}.png`);
});

console.log('All icons generated successfully!');
