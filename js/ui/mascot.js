// A small animated character that shows how a result went: a face with eyes and a mouth that change with the mood.
// It is drawn in SVG (no emoji) and animated by CSS (see the .mascot rules in app.css). With reduced motion it stays
// still. The parts are named (.m-face, .m-eye, .m-mouth, .m-tear, ...) so the CSS can animate each one.

export const MOODS = ['cheer', 'proud', 'calm', 'sad', 'surprised'];

// The face parts that differ by mood. Shared parts (the face circle and the cheeks) are added in mascot().
const MOUTHS = {
  cheer: '<path class="m-mouth-fill" d="M40 70 Q60 98 80 70 Z"/>',
  proud: '<path class="m-mouth-fill" d="M36 70 Q60 102 84 70 Z"/><path class="m-teeth" d="M46 74 H74"/>',
  calm: '<path class="m-mouth" d="M44 80 Q60 88 76 80"/>',
  sad: '<path class="m-mouth" d="M44 88 Q60 72 76 88"/>',
  surprised: '<ellipse class="m-mouth-fill" cx="60" cy="82" rx="9" ry="11"/>',
};

const EYES = {
  cheer: '<ellipse class="m-eye" cx="43" cy="52" rx="6" ry="8"/><ellipse class="m-eye" cx="77" cy="52" rx="6" ry="8"/>',
  proud: '<ellipse class="m-eye" cx="43" cy="52" rx="6" ry="8"/><ellipse class="m-eye" cx="77" cy="52" rx="6" ry="8"/>',
  calm: '<ellipse class="m-eye" cx="43" cy="52" rx="5" ry="7"/><ellipse class="m-eye" cx="77" cy="52" rx="5" ry="7"/>',
  sad:
    '<ellipse class="m-eye" cx="43" cy="54" rx="5.5" ry="7"/><ellipse class="m-eye" cx="77" cy="54" rx="5.5" ry="7"/>' +
    '<path class="m-brow" d="M33 40 L50 45"/><path class="m-brow" d="M87 40 L70 45"/>',
  surprised: '<ellipse class="m-eye m-eye-wide" cx="43" cy="50" rx="7" ry="10"/><ellipse class="m-eye m-eye-wide" cx="77" cy="50" rx="7" ry="10"/>',
};

// Extra parts: the falling tear (sad), the sparkles (cheer and proud), the cheeks (not sad).
const EXTRAS = {
  cheer: '<path class="m-sparkle" d="M104 14 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/>',
  proud:
    '<path class="m-sparkle" d="M104 12 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/>' +
    '<path class="m-sparkle m-sparkle-2" d="M14 22 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/>',
  sad: '<path class="m-tear" d="M86 60 q-5 9 0 13 q5 -4 0 -13z"/>',
};

const CHEEKS = '<circle class="m-cheek" cx="30" cy="68" r="6"/><circle class="m-cheek" cx="90" cy="68" r="6"/>';

/** The character for a mood (one of MOODS). Unknown moods fall back to calm. */
export function mascotSvg(mood) {
  const key = MOODS.includes(mood) ? mood : 'calm';
  const cheeks = key === 'sad' ? '' : CHEEKS;
  return (
    '<svg viewBox="0 0 120 120" fill="none" stroke="#92400e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<circle class="m-face" cx="60" cy="60" r="50"/>' +
    cheeks +
    EYES[key] +
    MOUTHS[key] +
    (EXTRAS[key] ?? '') +
    '</svg>'
  );
}

/** The character as an element for `h()`. The size comes from the .mascot rules (CSS). */
export function mascot(mood) {
  const span = document.createElement('span');
  span.className = `mascot mascot-${MOODS.includes(mood) ? mood : 'calm'}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = mascotSvg(mood);
  return span;
}
