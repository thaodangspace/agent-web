export function isAtBottom(el) {
  const threshold = 80;
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < threshold;
}

/**
 * Creates synchronized horizontal scrolling between a scrollbar element and a content element.
 * Returns a cleanup function.
 */
export function syncHorizontalScroll(scrollbarEl, contentEl) {
  let isSyncing = false;

  function onScrollbarScroll() {
    if (isSyncing) return;
    isSyncing = true;
    contentEl.scrollLeft = scrollbarEl.scrollLeft;
    requestAnimationFrame(() => { isSyncing = false; });
  }

  function onContentScroll() {
    if (isSyncing) return;
    isSyncing = true;
    scrollbarEl.scrollLeft = contentEl.scrollLeft;
    requestAnimationFrame(() => { isSyncing = false; });
  }

  scrollbarEl.addEventListener('scroll', onScrollbarScroll);
  contentEl.addEventListener('scroll', onContentScroll);

  // Sync initial state
  scrollbarEl.scrollLeft = contentEl.scrollLeft;

  return () => {
    scrollbarEl.removeEventListener('scroll', onScrollbarScroll);
    contentEl.removeEventListener('scroll', onContentScroll);
  };
}

export function scrollToBottom(chatMessages, userScrolledUp, force = false) {
  if (force || !userScrolledUp) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

export function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}
