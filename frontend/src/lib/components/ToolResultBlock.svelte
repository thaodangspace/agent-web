<script>
  import { escapeHTML, highlightCode } from '$lib/utils/markdown.js';
  import { detectLanguageFromPath } from '$lib/utils/language.js';
  import { unescapeJsonString } from '$lib/utils/json.js';

  let { msg } = $props();
  let collapsed = $state(msg.toolName !== 'bash'); // bash results start expanded

  // Derive content and highlighted HTML from msg prop
  let content = $derived.by(() => {
    return unescapeJsonString(msg.content || '(no output)');
  });

  let contentHTML = $derived.by(() => {
    const c = content;
    if (msg.toolName === 'read') {
      const lang = msg.language || detectLanguageFromPath(msg.filePath || '');
      if (lang) {
        return highlightCode(c, lang);
      }
    }
    return escapeHTML(c);
  });

  let isError = $derived(msg.isError || false);
  let highlighted = $derived(msg.toolName === 'read' && (msg.language || detectLanguageFromPath(msg.filePath || '')));

  function toggle() {
    collapsed = !collapsed;
  }
</script>

<div class="flex flex-col items-start animate-fadeIn w-full">
  <div
    class="w-full max-w-[85%] rounded-xl overflow-hidden border border-ctp-surface0"
    style="border-color: {isError ? '#e95f59' : '#e5e5e5'}"
  >
    <button
      class="w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer"
      style="background: {isError
        ? 'color-mix(in srgb, #e95f59 12%, #ffffff)'
        : 'color-mix(in srgb, #dbab09 12%, #ffffff)'}"
      onclick={toggle}
    >
      <span
        class="transition-transform duration-200 text-[10px]"
        style="transform: {collapsed ? '' : 'rotate(90deg)'}"
      >▶</span>
      <span>📎</span>
      <span class="font-semibold {isError ? 'text-ctp-red' : 'text-ctp-yellow'}">{escapeHTML(msg.toolName)}</span>
      {#if isError}
        <span class="text-ctp-red text-[10px] ml-auto">Error</span>
      {:else}
        <span class="text-ctp-overlay0 text-[10px] ml-auto">Result</span>
      {/if}
    </button>
    <div class="border-t border-ctp-surface0" class:hidden={collapsed}>
      <div class="p-3 text-xs overflow-x-auto" style="background:#f6f6f6;">
        {#if highlighted}
          <pre class="font-mono text-[11px] whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto">
            {@html contentHTML}
          </pre>
        {:else}
          <pre class="font-mono text-[11px] whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto">{contentHTML}</pre>
        {/if}
      </div>
    </div>
  </div>
</div>
