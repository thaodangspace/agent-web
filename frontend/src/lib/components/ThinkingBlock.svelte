<script>
  import { escapeHTML } from '$lib/utils/markdown.js';

  let { content } = $props();
  let collapsed = $state(true);

  function toggle() {
    collapsed = !collapsed;
  }
</script>

<div
  class="rounded-lg overflow-hidden border border-ctp-surface0 mb-2"
  style="background:color-mix(in srgb, #cba6f7 8%, #313244)"
>
  <button
    class="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer"
    onclick={toggle}
  >
    <span
      class="transition-transform duration-200 text-[10px]"
      style="transform: {collapsed ? '' : 'rotate(90deg)'}"
    >▶</span>
    <span>💭</span>
    <span class="font-semibold text-ctp-mauve">Thinking</span>
    <span class="text-ctp-overlay0 text-[10px] ml-auto">{escapeHTML(content.substring(0, 60))}…</span>
  </button>
  <div class="border-t border-ctp-surface0" class:hidden={collapsed}>
    <div class="p-3 text-xs" style="background:color-mix(in srgb, #1e1e2e 50%, #11111b);">
      <pre class="font-mono text-[11px] whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto text-ctp-mauve opacity-80">{content}</pre>
    </div>
  </div>
</div>
