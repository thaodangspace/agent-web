<script>
  import { formatText, escapeHTML } from '$lib/utils/markdown.js';
  import ThinkingBlock from './ThinkingBlock.svelte';
  import ToolCallBlock from './ToolCallBlock.svelte';

  let { msg } = $props();

  // Derive values from msg prop so they auto-update during streaming
  let rawText = $derived(msg.rawText || '');
  let thinking = $derived(msg.thinking || '');
  let toolCalls = $derived(msg.toolCalls || []);
  let isStreaming = $derived(msg.isStreaming || false);
</script>

<div class="flex flex-col items-start animate-fadeIn">
  <div
    class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words max-w-[75%] assistant-bubble"
    style="background:color-mix(in srgb, #a6e3a1 20%, #313244); border-bottom-left-radius: 4px;"
  >
    {#if thinking}
      <ThinkingBlock content={thinking} />
    {/if}

    {#each toolCalls as tc (tc.id)}
      <ToolCallBlock {tc} />
    {/each}

    {#if rawText}
      <div class="prose-markdown">
        {@html formatText(rawText)}
      </div>
    {/if}
  </div>

  <div class="text-[10px] text-ctp-overlay0 mt-0.5 px-1">{msg.timestamp}</div>
</div>
