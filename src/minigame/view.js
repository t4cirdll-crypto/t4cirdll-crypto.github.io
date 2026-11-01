import { DEW } from './dew.js';

/** 2D-отрисовка «Утренней росы» поверх размытой комнаты. Только читает модель. */
export function createDewView(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = DEW.width * 2; canvas.height = DEW.height * 2;
  let game = null;

  // Мышь/палец задают цель паука в координатах мини-игры.
  const toLocal = e => {
    const r = canvas.getBoundingClientRect();
    return (e.clientX - r.left) / Math.max(1, r.width) * DEW.width;
  };
  canvas.addEventListener('pointermove', e => { if (game?.bonus) game.bonus.pointerX = toLocal(e); });
  canvas.addEventListener('pointerdown', e => { if (game?.bonus) game.bonus.pointerX = toLocal(e); });
  canvas.addEventListener('pointerleave', () => { if (game?.bonus) game.bonus.pointerX = null; });

  function drop(x, y, r, t) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(196,226,240,0.75)');
    g.addColorStop(1, 'rgba(120,170,200,0.35)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.7);
    ctx.bezierCurveTo(x + r * 0.9, y - r * 0.6, x + r, y + r, x, y + r);
    ctx.bezierCurveTo(x - r, y + r, x - r * 0.9, y - r * 0.6, x, y - r * 1.7);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(t * 6) * 0.2})`;
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();
  }

  function fly(x, y, t) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(240,236,226,0.55)';
    const flap = Math.sin(t * 60) * 0.5;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 6, -6, 7, 3.5, s * (0.6 + flap), 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#e7be79'; ctx.beginPath(); ctx.ellipse(0, 0, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a3b33'; ctx.fillRect(-5, -1, 10, 2); ctx.fillRect(-4, 3, 8, 2);
    ctx.beginPath(); ctx.arc(0, -8, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function leaf(x, y, spin) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
    ctx.fillStyle = '#a5683f';
    ctx.beginPath(); ctx.moveTo(0, -14);
    ctx.quadraticCurveTo(12, -4, 0, 14); ctx.quadraticCurveTo(-12, -4, 0, -14); ctx.fill();
    ctx.strokeStyle = '#6e3f26'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 13); ctx.stroke();
    ctx.restore();
  }

  function spider(b) {
    const x = b.x, y = DEW.lineY + 6, stun = b.stun > 0;
    ctx.save(); ctx.translate(x, y);
    if (stun) ctx.translate(Math.sin(b.time * 60) * 2, 0);
    ctx.strokeStyle = '#513e36'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const ph = Math.sin(b.walk + i * 1.6 + (s > 0 ? Math.PI : 0)) * 3;
      const kx = s * (9 + i * 3), ky = -8 + i * 4 + ph;
      ctx.beginPath(); ctx.moveTo(s * 3, -2 + i * 2); ctx.lineTo(kx, ky - 6); ctx.lineTo(kx + s * 6, ky + 6); ctx.stroke();
    }
    const body = ctx.createRadialGradient(-3, -4, 1, 0, 0, 13);
    body.addColorStop(0, '#d6a367'); body.addColorStop(1, '#7a4c2e');
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 6, 10, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#513e36'; ctx.beginPath(); ctx.ellipse(0, -7, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f6ead7';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 2.6, -9, 1.8, 0, Math.PI * 2); ctx.fill(); }
    if (stun) {
      ctx.fillStyle = '#ffd99c';
      for (let i = 0; i < 3; i++) { const a = b.time * 6 + i * 2.1; ctx.beginPath(); ctx.arc(Math.cos(a) * 12, -20 + Math.sin(a) * 3, 2, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  function draw(g) {
    game = g;
    const b = g.bonus;
    if (!b) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    // Рассветное небо за окном и рама.
    const sky = ctx.createLinearGradient(0, 0, 0, DEW.height);
    sky.addColorStop(0, '#5d5476'); sky.addColorStop(0.55, '#d39a86'); sky.addColorStop(1, '#f2c69a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, DEW.width, DEW.height);
    ctx.fillStyle = `rgba(255,236,190,${0.35 + b.progress * 0.4})`;
    ctx.beginPath(); ctx.arc(DEW.width * 0.72, DEW.height * 0.86, 60 + b.progress * 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3d3348';
    for (let i = 0; i < 9; i++) { const h = 30 + (i * 37 % 50); ctx.fillRect(i * 74, DEW.height - h, 66, h); }
    ctx.fillStyle = '#69536b';
    ctx.fillRect(0, 0, DEW.width, 10); ctx.fillRect(DEW.width / 2 - 5, 0, 10, DEW.height);
    // Провисающая нить, на которой сидит паук.
    ctx.strokeStyle = 'rgba(246,234,215,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, DEW.lineY - 8);
    ctx.quadraticCurveTo(b.x, DEW.lineY + 14, DEW.width, DEW.lineY - 8); ctx.stroke();
    for (const it of b.items) {
      if (it.type === 'dew') drop(it.x, it.y, 7, it.t);
      else if (it.type === 'fly') fly(it.x, it.y, it.t);
      else leaf(it.x, it.y, it.spin);
    }
    for (const p of b.pops) {
      ctx.strokeStyle = p.type === 'leaf' ? `rgba(239,143,118,${p.life * 2})` : `rgba(255,236,190,${p.life * 2})`;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 8 + (0.5 - p.life) * 40, 0, Math.PI * 2); ctx.stroke();
    }
    spider(b);
    // Таймер — тонкая полоска внизу, без лишнего текста.
    ctx.fillStyle = 'rgba(20,15,13,0.4)'; ctx.fillRect(0, DEW.height - 6, DEW.width, 6);
    ctx.fillStyle = '#ffd99c'; ctx.fillRect(0, DEW.height - 6, DEW.width * (1 - b.progress), 6);
  }
  return { draw };
}
