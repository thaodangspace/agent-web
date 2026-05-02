export function isAtBottom(el) {
  const threshold = 80;
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < threshold;
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
