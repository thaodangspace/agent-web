<script>
  import { escapeHTML } from '$lib/utils/markdown.js';

  let { tc } = $props();
  let collapsed = $state(true);
  let argsStr = $state(
    typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}, null, 2)
  );

  function toggle() {
    collapsed = !collapsed;
  }
</script>

<div
  class="rounded-lg overflow-hidden border border-ctp-surface0 mb-2"
  style="background:color-mix(in srgb, #fab387 10%, #313244)"
>
  <button
    class="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer"
    onclick={toggle}
  >
    <span
      class="transition-transform duration-200 text-[10px]"
      style="transform: {collapsed ? '' : 'rotate(90deg)'}"
    >▶</span>
    <span>🔧</span>
    <span class="font-semibold" style="color:#fab387">{escapeHTML(tc.name)}</span>
    <span class="text-ctp-overlay0 text-[10px] ml-auto">{escapeHTML(argsStr.substring(0, 50))}…</span>
  </button>
  <div class="border-t border-ctp-surface0" class:hidden={collapsed}>
    <div class="p-3 text-xs overflow-x-auto" style="background:color-mix(in srgb, #1e1e2e 50%, #11111b);">
      <pre class="font-mono text-[11px] whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">{argsStr}</pre>
    </div>
  </div>
</div>
