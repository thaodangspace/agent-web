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
  style="background:color-mix(in srgb, #135ce0 6%, #ffffff)"
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
    <span class="font-semibold text-ctp-blue">Thinking</span>
    <span class="text-ctp-overlay0 text-[10px] ml-auto">{escapeHTML(content.substring(0, 60))}…</span>
  </button>
  <div class="border-t border-ctp-surface0" class:hidden={collapsed}>
    <div class="p-3 text-xs" style="background:#f6f6f6;">
      <pre class="font-mono text-[11px] whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto text-ctp-blue/70">{content}</pre>
    </div>
  </div>
</div>
