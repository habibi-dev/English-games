// Makes the page behave like an app rather than a web page: no pinch or keyboard zoom, no context menu on long press,
// and no zoom or refresh from gestures the app does not use. The matching CSS (overscroll, tap highlight, text
// selection) is in css/app.css under "Native feel". Text fields keep their normal behaviour.

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';

/** Sets the app-like behaviour on the page. Call once when the app starts. */
export function keepAppFeel() {
  // Pinch zoom on iOS Safari (gesture events) and on other touch screens (two fingers).
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );

  // Desktop zoom: Ctrl + mouse wheel, and Ctrl + plus, minus or zero.
  document.addEventListener('wheel', (event) => {
    if (event.ctrlKey) event.preventDefault();
  }, { passive: false });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(event.key)) event.preventDefault();
  });

  // The browser's menu on a long press or right click, except in text fields (where copy and paste are useful).
  document.addEventListener('contextmenu', (event) => {
    if (!event.target.closest?.(EDITABLE)) event.preventDefault();
  });
}
