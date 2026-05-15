<script>
  import { newMessageCount } from '$lib/stores/messages.svelte.js';

  let { onScrollToBottom } = $props();
</script>

<button
  class="fixed bottom-24 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold shadow-lg transition-all animate-fadeIn"
  style="background:color-mix(in srgb, #135ce0 10%, #ffffff); color:#333333; border:1px solid #135ce0;"
  onclick={onScrollToBottom}
>
  <span>↓</span>
  {#if $newMessageCount > 0}
    <span>New {$newMessageCount} message{($newMessageCount > 1) ? 's' : ''}</span>
  {:else}
    <span>Scroll to bottom</span>
  {/if}
</button>
