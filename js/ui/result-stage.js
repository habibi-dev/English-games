// The look of the results screen. There are five looks, one per result tier (resultTier in player.js):
// the colours, the badge and the animated backdrop change with the score.
// The backdrops are CSS animations, plus a few spawned pieces (confetti, fireworks, bubbles).
// Everything here is decorative (aria-hidden). With reduced motion the stage is hidden and numbers appear at once.

import { h, fa } from './dom.js';

export const RESULT_LOOKS = [
  // badge: the icon on the shareable card (icons.js). mood: the animated character on the results screen (mascot.js).
  { badge: 'sprout', mood: 'sad', title: 'Keep going!', text: 'Every expert started here. Review your mistakes and try again.' },
  { badge: 'sunrise', mood: 'calm', title: 'Getting there!', text: 'You are on the way. A little more practice and it clicks.' },
  { badge: 'rocket', mood: 'cheer', title: 'Good work!', text: 'A solid mission. Most of your answers were right.' },
  { badge: 'sparkles', mood: 'proud', title: 'Excellent!', text: 'Almost perfect. Only a few answers to polish.' },
  { badge: 'trophy', mood: 'proud', title: 'Perfect score!', text: 'Not one mistake. Legendary!' },
];

/**
 * Colours of each look, for the shareable card (result-card.js). They match the tier rules in app.css.
 * stops: background gradient; glow: a light at the top (null for none); ink: titles; soft: text; accent: bars.
 */
export const TIER_COLORS = [
  { stops: ['#e2e8f0', '#cbd5e1'], glow: null, ink: '#334155', soft: '#475569', accent: '#475569', star: '#f59e0b' },
  { stops: ['#fff7ed', '#fed7aa'], glow: '#fde68a', ink: '#9a3412', soft: '#7c2d12', accent: '#ea580c', star: '#f59e0b' },
  { stops: ['#ecfdf5', '#a7f3d0'], glow: null, ink: '#065f46', soft: '#047857', accent: '#059669', star: '#f59e0b' },
  { stops: ['#312e81', '#6d28d9', '#be185d'], glow: '#fde047', ink: '#ffffff', soft: '#e9d5ff', accent: '#fde047', star: '#fde047' },
  { stops: ['#fffbeb', '#fde68a', '#f59e0b'], glow: '#ffffff', ink: '#78350f', soft: '#92400e', accent: '#b45309', star: '#b45309' },
];

const CONFETTI_COLORS = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#c77dff'];
const GOLD_COLORS = ['#fde047', '#facc15', '#fff7ae', '#f59e0b', '#fffbeb'];
const SPARK_COLORS = ['#fde047', '#f472b6', '#67e8f9', '#a7f3d0', '#ffffff'];

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Random number from min to max. */
const between = (min, max) => min + Math.random() * (max - min);

/** Falling pieces. Tier 2 drops them once; tier 4 keeps a golden rain going (see the CSS). */
function pieces(count, colors, { delayMax, durationMin, durationMax }) {
  return Array.from({ length: count }, (_, i) => {
    const piece = h('span', { class: 'rs-piece' });
    piece.style.left = `${between(0, 100)}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${between(0, delayMax)}s`;
    piece.style.animationDuration = `${between(durationMin, durationMax)}s`;
    piece.style.setProperty('--drift', `${between(-80, 80)}px`);
    return piece;
  });
}

/** Drifting clouds for the lowest tier: slow and soft. */
function clouds() {
  return Array.from({ length: 3 }, (_, i) => {
    const cloud = h('span', { class: 'rs-cloud' });
    cloud.style.top = `${10 + i * 28}%`;
    cloud.style.animationDuration = `${between(18, 26)}s`;
    cloud.style.animationDelay = `${-between(0, 20)}s`;
    return cloud;
  });
}

/** A rising sun with turning rays, and bubbles floating up, for the second tier. */
function sunrise() {
  const rays = h('span', { class: 'rs-rays' });
  const bubbles = Array.from({ length: 7 }, () => {
    const bubble = h('span', { class: 'rs-bubble' });
    const size = between(8, 20);
    bubble.style.left = `${between(4, 96)}%`;
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.animationDuration = `${between(4, 7)}s`;
    bubble.style.animationDelay = `${-between(0, 7)}s`;
    return bubble;
  });
  return [rays, ...bubbles];
}

/** One firework: a burst of sparks that spread out, then it is removed. */
function firework(stage) {
  const burst = h('span', { class: 'rs-burst' });
  burst.style.left = `${between(12, 88)}%`;
  burst.style.top = `${between(8, 60)}%`;
  const sparks = 16;
  burst.replaceChildren(
    ...Array.from({ length: sparks }, (_, i) => {
      const spark = h('span', { class: 'rs-spark' });
      const angle = (i / sparks) * Math.PI * 2;
      const distance = between(40, 70);
      spark.style.setProperty('--dx', `${(Math.cos(angle) * distance).toFixed(1)}px`);
      spark.style.setProperty('--dy', `${(Math.sin(angle) * distance).toFixed(1)}px`);
      spark.style.background = SPARK_COLORS[i % SPARK_COLORS.length];
      return spark;
    }),
  );
  stage.append(burst);
  setTimeout(() => burst.remove(), 1200);
}

/**
 * Fireworks for the fourth tier: a burst now and then. Stops by itself once the stage leaves the page,
 * so no timer is left behind when the learner starts a new game.
 */
function startFireworks(stage) {
  const timer = setInterval(() => {
    if (!stage.isConnected) {
      clearInterval(timer);
      return;
    }
    firework(stage);
  }, 1100);
  setTimeout(() => firework(stage), 350);
}

/** Twinkling stars around the golden sunburst, for the top tier. */
function sparkles() {
  return Array.from({ length: 9 }, () => {
    const sparkle = h('span', { class: 'rs-sparkle', 'aria-hidden': 'true' }, '✦');
    sparkle.style.left = `${between(6, 92)}%`;
    sparkle.style.top = `${between(6, 80)}%`;
    sparkle.style.animationDelay = `${-between(0, 2)}s`;
    sparkle.style.fontSize = `${between(0.8, 1.6)}rem`;
    return sparkle;
  });
}

/**
 * The backdrop of the results hero for one tier. It is placed as the first child of the hero,
 * and the hero's own text sits above it (see the CSS).
 */
export function resultStage(tier) {
  let layers;
  if (tier === 0) layers = clouds();
  else if (tier === 1) layers = sunrise();
  else if (tier === 2) layers = [h('span', { class: 'rs-shine' }), ...pieces(44, CONFETTI_COLORS, { delayMax: 0.6, durationMin: 2.4, durationMax: 3.8 })];
  else if (tier === 3) layers = [];
  else layers = [h('span', { class: 'rs-sunburst' }), ...sparkles(), ...pieces(36, GOLD_COLORS, { delayMax: 6, durationMin: 4, durationMax: 7 })];

  const stage = h('div', { class: `rs-stage rs-${tier}`, 'aria-hidden': 'true' }, ...layers);
  if (tier === 3 && !reducedMotion()) startFireworks(stage);
  return stage;
}

/**
 * Counts a number up to `target` (the XP of the mission). `format` turns the number into text.
 * With reduced motion the final value is shown at once.
 */
export function countUp(element, target, format = (n) => `+${fa(n)} XP`, duration = 900) {
  if (reducedMotion() || target <= 0) {
    element.textContent = format(target);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    element.textContent = format(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  element.textContent = format(0);
  requestAnimationFrame(step);
}
