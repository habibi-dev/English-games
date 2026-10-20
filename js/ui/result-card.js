// The shareable result card: a PNG drawn on a canvas from the numbers of the mission.
// It keeps the look of the result tier (colours, badge, title) and lists what the mission finished:
// score, XP, level, time, the lessons with their progress before and after, and the book's progress.
// The card is drawn in code, not as a screenshot, so it is sharp and reads the same on every device.

import { TIER_COLORS } from './result-stage.js';

const WIDTH = 1080;
const PAD = 72;
const INNER = WIDTH - PAD * 2;
const FONT = 'Vazirmatn, Tahoma, "Segoe UI", system-ui, sans-serif';
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const MAX_LESSON_ROWS = 8;
const MAX_BOOK_ROWS = 3;
const MODE_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

const font = (weight, size, family = FONT) => `${weight} ${size}px ${family}`;
const percentOf = (ratio) => `${Math.round(ratio * 100)}%`;

/** Time played as m:ss, or h:mm:ss from an hour on. */
function clock(ms) {
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** Splits text into lines that fit `maxWidth`, by words. */
function wrap(ctx, value, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(value).split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** One line, cut with an ellipsis when it does not fit. */
function fitOneLine(ctx, value, maxWidth) {
  let shown = String(value);
  while (shown.length > 1 && ctx.measureText(`${shown}…`).width > maxWidth) shown = shown.slice(0, -1);
  return shown === String(value) ? shown : `${shown.trimEnd()}…`;
}

/**
 * Draws text and returns the height it takes. With draw=false nothing is painted, so a block can be
 * measured before its background panel is drawn.
 */
function text(p, value, x, y, { size, weight = 400, color, align = 'left', maxWidth = null, single = false, lineHeight = Math.round(size * 1.3) }) {
  const { ctx } = p;
  ctx.font = font(weight, size);
  let lines;
  if (single && maxWidth) lines = [fitOneLine(ctx, value, maxWidth)];
  else if (maxWidth) lines = wrap(ctx, value, maxWidth);
  else lines = [String(value)];
  if (p.draw) {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  }
  return lines.length * lineHeight;
}

/** A rounded box. The radius is kept within the box, so short bars stay round and not broken. */
function roundRect(p, x, y, w, h, r, fill) {
  if (!p.draw || w <= 0) return;
  const radius = Math.min(r, w / 2, h / 2);
  const { ctx } = p;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * A panel behind some content. The content is measured first (draw=false), the panel is painted, and then the
 * content is painted on top, so the panel never covers its own text. Returns the height of the whole panel.
 */
function panel(p, x, y, w, pad, radius, fill, content) {
  const height = content({ ...p, draw: false }, y + pad) + pad * 2;
  roundRect(p, x, y, w, height, radius, fill);
  content(p, y + pad);
  return height;
}

function circle(p, cx, cy, r, fill) {
  if (!p.draw) return;
  p.ctx.beginPath();
  p.ctx.arc(cx, cy, r, 0, Math.PI * 2);
  p.ctx.fillStyle = fill;
  p.ctx.fill();
}

function star(p, cx, cy, r, fill) {
  if (!p.draw) return;
  const { ctx } = p;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A bar: the track, the part reached before the mission (light), and the part reached now (solid). */
function bar(p, x, y, w, h, before, after, { track, lightFill, solidFill }) {
  roundRect(p, x, y, w, h, h / 2, track);
  roundRect(p, x, y, w * before, h, h / 2, lightFill);
  roundRect(p, x, y, w * after, h, h / 2, solidFill);
}

/** Lays out the content of the card. With draw=false it only measures. Returns the y where the content ends. */
function paintContent(ctx, card, draw) {
  const p = { ctx, draw };
  const colors = TIER_COLORS[card.tier];
  const dark = card.tier === 3;
  const panelFill = dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.72)';
  const track = dark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(15, 23, 42, 0.12)';
  const lightFill = dark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(15, 23, 42, 0.22)';
  const r = card.report;
  let y = PAD;

  // Header: the name of the game on the left, and when the mission ended on the right.
  y += text(p, 'ENGLISH GRAMMAR QUEST', PAD, y, { size: 30, weight: 800, color: colors.soft });
  if (draw) {
    ctx.font = font(400, 30);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.soft;
    ctx.fillText(card.dateText, WIDTH - PAD, PAD);
  }
  y += 56;

  // Hero: the badge, the title and the line of the look, the stars, and the score in words.
  const cx = WIDTH / 2;
  circle(p, cx, y + 96, 96, dark ? 'rgba(253, 224, 71, 0.9)' : 'rgba(255, 255, 255, 0.78)');
  if (draw) {
    ctx.font = font(400, 104, EMOJI_FONT);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.ink;
    ctx.fillText(card.look.badge, cx, y + 98);
  }
  y += 216;
  y += text(p, card.look.title, cx, y, { size: 92, weight: 800, color: colors.ink, align: 'center' });
  y += 12;
  y += text(p, card.look.text, cx, y, { size: 38, color: colors.soft, align: 'center', maxWidth: 820, lineHeight: 52 });
  y += 30;
  const emptyStar = dark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(15, 23, 42, 0.18)';
  for (let i = 0; i < 3; i += 1) {
    star(p, cx - 130 + i * 130, y + 50, 52, i < card.stars ? colors.star : emptyStar);
  }
  y += 128;
  y += text(p, `${card.correct} of ${card.answered} correct · ${percentOf(card.accuracy)} accuracy`, cx, y, {
    size: 46,
    weight: 700,
    color: colors.ink,
    align: 'center',
  });
  y += 86;

  // Numbers: six tiles, three per row.
  const tileGap = 24;
  const tileW = (INNER - tileGap * 2) / 3;
  const tileH = 150;
  const levelUp = card.levelAfter > card.levelBefore;
  const tiles = [
    ['Points', `${r.score} / ${r.maxScore}`],
    ['XP gained', `+${r.score}`],
    [levelUp ? 'Level up!' : 'Level', `${card.levelAfter}`],
    ['Best streak', `${r.bestStreak} in a row`],
    ['Time played', clock(r.durationMs)],
    ['Lessons completed', `${r.lessonsCompleted}`],
  ];
  tiles.forEach(([label, value], i) => {
    const x = PAD + (i % 3) * (tileW + tileGap);
    const ty = y + Math.floor(i / 3) * (tileH + 20);
    roundRect(p, x, ty, tileW, tileH, 22, panelFill);
    text(p, label, x + tileW / 2, ty + 24, { size: 28, color: colors.soft, align: 'center' });
    text(p, value, x + tileW / 2, ty + 64, { size: 46, weight: 800, color: colors.ink, align: 'center' });
  });
  y += 2 * (tileH + 20) + 30;

  // Progress: the books of the mission, before and after.
  const books = r.books.slice(0, MAX_BOOK_ROWS);
  const progressBlock = (q, top) => {
    let yy = top;
    yy += text(q, 'Your progress', PAD + 36, yy, { size: 40, weight: 800, color: colors.ink });
    yy += 16;
    for (const book of books) {
      const gained = book.after.done - book.before.done;
      const name = book.level ? `${book.title} · ${book.level}` : book.title;
      yy += text(q, name, PAD + 36, yy, { size: 36, weight: 700, color: colors.ink, single: true, maxWidth: INNER - 72 });
      const gainedText = gained > 0 ? `  (+${gained} in this mission)` : '';
      yy += text(q, `${book.after.done} of ${book.after.total} questions done · ${percentOf(book.after.percent / 100)}${gainedText}`, PAD + 36, yy + 4, {
        size: 28,
        color: colors.soft,
        single: true,
        maxWidth: INNER - 72,
      });
      yy += 14;
      bar(q, PAD + 36, yy, INNER - 72, 20, book.before.percent / 100, book.after.percent / 100, {
        track,
        lightFill,
        solidFill: colors.accent,
      });
      yy += 56;
    }
    if (r.books.length > MAX_BOOK_ROWS) {
      yy += text(q, `+${r.books.length - MAX_BOOK_ROWS} more books`, PAD + 36, yy, { size: 28, color: colors.soft });
    }
    return yy - top;
  };
  y += panel(p, PAD, y, INNER, 36, 28, panelFill, progressBlock) + 40;

  // Lessons: each one played in this mission, with its result and where it stands now.
  y += text(p, 'Lessons in this mission', PAD, y, { size: 40, weight: 800, color: colors.ink });
  y += 18;
  for (const lesson of r.lessons.slice(0, MAX_LESSON_ROWS)) {
    const top = y;
    roundRect(p, PAD, top, INNER, 128, 22, panelFill);
    const textWidth = INNER - 400;
    text(p, lesson.title, PAD + 28, top + 22, { size: 34, weight: 700, color: colors.ink, single: true, maxWidth: textWidth });
    const sub = [lesson.unitTitle, lesson.bookTitle].filter(Boolean).join(' · ');
    if (sub) text(p, sub, PAD + 28, top + 70, { size: 26, color: colors.soft, single: true, maxWidth: textWidth });
    text(p, `${lesson.correct} of ${lesson.answered} correct`, WIDTH - PAD - 28, top + 22, {
      size: 30,
      weight: 700,
      color: colors.ink,
      align: 'right',
    });
    const status = lesson.after.complete ? 'Completed' : `${lesson.after.done} of ${lesson.after.total} done`;
    text(p, status, WIDTH - PAD - 28, top + 66, {
      size: 26,
      weight: 700,
      color: lesson.after.complete ? colors.accent : colors.soft,
      align: 'right',
    });
    bar(p, PAD + 28, top + 108, INNER - 56, 8, lesson.before.percent / 100, lesson.after.percent / 100, {
      track,
      lightFill,
      solidFill: colors.accent,
    });
    y += 128 + 14;
  }
  if (r.lessons.length > MAX_LESSON_ROWS) {
    y += text(p, `+${r.lessons.length - MAX_LESSON_ROWS} more lessons`, PAD, y, { size: 28, color: colors.soft }) + 8;
  }

  // Exercise types, and the summary line.
  y += 28;
  if (r.categories.length) {
    y += text(p, `Exercises: ${r.categories.join(' · ')}`, PAD, y, { size: 30, color: colors.soft, maxWidth: INNER, lineHeight: 42 }) + 8;
  }
  const mode = MODE_LABELS[r.mode] ?? r.mode;
  y += text(p, `${mode} difficulty · ${r.answered} questions · ${r.newlyDone} new questions finished · ${r.wrong} to review`, PAD, y, {
    size: 30,
    color: colors.soft,
    maxWidth: INNER,
    lineHeight: 42,
  });
  return y;
}

/** The background of the card: the tier's gradient, with a light at the top when the look has one. */
function paintBackground(ctx, tier, height) {
  const colors = TIER_COLORS[tier];
  const gradient = ctx.createLinearGradient(0, 0, WIDTH * 0.35, height);
  colors.stops.forEach((stop, i) => gradient.addColorStop(i / (colors.stops.length - 1), stop));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, height);
  if (colors.glow) {
    const glow = ctx.createRadialGradient(WIDTH / 2, 0, 0, WIDTH / 2, 0, height * 0.6);
    glow.addColorStop(0, colors.glow);
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, height);
    ctx.globalAlpha = 1;
  }
}

/**
 * Builds the card as a canvas.
 * card: { tier, look: { badge, title, text }, stars, correct, answered, accuracy, levelBefore, levelAfter,
 *         dateText, endedAt, report (from missionReport) }
 */
export async function makeResultCard(card) {
  // The card uses the app's own font, so it is loaded before the text is measured.
  await document.fonts?.load?.(font(800, 40)).catch(() => {});
  const measure = document.createElement('canvas').getContext('2d');
  const height = paintContent(measure, card, false) + PAD;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  paintBackground(ctx, card.tier, height);
  paintContent(ctx, card, true);
  return canvas;
}

const toBlob = (canvas) =>
  new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No image.'))), 'image/png'));

/** File name that sorts by date, e.g. grammar-quest-result-2026-10-20-1308.png. */
function fileNameFor(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `grammar-quest-result-${stamp}.png`;
}

/** The message that goes with the image when it is shared. */
export function shareMessage(card) {
  const r = card.report;
  const finished = r.lessonsCompleted ? `, finished ${r.lessonsCompleted} lesson${r.lessonsCompleted === 1 ? '' : 's'}` : '';
  return `English Grammar Quest: ${card.correct} of ${card.answered} correct (${percentOf(card.accuracy)})${finished}. Level ${card.levelAfter}.`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves the card as a PNG file on this device. */
export async function saveResultCard(card) {
  const blob = await toBlob(await makeResultCard(card));
  download(blob, fileNameFor(new Date(card.endedAt)));
  return 'saved';
}

/**
 * Opens the system share sheet with the card as an image. Returns 'shared' or 'cancelled'.
 * It never saves a file: when the device cannot share images, it throws an error with the name 'ShareUnsupported'.
 */
export async function shareResultCard(card) {
  const blob = await toBlob(await makeResultCard(card));
  const name = fileNameFor(new Date(card.endedAt));
  const file = new File([blob], name, { type: 'image/png' });
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare?.({ files: [file] })) {
    const error = new Error('This device cannot share images.');
    error.name = 'ShareUnsupported';
    throw error;
  }
  try {
    await navigator.share({ files: [file], title: 'English Grammar Quest', text: shareMessage(card) });
    return 'shared';
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled';
    throw error;
  }
}
