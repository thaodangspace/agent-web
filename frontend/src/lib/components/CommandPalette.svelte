<script>
  import { sessionCommands, commandsLoading } from '$lib/stores/commands.svelte.js';
  import { isRpcRunning } from '$lib/stores/rpc.svelte.js';
  import { sendRPC } from '$lib/api/rpc.js';
  import { addSystemMessage } from '$lib/utils/events.js';

  let { sessionId, input, onCommandSelect, onCommandClose } = $props();

  let selectedIndex = $state(0);

  // Filter commands based on input (after the `/`)
  let filteredCommands = $derived.by(() => {
    const map = $sessionCommands;
    const cmds = map.get(sessionId) || [];
    const slashIdx = input.lastIndexOf('/');
    if (slashIdx === -1) return [];

    const afterSlash = input.slice(slashIdx + 1).trim().toLowerCase();
    if (!afterSlash) return cmds.slice(0, 10);

    return cmds.filter(c =>
      c.name.toLowerCase().includes(afterSlash) ||
      (c.description || '').toLowerCase().includes(afterSlash)
    ).slice(0, 10);
  });

  let showPalette = $derived(filteredCommands.length > 0);

  // Reset index when filtered list changes
  $effect(() => {
    if (showPalette) selectedIndex = 0;
  });

  function selectCommand(cmd) {
    onCommandSelect(cmd);
  }

  function handleKeydown(e) {
    if (!showPalette) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % filteredCommands.length;
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
      return true;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      selectCommand(filteredCommands[selectedIndex]);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCommandClose();
      return true;
    }
    return false;
  }

  function sourceColor(source) {
    switch (source) {
      case 'extension': return { bg: 'color-mix(in srgb, #65b73b 15%, #ffffff)', color: '#65b73b' };
      case 'prompt': return { bg: 'color-mix(in srgb, #dbab09 15%, #ffffff)', color: '#dbab09' };
      case 'skill': return { bg: 'color-mix(in srgb, #135ce0 15%, #ffffff)', color: '#135ce0' };
      default: return { bg: 'color-mix(in srgb, #777777 15%, #ffffff)', color: '#777777' };
    }
  }

  function sourceLabel(source) {
    switch (source) {
      case 'extension': return 'ext';
      case 'prompt': return 'cmd';
      case 'skill': return 'skill';
      default: return source || '?';
    }
  }

  export { handleKeydown, showPalette };
</script>

{#if showPalette}
  <div class="command-palette absolute bottom-full left-0 right-0 mb-1 bg-ctp-mantle border border-ctp-surface0 rounded-lg shadow-lg overflow-hidden z-50 max-h-64 overflow-y-auto">
    <div class="px-3 py-1.5 border-b border-ctp-surface0/50 text-[10px] text-ctp-overlay0 flex items-center justify-between">
      <span>Commands — ↑↓ navigate, ↵ select, esc close</span>
      <span>{filteredCommands.length} available</span>
    </div>
    {#each filteredCommands as cmd, i}
      {@const colors = sourceColor(cmd.source)}
      <button
        class="w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors hover:bg-ctp-surface0/70 cursor-pointer"
        class:bg-ctp-surface0={i === selectedIndex}
        onclick={() => selectCommand(cmd)}
        onmouseenter={() => selectedIndex = i}
      >
        <span
          class="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
          style="background:{colors.bg};color:{colors.color}"
        >{sourceLabel(cmd.source)}</span>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-mono text-ctp-text truncate">/{cmd.name}</div>
          {#if cmd.description}
            <div class="text-[10px] text-ctp-overlay0 truncate">{cmd.description}</div>
          {/if}
        </div>
        {#if cmd.location}
          <span class="text-[9px] text-ctp-overlay1 shrink-0">{cmd.location}</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}
