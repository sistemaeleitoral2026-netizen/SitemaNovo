'use strict';
/* Gráficos leves em Canvas — sem CDN (CSP script-src 'self'). */
(function () {
  const PALETTE = ['#2dd4bf', '#38bdf8', '#f59e0b', '#f43f5e', '#a78bfa', '#84cc16', '#fb7185', '#22d3ee'];

  function sizeCanvas(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth || 320;
    const h = cv.clientHeight || 200;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function clear(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f1a20';
    ctx.fillRect(0, 0, w, h);
  }

  function axis(ctx, pad, w, h) {
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, h - pad.b);
    ctx.lineTo(w - pad.r, h - pad.b);
    ctx.stroke();
  }

  function lineChart(cv, points, opts = {}) {
    const { ctx, w, h } = sizeCanvas(cv);
    clear(ctx, w, h);
    const pad = { t: 16, r: 12, b: 28, l: 36 };
    axis(ctx, pad, w, h);
    if (!points || !points.length) {
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.font = '13px system-ui,sans-serif';
      ctx.fillText('Sem dados no período', pad.l + 8, h / 2);
      return;
    }
    const vals = points.map((p) => Number(p.count || p.opened || 0));
    const max = Math.max(1, ...vals);
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const step = points.length === 1 ? iw / 2 : iw / (points.length - 1);

    ctx.strokeStyle = opts.color || PALETTE[0];
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = pad.l + i * step;
      const y = pad.t + ih - (vals[i] / max) * ih;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
    grad.addColorStop(0, (opts.color || PALETTE[0]) + '55');
    grad.addColorStop(1, (opts.color || PALETTE[0]) + '00');
    ctx.fillStyle = grad;
    ctx.lineTo(pad.l + (points.length - 1) * step, h - pad.b);
    ctx.lineTo(pad.l, h - pad.b);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = '11px system-ui,sans-serif';
    const show = Math.min(points.length, 6);
    for (let i = 0; i < show; i++) {
      const idx = Math.round(i * (points.length - 1) / Math.max(1, show - 1));
      const label = String(points[idx].day || points[idx].month || '').slice(5) || String(idx + 1);
      ctx.fillText(label, pad.l + idx * step - 10, h - 8);
    }
  }

  function barChart(cv, items, opts = {}) {
    const { ctx, w, h } = sizeCanvas(cv);
    clear(ctx, w, h);
    const pad = { t: 12, r: 12, b: 48, l: 36 };
    axis(ctx, pad, w, h);
    if (!items || !items.length) {
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.font = '13px system-ui,sans-serif';
      ctx.fillText('Sem dados no período', pad.l + 8, h / 2);
      return;
    }
    const vals = items.map((it) => Number(it.count || 0));
    const max = Math.max(1, ...vals);
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const bw = Math.max(8, iw / items.length - 6);

    items.forEach((it, i) => {
      const v = vals[i];
      const bh = (v / max) * ih;
      const x = pad.l + i * (iw / items.length) + 3;
      const y = pad.t + ih - bh;
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fillRect(x, y, bw, bh);
      ctx.save();
      ctx.translate(x + bw / 2, h - 10);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = 'rgba(255,255,255,.65)';
      ctx.font = '10px system-ui,sans-serif';
      const label = String(it.name || it.type || it.day || '').slice(0, 14);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    });
  }

  function dualLine(cv, points) {
    const { ctx, w, h } = sizeCanvas(cv);
    clear(ctx, w, h);
    const pad = { t: 16, r: 12, b: 28, l: 36 };
    axis(ctx, pad, w, h);
    if (!points || !points.length) {
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.font = '13px system-ui,sans-serif';
      ctx.fillText('Sem dados no período', pad.l + 8, h / 2);
      return;
    }
    const opened = points.map((p) => Number(p.opened || 0));
    const reopens = points.map((p) => Number(p.reopens || 0));
    const max = Math.max(1, ...opened, ...reopens);
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const step = points.length === 1 ? iw / 2 : iw / (points.length - 1);

    function stroke(vals, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = pad.l + i * step;
        const y = pad.t + ih - (v / max) * ih;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    stroke(opened, PALETTE[0]);
    stroke(reopens, PALETTE[3]);

    ctx.font = '11px system-ui,sans-serif';
    ctx.fillStyle = PALETTE[0]; ctx.fillText('Aberturas', pad.l, 12);
    ctx.fillStyle = PALETTE[3]; ctx.fillText('Reaberturas recusadas', pad.l + 80, 12);
  }

  function doughnut(cv, items) {
    const { ctx, w, h } = sizeCanvas(cv);
    clear(ctx, w, h);
    if (!items || !items.length) {
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.font = '13px system-ui,sans-serif';
      ctx.fillText('Sem dados no período', 24, h / 2);
      return;
    }
    const total = items.reduce((s, it) => s + Number(it.count || 0), 0) || 1;
    const cx = w * 0.38, cy = h / 2, r = Math.min(w, h) * 0.32;
    let a0 = -Math.PI / 2;
    items.forEach((it, i) => {
      const a1 = a0 + (Number(it.count || 0) / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fill();
      a0 = a1;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = '#0f1a20';
    ctx.fill();

    ctx.font = '11px system-ui,sans-serif';
    items.slice(0, 8).forEach((it, i) => {
      const y = 18 + i * 16;
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fillRect(w * 0.68, y - 8, 10, 10);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillText(`${String(it.type || '').slice(0, 18)} (${it.count})`, w * 0.68 + 16, y);
    });
  }

  window.SCCharts = { lineChart, barChart, dualLine, doughnut, PALETTE };
})();
