// Lets a mouse drag a sideways-scrolling row (the scrollbar is hidden in the CSS). A short press is still a click;
// a drag is not. Touch screens scroll with a finger as usual, so only the mouse is handled here.

/** Makes `el` (a row with overflow-x) draggable with the mouse. The row gets the `is-dragging` class while dragged. */
export function dragToScroll(el) {
  let dragging = false;
  let moved = false;
  let suppressClick = false;
  let startX = 0;
  let startLeft = 0;

  el.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    dragging = true;
    moved = false;
    startX = event.clientX;
    startLeft = el.scrollLeft;
  });

  el.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    if (!moved && Math.abs(dx) > 5) {
      moved = true;
      el.classList.add('is-dragging');
      el.setPointerCapture?.(event.pointerId);
    }
    if (moved) el.scrollLeft = startLeft - dx;
  });

  const release = () => {
    if (!dragging) return;
    dragging = false;
    suppressClick = moved;
    el.classList.remove('is-dragging');
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  // The click that ends a drag is not a tap on a tile.
  el.addEventListener(
    'click',
    (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  return el;
}
