<script>
  import { onMount, tick } from 'svelte';
  import { messages } from '$lib/stores/messages.svelte.js';
  import { rpcRunning, isStreaming, rpcAutoStarting, isRpcRunning } from '$lib/stores/rpc.svelte.js';
  import { activeSession } from '$lib/stores/session.svelte.js';
  import { userScrolledUp, newMessageCount } from '$lib/stores/messages.svelte.js';
  import { sendMessage, abortRPC } from '$lib/actions/rpc.js';

  import MessageBubble from './MessageBubble.svelte';
  import AssistantBubble from './AssistantBubble.svelte';
  import ToolResultBlock from './ToolResultBlock.svelte';
  import LoadingIndicator from './LoadingIndicator.svelte';
  import ScrollDownButton from './ScrollDownButton.svelte';
  import CommandPalette from './CommandPalette.svelte';
  import { isAtBottom, autoResize, syncHorizontalScroll } from '$lib/utils/scroll.js';
  import { getRPCCOmmands, uploadImage, getAvailableModels, setModel, cycleModel } from '$lib/api/rpc.js';
  import { sessionCommands, commandsLoading } from '$lib/stores/commands.svelte.js';
  import { availableModels, setModelsForSession, clearModelsForSession } from '$lib/stores/models.svelte.js';

  let input = $state('');
  let textareaEl = $state(null);
  let chatContainer = $state(null);
  let topScrollbarEl = $state(null);
  let bottomScrollbarEl = $state(null);
  let showTopScroll = $state(false);
  let showBottomScroll = $state(false);
  let showScrollBtn = $state(false);
  let rpcMap = $state(new Map());
  let pendingImages = $state([]);
  let isDragOver = $state(false);
  let fileInputEl = $state(null);
  let paletteRef = $state(null);
  let showPalette = $state(false);
  let paletteFetched = $state(new Set());

  // Model picker state
  let showModelPicker = $state(false);
  let models = $state([]);
  let modelsLoading = $state(false);
  let modelsError = $state('');
  let switchingModel = $state(false);
  let modelBtnRef = $state(null);
  let modelDropdownEl = $state(null);
  let modelDropdownTop = $state(0);
  let currentModel = $state('');

  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_IMAGES = 5;

  /**
   * Add an image file, uploading it to the backend first.
   * pendingImages stores { preview, path, uploading, error, name }
   */
  async function addImage(file) {
    if (!file.type.startsWith('image/')) {
      console.warn('Not an image file:', file.type);
      return;
    }
    if (pendingImages.length >= MAX_IMAGES) {
      console.warn(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      console.warn('Image too large:', file.size);
      return;
    }

    const preview = URL.createObjectURL(file);
    const idx = pendingImages.length;
    pendingImages = [...pendingImages, { preview, path: null, uploading: true, error: null, name: file.name }];

    try {
      const res = await uploadImage(file);
      pendingImages = pendingImages.map((img, i) =>
        i === idx ? { ...img, path: res.path, uploading: false } : img
      );
    } catch (e) {
      pendingImages = pendingImages.map((img, i) =>
        i === idx ? { ...img, uploading: false, error: e.message } : img
      );
    }
  }

  function removeImage(index) {
    const removed = pendingImages.splice(index, 1);
    if (removed[0]?.preview) URL.revokeObjectURL(removed[0].preview);
    pendingImages = [...pendingImages];
  }

  function clearImages() {
    pendingImages.forEach(img => { if (img.preview) URL.revokeObjectURL(img.preview); });
    pendingImages = [];
  }

  function handleFileSelect(e) {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(addImage);
    }
    e.target.value = '';
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    Array.from(items).forEach(item => {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) addImage(file);
      }
    });
  }

  function handleDragOver(e) {
    e.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave(e) {
    e.preventDefault();
    isDragOver = false;
  }

  function handleDrop(e) {
    e.preventDefault();
    isDragOver = false;
    const files = e.dataTransfer?.files;
    if (files) {
      Array.from(files).forEach(addImage);
    }
  }

  // Derive RPC status for the active session
  function activeRpcRunning() {
    return $activeSession ? rpcMap.get($activeSession) === true : false;
  }

  // Fetch available models
  async function fetchModels() {
    if (!activeRpcRunning()) return;
    let cached;
    availableModels.subscribe(v => { cached = v; })();
    const cachedModels = cached?.get($activeSession);
    if (cachedModels && cachedModels.length > 0) {
      models = cachedModels;
      return;
    }
    modelsLoading = true;
    modelsError = '';
    try {
      const resp = await getAvailableModels($activeSession);
      if (resp.success && resp.data?.models) {
        models = resp.data.models;
        setModelsForSession($activeSession, models);
      } else {
        modelsError = resp.error || 'Failed to fetch models';
      }
    } catch (e) {
      modelsError = e.message;
    } finally {
      modelsLoading = false;
    }
  }

  function positionModelDropdown() {
    if (!modelBtnRef || !modelDropdownEl) return;
    const rect = modelBtnRef.getBoundingClientRect();
    // Position above the button
    modelDropdownTop = rect.top - 6;
  }

  $effect(() => {
    if (showModelPicker) {
      requestAnimationFrame(() => positionModelDropdown());
    }
  });

  async function selectModel(m) {
    if (!activeRpcRunning() || switchingModel) return;
    switchingModel = true;
    modelsError = '';
    try {
      const resp = await setModel($activeSession, m.provider, m.id);
      if (resp.success) {
        closeModelPicker();
        clearModelsForSession($activeSession);
      } else {
        modelsError = resp.error || 'Failed to switch model';
      }
    } catch (e) {
      modelsError = e.message;
    } finally {
      switchingModel = false;
    }
  }

  async function handleCycleModel() {
    if (!activeRpcRunning() || switchingModel) return;
    switchingModel = true;
    modelsError = '';
    try {
      const resp = await cycleModel($activeSession);
      if (resp.success) {
        closeModelPicker();
        clearModelsForSession($activeSession);
      } else {
        modelsError = resp.error || 'No other model available';
      }
    } catch (e) {
      modelsError = e.message;
    } finally {
      switchingModel = false;
    }
  }

  function toggleModelPicker(e) {
    e.preventDefault();
    e.stopPropagation();
    if (showModelPicker) {
      closeModelPicker();
    } else {
      showModelPicker = true;
      if (models.length === 0) fetchModels();
    }
  }

  function closeModelPicker() {
    showModelPicker = false;
  }

  function isCurrentModel(m) {
    if (!currentModel) return false;
    return m.id === currentModel || m.id === currentModel.split('.').pop();
  }

  function providerIcon(provider) {
    switch (provider) {
      case 'anthropic': return 'A';
      case 'openai': return 'O';
      case 'google': return 'G';
      case 'bedrock': return 'B';
      default: return '?';
    }
  }

  function escapeHTML(str) {
    if (typeof str !== 'string') str = str == null ? '' : String(str);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  onMount(() => {
    // Check for horizontal scroll after DOM updates
    checkHorizontalScroll();
    const resizeObserver = new ResizeObserver(() => checkHorizontalScroll());
    if (chatContainer) resizeObserver.observe(chatContainer);

    // Subscribe to rpcRunning store to get reactive updates
    const unsubRpc = rpcRunning.subscribe(map => {
      rpcMap = new Map(map);
    });

    // Subscribe to messages changes for auto-scroll
    const unsubMsgs = messages.subscribe(async msgs => {
      if (!chatContainer || msgs.length === 0) return;

      // Wait for DOM to update with new messages
      await tick();

      // Check if user has scrolled up (tracked by handleScroll on scroll events)
      let scrolledUp = false;
      userScrolledUp.subscribe(v => { scrolledUp = v; })();

      if (!scrolledUp) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
        showScrollBtn = false;
        newMessageCount.set(0);
      } else {
        newMessageCount.update(n => n + 1);
        showScrollBtn = true;
      }
    });

    // Update current model from session info
    const unsubSession = activeSession.subscribe(id => {
      if (id) {
        fetch(`/api/sessions/${id}`)
          .then(r => r.json())
          .then(data => { if (data.model) currentModel = data.model; })
          .catch(() => {});
      } else {
        currentModel = '';
      }
    });

    return () => {
      unsubRpc();
      unsubMsgs();
      unsubSession();
      resizeObserver.disconnect();
    };
  });

  $effect(() => {
    // Setup scrollbar sync reactively when elements are available
    if (!chatContainer) return;
    
    const cleanups = [];
    if (topScrollbarEl) {
      cleanups.push(syncHorizontalScroll(topScrollbarEl, chatContainer));
    }
    if (bottomScrollbarEl) {
      cleanups.push(syncHorizontalScroll(bottomScrollbarEl, chatContainer));
    }
    
    return () => cleanups.forEach(fn => fn());
  });

  function handleSend() {
    const text = input.trim();
    const images = [...pendingImages];

    // Don't send if there are still uploading images
    if (images.some(img => img.uploading)) return;

    if (text || images.length > 0) {
      const imagePaths = images
        .filter(img => img.path && !img.error)
        .map(img => img.path);
      sendMessage(text, imagePaths);
      input = '';
      clearImages();
      if (textareaEl) autoResize(textareaEl);
    }
  }

  function handleKeydown(e) {
    // Let CommandPalette handle navigation keys when visible
    if (showPalette && paletteRef) {
      const handled = paletteRef.handleKeydown(e);
      if (handled) return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleCommandSelect(cmd) {
    // Insert the command into input
    const slashIdx = input.lastIndexOf('/');
    if (slashIdx !== -1) {
      input = input.slice(0, slashIdx) + '/' + cmd.name + ' ';
    }
    showPalette = false;
    if (textareaEl) {
      textareaEl.focus();
      autoResize(textareaEl);
    }
  }

  function handleCommandClose() {
    showPalette = false;
    if (textareaEl) textareaEl.focus();
  }

  // Track input changes to show/hide palette
  $effect(() => {
    // Read `input` reactively
    const _ = input;
    const activeId = $activeSession;
    if (!activeId) {
      showPalette = false;
      return;
    }
    const slashIdx = input.lastIndexOf('/');
    if (slashIdx === -1) {
      showPalette = false;
      return;
    }
    // Show palette if `/` is present and not followed by whitespace
    const afterSlash = input.slice(slashIdx + 1);
    if (afterSlash.includes(' ')) {
      showPalette = false;
      return;
    }
    showPalette = true;

    // Fetch commands if not already fetched for this session
    if (!paletteFetched.has(activeId)) {
      paletteFetched.add(activeId);
      commandsLoading.set(true);
      getRPCCOmmands(activeId)
        .then(resp => {
          if (resp.success && resp.data?.commands) {
            sessionCommands.update(map => {
              const next = new Map(map);
              next.set(activeId, resp.data.commands);
              return next;
            });
          }
        })
        .catch(e => console.error('Failed to fetch commands:', e))
        .finally(() => commandsLoading.set(false));
    }
  });

  function handleScroll() {
    if (!chatContainer) return;
    const atBottom = isAtBottom(chatContainer);
    userScrolledUp.set(!atBottom);
    if (atBottom) {
      showScrollBtn = false;
      newMessageCount.set(0);
    } else {
      showScrollBtn = true;
    }
  }

  function checkHorizontalScroll() {
    if (!chatContainer) return;
    const hasHorizontalScroll = chatContainer.scrollWidth > chatContainer.clientWidth;
    showTopScroll = hasHorizontalScroll;
    showBottomScroll = hasHorizontalScroll;
  }

  function scrollToBottomNow() {
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
      userScrolledUp.set(false);
      newMessageCount.set(0);
      showScrollBtn = false;
    }
  }
</script>

<div class="flex-1 flex flex-col min-h-0">
  <!-- Top Horizontal Scrollbar -->
  {#if showTopScroll}
    <div
      bind:this={topScrollbarEl}
      class="overflow-x-auto overflow-y-hidden scrollbar-thin"
      style="scrollbar-width: thin;"
    >
      <div class="h-2" style="width: {chatContainer?.scrollWidth || '100%'};"></div>
    </div>
  {/if}

  <!-- Messages -->
  <div
    class="flex-1 overflow-y-auto overflow-x-auto p-4 flex flex-col gap-3"
    bind:this={chatContainer}
    onscroll={handleScroll}
  >
    {#if $messages.length === 0}
      <div class="flex-1 flex items-center justify-center">
        <div class="text-center max-w-md px-4">
          <!-- Icon -->
          <div class="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
               style="background: linear-gradient(135deg, color-mix(in srgb, #89b4fa 20%, #1e1e2e), color-mix(in srgb, #cba6f7 20%, #1e1e2e))">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-ctp-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-ctp-text mb-1">
            {$activeSession ? 'Ready to chat' : 'Select a session to begin'}
          </h2>
          <p class="text-sm text-ctp-overlay0 mb-4">
            {$activeSession ? 'Ask anything — code, docs, debugging, or just explore ideas.' : 'Choose a session from the sidebar to view or continue.'}
          </p>
          {#if $activeSession}
            <div class="flex flex-wrap gap-2 justify-center">
              <span class="text-[10px] px-2.5 py-1 rounded-full" style="background:color-mix(in srgb, #89b4fa 12%, transparent); color:#89b4fa">
                💡 Ask a question
              </span>
              <span class="text-[10px] px-2.5 py-1 rounded-full" style="background:color-mix(in srgb, #a6e3a1 12%, transparent); color:#a6e3a1">
                🛠 Run commands
              </span>
              <span class="text-[10px] px-2.5 py-1 rounded-full" style="background:color-mix(in srgb, #f9e2af 12%, transparent); color:#f9e2af">
                📎 Attach images
              </span>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      {#each $messages as msg (msg.id)}
        {#if msg.role === 'user'}
          <MessageBubble {msg} />
        {:else if msg.role === 'assistant'}
          <AssistantBubble {msg} />
        {:else if msg.role === 'toolResult'}
          <ToolResultBlock {msg} />
        {:else if msg.role === 'system'}
          <div class="flex items-center justify-center animate-fadeIn">
            <div
              class="px-3 py-1.5 rounded-lg text-xs text-ctp-red"
              style="background:color-mix(in srgb, #f38ba8 10%, #1e1e2e)"
            >
              {msg.content}
            </div>
          </div>
        {/if}
      {/each}

      {#if $isStreaming === false && activeRpcRunning()}
        <!-- Show loading indicator while waiting for response -->
      {/if}
    {/if}
  </div>

  <!-- Bottom Horizontal Scrollbar -->
  {#if showBottomScroll}
    <div
      bind:this={bottomScrollbarEl}
      class="overflow-x-auto overflow-y-hidden scrollbar-thin"
      style="scrollbar-width: thin;"
    >
      <div class="h-2" style="width: {chatContainer?.scrollWidth || '100%'};"></div>
    </div>
  {/if}

  <!-- Scroll down button -->
  {#if showScrollBtn}
    <ScrollDownButton onScrollToBottom={scrollToBottomNow} />
  {/if}

  <!-- Input Area -->
  <div class="border-t border-ctp-surface0 bg-ctp-mantle relative w-full">
    <!-- Overlay to close model picker on click -->
    {#if showModelPicker}
      <div
        class="absolute inset-0 z-[10]"
        onclick={closeModelPicker}
      ></div>
    {/if}

    <!-- Drag-over overlay -->
    {#if isDragOver}
      <div class="absolute inset-0 bg-ctp-blue/10 border-2 border-dashed border-ctp-blue rounded-lg flex items-center justify-center pointer-events-none z-10">
        <span class="text-ctp-blue text-sm font-semibold">Drop image to attach</span>
      </div>
    {/if}

    <div class="px-4 pt-3 pb-2 relative z-[20]">
      <!-- Image Previews -->
      {#if pendingImages.length > 0}
        <div class="flex flex-wrap gap-2 mb-2">
          {#each pendingImages as img, i}
            <div class="relative group animate-fadeIn">
              <img
                src={img.preview}
                alt="preview"
                class="w-16 h-16 object-cover rounded-lg border border-ctp-surface0"
                class:opacity-50={img.uploading}
                class:border-ctp-red={img.error}
              />
              {#if img.uploading}
                <div class="absolute inset-0 flex items-center justify-center bg-ctp-crust/60 rounded-lg">
                  <div class="w-4 h-4 border-2 border-ctp-blue border-t-transparent rounded-full animate-spin"></div>
                </div>
              {/if}
              {#if img.error}
                <div class="absolute inset-0 flex items-center justify-center bg-ctp-crust/60 rounded-lg">
                  <span class="text-ctp-red text-xl">!</span>
                </div>
              {/if}
              <button
                class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-ctp-red text-ctp-crust text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onclick={() => removeImage(i)}
              >
                ✕
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Input row -->
      <div class="flex gap-2 items-stretch w-full" ondragover={handleDragOver} ondragleave={handleDragLeave} ondrop={handleDrop}>
        <div class="relative flex-1 min-w-0 flex items-end">
          <!-- Command Palette -->
          {#if showPalette && $activeSession}
            <CommandPalette
              bind:this={paletteRef}
              sessionId={$activeSession}
              {input}
              onCommandSelect={handleCommandSelect}
              onCommandClose={handleCommandClose}
            />
          {/if}

          <textarea
            bind:this={textareaEl}
            bind:value={input}
            class="w-full px-4 py-3 bg-ctp-crust border border-ctp-surface0 rounded-xl text-ctp-text text-base resize-none focus:outline-none focus:border-ctp-blue focus:ring-1 focus:ring-ctp-blue/30 placeholder:text-ctp-overlay0 transition-colors"
            class:border-ctp-blue={isDragOver}
            rows="3"
            placeholder={$activeSession ? (isDragOver ? 'Drop image here...' : 'Message the agent...') : 'Select a session to begin...'}
            disabled={$activeSession === null}
            onkeydown={handleKeydown}
            oninput={() => autoResize(textareaEl)}
            onpaste={handlePaste}
          ></textarea>
          <button
            class="absolute right-2 bottom-3 p-1.5 text-ctp-overlay1 hover:text-ctp-blue hover:bg-ctp-surface0/50 rounded-lg transition-all"
            onclick={() => fileInputEl?.click()}
            title="Attach image"
            disabled={$activeSession === null}
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
          </button>
        </div>
        <button
          class="px-5 py-3 rounded-xl text-sm font-semibold bg-ctp-blue text-ctp-crust hover:bg-ctp-blue/80 active:scale-[0.97] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100 shrink-0 self-end"
          disabled={$activeSession === null || pendingImages.some(img => img.uploading)}
          onclick={handleSend}
        >
          {#if pendingImages.some(img => img.uploading)}
            Uploading...
          {:else if $isStreaming}
            Queue
          {:else if $rpcAutoStarting}
            Starting...
          {:else}
            Send
          {/if}
        </button>
      </div>

      <!-- Model Switcher + Status Bar -->
      <div class="flex items-center justify-between mt-2">
        <!-- Model Picker Button -->
        <button
          bind:this={modelBtnRef}
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer
                 bg-ctp-blue/10 text-ctp-blue hover:bg-ctp-blue/20"
          disabled={!activeRpcRunning()}
          title={activeRpcRunning() ? 'Click to change model' : 'Send a message first to start RPC'}
          onclick={toggleModelPicker}
        >
          {#if switchingModel}
            <span class="w-3 h-3 border border-ctp-blue border-t-transparent rounded-full animate-spin"></span>
          {:else}
            <span class="font-semibold uppercase text-[10px] w-4 h-4 rounded flex items-center justify-center bg-ctp-blue/20">
              {models.find(m => isCurrentModel(m))?.provider?.[0]?.toUpperCase() || '?'}
            </span>
            <span class="truncate max-w-[180px]">{currentModel || 'Select model'}</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          {/if}
        </button>

        <!-- Status info -->
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1.5 text-[10px] text-ctp-overlay1">
            <div
              class="w-1.5 h-1.5 rounded-full transition-colors duration-300"
              style="background: {activeRpcRunning() || $rpcAutoStarting ? '#a6e3a1' : '#6c7086'}"
            ></div>
            <span>
              {$rpcAutoStarting ? 'Starting' : (activeRpcRunning() ? 'RPC active' : 'Idle')}
            </span>
          </div>
          {#if $isStreaming}
            <button
              class="px-2 py-0.5 rounded text-[10px] font-medium bg-ctp-red/15 text-ctp-red hover:bg-ctp-red/25 transition-colors"
              onclick={abortRPC}
            >
              ■ Stop
            </button>
          {/if}
        </div>
      </div>
    </div>

    <!-- Model Dropdown Panel - positioned above the model button -->
    {#if showModelPicker}
      <div
        bind:this={modelDropdownEl}
        class="absolute z-[30] left-4 bottom-full mb-2 w-80 bg-ctp-base border border-ctp-surface0 rounded-xl shadow-2xl overflow-hidden animate-fadeIn"
        style="bottom: calc(100% + 8px);"
      >
        <!-- Header -->
        <div class="px-3 py-2 border-b border-ctp-surface0/50 flex items-center justify-between">
          <span class="text-[11px] font-semibold text-ctp-overlay0">Switch Model</span>
          {#if models.length > 1}
            <button
              class="text-[11px] text-ctp-blue hover:text-ctp-blue/80 cursor-pointer px-2 py-0.5 rounded hover:bg-ctp-blue/10 transition-colors"
              disabled={!activeRpcRunning() || switchingModel}
              onclick={(e) => { e.stopPropagation(); handleCycleModel(); }}
              title="Cycle to next model"
            >
              {switchingModel ? '...' : '↻ Cycle'}
            </button>
          {/if}
        </div>

        <!-- RPC not running warning -->
        {#if !activeRpcRunning()}
          <div class="px-4 py-4 text-center">
            <div class="text-[11px] text-ctp-overlay0 mb-2">
              RPC is not running for this session.
            </div>
            <div class="text-[10px] text-ctp-overlay1">
              Type a message in the chat box to start RPC, then come back to switch models.
            </div>
          </div>
        {:else if modelsLoading}
          <div class="px-4 py-6 text-center text-[11px] text-ctp-overlay0">
            <div class="w-4 h-4 border-2 border-ctp-blue border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            Loading models...
          </div>
        {:else if modelsError}
          <div class="px-4 py-3 text-[11px] text-ctp-red bg-ctp-red/5">
            {escapeHTML(modelsError)}
          </div>
        {:else}
          <div class="max-h-64 overflow-y-auto py-1">
            {#each models as m}
              <button
                class="w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors hover:bg-ctp-surface0/70 cursor-pointer {isCurrentModel(m) ? 'bg-ctp-surface0/40' : ''}"
                disabled={switchingModel || isCurrentModel(m)}
                onclick={() => selectModel(m)}
              >
                <span class="w-4 shrink-0 text-center text-xs">
                  {#if isCurrentModel(m)}
                    <span class="text-ctp-green">✓</span>
                  {:else}
                    <span class="text-ctp-overlay0 opacity-30">○</span>
                  {/if}
                </span>

                <span class="text-xs font-bold shrink-0 w-5 h-5 rounded flex items-center justify-center"
                      style="background:color-mix(in srgb, #89b4fa 20%, transparent); color:#89b4fa"
                      title={m.provider}>
                  {providerIcon(m.provider)}
                </span>

                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium text-ctp-text truncate">
                    {escapeHTML(m.name || m.id)}
                  </div>
                  {#if m.contextWindow}
                    <div class="text-[10px] text-ctp-overlay0 truncate">{Math.round(m.contextWindow / 1000)}k ctx{#if m.reasoning} · thinking{/if}</div>
                  {/if}
                </div>

                {#if m.contextWindow}
                  <span class="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                        style="background:color-mix(in srgb, #94e2d5 15%, transparent); color:#94e2d5">
                    {Math.round(m.contextWindow / 1000)}k
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
