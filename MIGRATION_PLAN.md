# Migration Plan: JS/HTMX → Svelte + Tailwind CSS

## Overview

Migrate the current frontend from vanilla JavaScript + HTMX to a **Svelte** SPA with **Tailwind CSS**, while keeping the **Go backend** as the host. The Go server will serve the compiled Svelte static assets and continue to provide the REST API + WebSocket endpoints.

---

## Current Architecture

```
┌─────────────────────────────────────────────┐
│  Go Server (net/http)                       │
│                                             │
│  ├─ REST API: /api/sessions, /api/rpc/*    │
│  ├─ WebSocket: /ws                          │
│  ├─ HTMX Fragment: /sessions (HTML)         │
│  └─ Static Files: /static/* (JS + HTML)     │
│                                             │
│  Serves: index.html + app.js + modules      │
│  Frontend: Vanilla JS + HTMX + CDN Tailwind │
└─────────────────────────────────────────────┘
```

## Target Architecture

```
┌─────────────────────────────────────────────┐
│  Go Server (net/http)                       │
│                                             │
│  ├─ REST API: /api/sessions, /api/rpc/*    │  ← UNCHANGED
│  ├─ WebSocket: /ws                          │  ← UNCHANGED
│  └─ Static Files: /static/* (Svelte SPA)    │  ← CHANGED
│                                             │
│  Serves: dist/ (compiled Svelte app)        │
│  Frontend: Svelte SPA + Tailwind CSS (Vite) │
└─────────────────────────────────────────────┘
```

The Go backend **does not change** (except the static file serving path). All API endpoints remain identical.

---

## Phase 1: Project Setup

### 1.1 Create Svelte App (outside Go tree)

```bash
# In a new directory, e.g., agent-web/frontend/
cd /Users/dt/code/agent-web
mkdir frontend && cd frontend

# Create Svelte + Vite project
npm create svelte@latest . -- --template skeleton

# Install dependencies
npm install

# Add Tailwind CSS v4
npx svelte-add@latest tailwindcss

# Additional dependencies
npm install marked highlight.js
```

### 1.2 Configure Vite for Go Serving

**`frontend/vite.config.js`**

```js
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    // Output to a known dist/ directory that Go will embed
    outDir: '../internal/server/static/dist',
    emptyOutDir: true,
  },
});
```

### 1.3 Update Go Static Serving

**`internal/server/server.go`** — change the static file serving:

```go
// Before:
mux.Handle("/", http.FileServer(http.FS(staticSub)))

// After: serve the Svelte-built dist/ directory
mux.Handle("/", http.FileServer(http.FS(staticSub)))
// The dist/ output goes into static/dist/ via Vite outDir
// Add a catch-all handler for SPA routing:
```

Add a SPA fallback handler so all routes serve `index.html`:

```go
// SPA fallback — serve index.html for any non-API, non-asset route
mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
    if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/ws" {
        return // let other handlers deal with these
    }
    // Check if it's a static asset (has an extension)
    if filepath.Ext(r.URL.Path) != "" {
        http.FileServer(http.FS(staticSub)).ServeHTTP(w, r)
        return
    }
    // SPA fallback
    http.ServeFile(w, r, "static/dist/index.html")
})
```

### 1.4 Update Makefile

```makefile
.PHONY: build run test clean frontend frontend-build frontend-dev

# ... existing targets ...

frontend:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

frontend-deps:
	cd frontend && npm install

build: frontend-deps frontend-build
	GOCACHE=$(GOCACHE) go build -buildvcs=false -o $(BINARY) ./cmd/server/
```

---

## Phase 2: Directory Structure

### New Frontend Structure

```
frontend/
├── src/
│   ├── app.html                    # Main HTML shell (replaces index.html)
│   ├── lib/
│   │   ├── components/
│   │   │   ├── Sidebar.svelte      # Session list sidebar
│   │   │   ├── ChatArea.svelte     # Message list + input area
│   │   │   ├── MessageBubble.svelte  # User message bubble
│   │   │   ├── AssistantBubble.svelte # Assistant message bubble
│   │   │   ├── ThinkingBlock.svelte  # Collapsible thinking block
│   │   │   ├── ToolCallBlock.svelte  # Collapsible tool call block
│   │   │   ├── ToolResultBlock.svelte # Tool result with syntax highlight
│   │   │   ├── HeaderBar.svelte    # Connection status + session info
│   │   │   ├── NewSessionModal.svelte # New session creation modal
│   │   │   ├── ScrollDownButton.svelte # Floating scroll-to-bottom button
│   │   │   └── LoadingIndicator.svelte # Typing/waiting indicator
│   │   ├── stores/
│   │   │   ├── session.svelte.js   # Active session state
│   │   │   ├── ws.svelte.js        # WebSocket connection state
│   │   │   ├── rpc.svelte.js       # RPC running/streaming state
│   │   │   ├── messages.svelte.js  # Chat message store
│   │   │   └── ui.svelte.js        # UI state (sidebar, modals, etc.)
│   │   ├── api/
│   │   │   ├── sessions.js         # fetch wrappers for /api/sessions/*
│   │   │   ├── rpc.js              # fetch wrappers for /api/rpc/*
│   │   │   └── websocket.js        # WebSocket connection manager
│   │   ├── utils/
│   │   │   ├── markdown.js         # marked + highlight.js wrappers
│   │   │   ├── scroll.js           # scroll tracking utilities
│   │   │   ├── format.js           # time formatting, escaping
│   │   │   ├── language.js         # file extension → language mapping
│   │   │   └── json.js             # JSON unescape utilities
│   │   └── types/
│   │       └── index.js            # JSDoc type definitions
│   └── routes/
│       ├── +layout.svelte          # Root layout (sidebar + main)
│       └── +page.svelte            # Main page (no routing needed, but required)
├── static/
│   └── (empty — assets go here if needed)
├── static-files/                   # Files to copy to Go's static/ dir
│   └── (if any)
├── svelte.config.js
├── vite.config.js
├── tailwind.config.js
├── package.json
└── jsconfig.json
```

---

## Phase 3: Component Migration

### 3.1 Stores (Replaces `state.js`)

**`src/lib/stores/session.svelte.js`**

```js
import { writable } from 'svelte/store';

export const activeSession = writable(null);
export const activeSessionPath = writable(null);
export const sessions = writable([]);
```

**`src/lib/stores/ws.svelte.js`**

```js
import { writable } from 'svelte/store';

export const ws = writable(null);
export const wsConnected = writable(false);
```

**`src/lib/stores/rpc.svelte.js`**

```js
import { writable } from 'svelte/store';

export const rpcRunning = writable(false);
export const isStreaming = writable(false);
```

**`src/lib/stores/messages.svelte.js`**

```js
import { writable } from 'svelte/store';

export const messages = writable([]);
export const userScrolledUp = writable(false);
export const newMessageCount = writable(0);
```

**`src/lib/stores/ui.svelte.js`**

```js
import { writable } from 'svelte/store';

export const sidebarOpen = writable(false);
export const newSessionModalOpen = writable(false);
```

### 3.2 WebSocket Manager (Replaces `ws.js`)

**`src/lib/api/websocket.js`**

```js
import { ws, wsConnected } from '$lib/stores/ws.svelte.js';
import { activeSession } from '$lib/stores/session.svelte.js';
import { onWSMessage } from '$lib/utils/events.js';

let socket = null;

export function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${proto}//${location.host}/ws`);
  ws.set(socket);

  socket.onopen = () => {
    wsConnected.set(true);
    activeSession.subscribe(id => {
      if (id && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'subscribe', session_id: id }));
      }
    })();
  };

  socket.onclose = () => {
    wsConnected.set(false);
    setTimeout(connectWS, 3000);
  };

  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'event') {
        onWSMessage(msg);
      }
    } catch (e) {
      console.error('WS parse error:', e);
    }
  };
}
```

### 3.3 API Client (Replaces inline fetch calls)

**`src/lib/api/sessions.js`**

```js
export async function fetchSessions() {
  const res = await fetch('/api/sessions');
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchSession(id) {
  const res = await fetch(`/api/sessions/${id}`);
  if (!res.ok) throw new Error('Session not found');
  return res.json();
}

export async function createSession(cwd) {
  const res = await fetch('/api/sessions/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

**`src/lib/api/rpc.js`**

```js
export async function startRPC(sessionId) {
  const res = await fetch('/api/rpc/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function stopRPC(sessionId) {
  const res = await fetch('/api/rpc/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function sendRPC(sessionId, command) {
  const res = await fetch('/api/rpc/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, command }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

### 3.4 Components

#### `Sidebar.svelte` — Session List

```svelte
<script>
  import { sessions, activeSession } from '$lib/stores/session.svelte.js';
  import { sidebarOpen } from '$lib/stores/ui.svelte.js';
  import { selectSession } from '$lib/actions/session.js';

  let { onNewSession } = $props();
</script>

<div class="sidebar w-[280px] bg-ctp-mantle border-r border-ctp-surface0 flex flex-col">
  <div class="p-4 border-b border-ctp-surface0 text-sm font-semibold text-ctp-blue flex items-center justify-between">
    <span>⚡ Sessions</span>
    <div class="flex items-center gap-2">
      <button
        class="text-ctp-green hover:text-ctp-teal text-xs font-bold"
        onclick={onNewSession}
        title="New Session"
      >＋</button>
      <button
        class="md:hidden text-ctp-overlay0 hover:text-ctp-text"
        onclick={() => sidebarOpen.set(false)}
      >✕</button>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto">
    {#each $sessions as session (session.id)}
      <div
        class="session-item px-4 py-2.5 border-b border-ctp-surface0 cursor-pointer transition-colors duration-150 hover:bg-ctp-surface1"
        class:bg-ctp-surface0={$activeSession === session.id}
        class:border-l-[3px]={$activeSession === session.id}
        class:border-ctp-blue={$activeSession === session.id}
        onclick={() => selectSession(session.id)}
      >
        <div class="flex items-center justify-between">
          <div class="text-xs text-ctp-text">{session.project}</div>
          {#if session.last_message_time}
            <div class="text-[10px] text-ctp-overlay0">{session.last_message_time}</div>
          {/if}
        </div>
        <div class="text-[11px] text-ctp-overlay1 break-all">{session.id}</div>
        <div class="text-[10px] text-ctp-overlay0 mt-0.5">{session.cwd}</div>
        {#if session.model}
          <div class="text-[10px] text-ctp-blue mt-0.5">{session.model}</div>
        {/if}
      </div>
    {/each}
  </div>
</div>
```

#### `ChatArea.svelte` — Main Chat Interface

```svelte
<script>
  import { messages, activeSession } from '$lib/stores/session.svelte.js';
  import { rpcRunning, isStreaming } from '$lib/stores/rpc.svelte.js';
  import { sendMessage, toggleRPC, abortRPC } from '$lib/actions/rpc.js';
  import { quitSession } from '$lib/actions/session.js';
  import MessageBubble from './MessageBubble.svelte';
  import AssistantBubble from './AssistantBubble.svelte';
  import LoadingIndicator from './LoadingIndicator.svelte';
  import ScrollDownButton from './ScrollDownButton.svelte';

  let input = $state('');
  let textareaEl = $state(null);
  let chatContainer = $state(null);

  function handleSend() {
    const text = input.trim();
    if (text) {
      sendMessage(text);
      input = '';
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
</script>

<div class="flex-1 flex flex-col min-h-0">
  <!-- Messages -->
  <div
    class="flex-1 overflow-y-auto p-4 flex flex-col gap-3"
    bind:this={chatContainer}
  >
    {#if $messages.length === 0}
      <div class="flex items-center justify-center h-full text-ctp-overlay0 text-sm">
        Select a session and start RPC to begin chatting
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
            <div class="px-3 py-1.5 rounded-lg text-xs text-ctp-red"
                 style="background:color-mix(in srgb, #f38ba8 10%, #1e1e2e)">
              {msg.content}
            </div>
          </div>
        {/if}
      {/each}

      {#if $isStreaming === false && $rpcRunning}
        <!-- Show loading indicator while waiting for response -->
      {/if}
    {/if}
  </div>

  <!-- Input Area -->
  <div class="border-t border-ctp-surface0 bg-ctp-mantle p-3">
    <div class="flex gap-2 items-end">
      <textarea
        bind:this={textareaEl}
        bind:value={input}
        class="flex-1 px-3 py-2 bg-ctp-crust border border-ctp-surface0 rounded-lg text-ctp-text text-sm font-mono resize-none focus:outline-none focus:border-ctp-blue placeholder:text-ctp-overlay0"
        rows="1"
        placeholder={$rpcRunning ? 'Type a message...' : 'Select a session and start RPC to chat...'}
        disabled={$rpcRunning === false}
        onkeydown={handleKeydown}
        oninput={() => autoResize(textareaEl)}
      ></textarea>
      <button
        class="px-4 py-2 rounded-lg text-sm font-semibold bg-ctp-blue text-ctp-crust hover:bg-ctp-blue/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        disabled={$rpcRunning === false}
        onclick={handleSend}
      >
        {$isStreaming ? 'Queue' : 'Send'}
      </button>
    </div>

    <!-- Status Bar -->
    <div class="text-[10px] text-ctp-overlay0 mt-1.5 flex items-center gap-3 justify-between">
      <div class="flex items-center gap-3">
        <span>Enter to send · Shift+Enter for new line</span>
        {#if $isStreaming}
          <span>Streaming... messages will be queued</span>
        {/if}
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5">
          <div class="w-2 h-2 rounded-full transition-colors duration-300"
               style="background: {$rpcRunning ? '#a6e3a1' : '#6c7086'}"></div>
          <span>{$rpcRunning ? 'RPC: active' : 'RPC: idle'}</span>
        </div>
        <button
          class="px-3 py-1 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          class:bg-ctp-red/20={$rpcRunning}
          class:text-ctp-red={$rpcRunning}
          class:bg-ctp-surface0={$rpcRunning === false}
          class:text-ctp-overlay0={$rpcRunning === false}
          disabled={$activeSession === null}
          onclick={() => toggleRPC()}
        >
          {$rpcRunning ? 'Stop RPC' : 'Start RPC'}
        </button>
        {#if $isStreaming}
          <button
            class="px-3 py-1 rounded-md text-xs font-semibold bg-ctp-red/20 text-ctp-red hover:bg-ctp-red/30 transition-colors"
            onclick={abortRPC}
          >
            ⏹ Abort
          </button>
        {/if}
        {#if $activeSession && $rpcRunning}
          <button
            class="px-3 py-1 rounded-md text-xs font-semibold bg-ctp-red/20 text-ctp-red hover:bg-ctp-red/30 transition-colors"
            onclick={quitSession}
          >
            Quit Session
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
```

#### `AssistantBubble.svelte` — Streaming Assistant Messages

```svelte
<script>
  import { formatText, escapeHTML, highlightCode } from '$lib/utils/markdown.js';
  import { detectLanguageFromPath } from '$lib/utils/language.js';
  import ThinkingBlock from './ThinkingBlock.svelte';
  import ToolCallBlock from './ToolCallBlock.svelte';

  let { msg } = $props();

  // msg contains: text, thinking, toolCalls[], toolResults[]
  let rawText = $state(msg.rawText || '');
  let thinking = $state(msg.thinking || '');
  let toolCalls = $state(msg.toolCalls || []);
  let isStreaming = $state(msg.isStreaming || false);

  // Update if message is still streaming
  $effect(() => {
    if (msg.rawText !== rawText) rawText = msg.rawText;
    if (msg.thinking !== thinking) thinking = msg.thinking;
    if (msg.toolCalls) toolCalls = msg.toolCalls;
    isStreaming = msg.isStreaming || false;
  });
</script>

<div class="flex flex-col items-start animate-fadeIn">
  <div class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words max-w-[75%] assistant-bubble"
       style="background:color-mix(in srgb, #a6e3a1 20%, #313244); border-bottom-left-radius: 4px;">

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
```

#### `ThinkingBlock.svelte`

```svelte
<script>
  let { content } = $props();
  let collapsed = $state(true);

  function toggle() {
    collapsed = !collapsed;
  }
</script>

<div class="rounded-lg overflow-hidden border border-ctp-surface0 mb-2"
     style="background:color-mix(in srgb, #cba6f7 8%, #313244)">
  <button
    class="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer"
    onclick={toggle}
  >
    <span class="transition-transform duration-200 text-[10px]"
          style="transform: {collapsed ? '' : 'rotate(90deg)'}">▶</span>
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
```

#### `ToolCallBlock.svelte`

```svelte
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

<div class="rounded-lg overflow-hidden border border-ctp-surface0 mb-2"
     style="background:color-mix(in srgb, #fab387 10%, #313244)">
  <button
    class="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer"
    onclick={toggle}
  >
    <span class="transition-transform duration-200 text-[10px]"
          style="transform: {collapsed ? '' : 'rotate(90deg)'}">▶</span>
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
```

#### `ToolResultBlock.svelte`

```svelte
<script>
  import { escapeHTML, highlightCode } from '$lib/utils/markdown.js';
  import { detectLanguageFromPath } from '$lib/utils/language.js';
  import { unescapeJsonString } from '$lib/utils/json.js';

  let { msg } = $props();
  let collapsed = $state(msg.toolName !== 'bash'); // bash results start expanded
  let isError = $state(msg.isError || false);
  let content = $state(unescapeJsonString(msg.content || '(no output)'));

  // Detect language for read tool
  let highlighted = $state(false);
  let contentHTML = $state(escapeHTML(content));

  $effect(() => {
    if (msg.toolName === 'read') {
      const lang = detectLanguageFromPath(msg.filePath || '');
      if (lang) {
        contentHTML = highlightCode(content, lang);
        highlighted = true;
      }
    }
  });

  function toggle() {
    collapsed = !collapsed;
  }
</script>

<div class="flex flex-col items-start animate-fadeIn w-full">
  <div class="w-full max-w-[85%] rounded-xl overflow-hidden border border-ctp-surface0"
       style="border-color: {isError ? '#f38ba8' : '#585b70'}">
    <button
      class="w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer"
      style="background: {isError
        ? 'color-mix(in srgb, #f38ba8 15%, #313244)'
        : 'color-mix(in srgb, #f9e2af 15%, #313244)'}"
      onclick={toggle}
    >
      <span class="transition-transform duration-200 text-[10px]"
            style="transform: {collapsed ? '' : 'rotate(90deg)'}">▶</span>
      <span>📎</span>
      <span class="font-semibold {isError ? 'text-ctp-red' : 'text-ctp-yellow'}">{escapeHTML(msg.toolName)}</span>
      {#if isError}
        <span class="text-ctp-red text-[10px] ml-auto">Error</span>
      {:else}
        <span class="text-ctp-overlay0 text-[10px] ml-auto">Result</span>
      {/if}
    </button>
    <div class="border-t border-ctp-surface0" class:hidden={collapsed}>
      <div class="p-3 text-xs overflow-x-auto" style="background:color-mix(in srgb, #1e1e2e 50%, #11111b);">
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
```

#### `NewSessionModal.svelte`

```svelte
<script>
  import { newSessionModalOpen } from '$lib/stores/ui.svelte.js';
  import { createSession } from '$lib/api/sessions.js';
  import { selectSession } from '$lib/actions/session.js';
  import { fetchSessions } from '$lib/api/sessions.js';

  let cwd = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleCreate() {
    if (!cwd.trim()) {
      error = 'Please enter a working directory';
      return;
    }
    loading = true;
    error = '';
    try {
      const data = await createSession(cwd.trim());
      newSessionModalOpen.set(false);
      // Refresh session list
      const sessions = await fetchSessions();
      // Auto-select new session
      if (data.session_id) {
        setTimeout(() => selectSession(data.session_id), 500);
      }
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function close() {
    newSessionModalOpen.set(false);
    cwd = '';
    error = '';
  }
</script>

{#if $newSessionModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={close}></div>
    <div class="relative bg-ctp-mantle border border-ctp-surface0 rounded-2xl shadow-2xl w-[440px] max-w-[90vw] animate-fadeIn overflow-hidden">
      <!-- Header -->
      <div class="px-6 pt-5 pb-4 border-b border-ctp-surface0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-ctp-blue/20 flex items-center justify-center">
              <span class="text-sm">⚡</span>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-ctp-text">New Session</h3>
              <p class="text-[11px] text-ctp-overlay0 mt-0.5">Create a new agent session</p>
            </div>
          </div>
          <button class="text-ctp-overlay0 hover:text-ctp-text transition-colors p-1 rounded-md hover:bg-ctp-surface0" onclick={close}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="px-6 py-5">
        <label class="text-xs font-medium text-ctp-text block mb-2">Working Directory</label>
        <input
          type="text"
          bind:value={cwd}
          class="w-full px-3.5 py-2.5 bg-ctp-crust border border-ctp-surface0 rounded-lg text-ctp-text text-sm font-mono focus:outline-none focus:border-ctp-blue focus:ring-2 focus:ring-ctp-blue/20 placeholder:text-ctp-overlay0 transition-all"
          onkeydown={e => e.key === 'Enter' && handleCreate()}
        />
        <p class="text-[11px] text-ctp-overlay0 mt-2">Enter the project directory path to start a new agent session.</p>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-ctp-surface0 flex justify-end gap-2">
        <button class="px-4 py-2 rounded-lg text-xs font-medium text-ctp-overlay0 bg-ctp-surface0 hover:bg-ctp-surface1 hover:text-ctp-text transition-all" onclick={close}>
          Cancel
        </button>
        <button
          class="px-4 py-2 rounded-lg text-xs font-semibold bg-ctp-blue text-ctp-crust hover:bg-ctp-blue/80 transition-all shadow-lg shadow-ctp-blue/20"
          disabled={loading}
          onclick={handleCreate}
        >
          {loading ? 'Creating...' : 'Create & Start'}
        </button>
      </div>

      <!-- Error -->
      {#if error}
        <div class="px-6 pb-4">
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-ctp-red"
               style="background:color-mix(in srgb, #f38ba8 10%, #1e1e2e)">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
```

#### `HeaderBar.svelte`

```svelte
<script>
  import { wsConnected } from '$lib/stores/ws.svelte.js';
  import { activeSession } from '$lib/stores/session.svelte.js';
  import { sidebarOpen } from '$lib/stores/ui.svelte.js';
  import { quitSession } from '$lib/actions/session.js';

  let sessionInfo = $state(null);

  $effect(() => {
    // Fetch session info when active session changes
    const id = $activeSession;
    if (id) {
      fetch(`/api/sessions/${id}`)
        .then(r => r.json())
        .then(data => { sessionInfo = data; })
        .catch(() => { sessionInfo = null; });
    } else {
      sessionInfo = null;
    }
  });
</script>

<div class="px-5 py-2.5 border-b border-ctp-surface0 flex items-center gap-3 bg-ctp-mantle flex-wrap">
  <div class="w-2 h-2 rounded-full transition-colors duration-300"
       style="background: {$wsConnected ? '#a6e3a1' : '#f38ba8'}"></div>
  <span class="text-sm text-ctp-overlay0 shrink-0">{$wsConnected ? 'Connected' : 'Disconnected'}</span>

  <div class="flex-1 min-w-0 overflow-hidden flex items-center gap-2">
    {#if sessionInfo}
      {#if sessionInfo.project}
        <span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap"
              style="background:color-mix(in srgb, #cba6f7 20%, transparent); color:#cba6f7">
          {sessionInfo.project}
        </span>
      {/if}
      {#if sessionInfo.cwd}
        <span class="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap text-ctp-overlay0"
              style="background:color-mix(in srgb, #585b70 20%, transparent)">
          {sessionInfo.cwd.length > 50 ? '...' + sessionInfo.cwd.slice(-47) : sessionInfo.cwd}
        </span>
      {/if}
      {#if sessionInfo.line_count}
        <span class="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap text-ctp-overlay0"
              style="background:color-mix(in srgb, #585b70 20%, transparent)">
          {sessionInfo.line_count} lines
        </span>
      {/if}
    {:else if $activeSession}
      <span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap"
            style="background:color-mix(in srgb, #cba6f7 20%, transparent); color:#cba6f7">
        {$activeSession.substring(0, 12)}...
      </span>
    {/if}
  </div>

  {#if sessionInfo?.model}
    <span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap"
          style="background:color-mix(in srgb, #89b4fa 20%, transparent); color:#89b4fa">
      {sessionInfo.model}
    </span>
  {/if}

  {#if $activeSession}
    <button
      class="px-3 py-1 rounded-md text-xs font-semibold bg-ctp-red/20 text-ctp-red hover:bg-ctp-red/30 transition-colors"
      onclick={quitSession}
    >
      Quit Session
    </button>
  {/if}

  <!-- Mobile hamburger -->
  <button
    class="md:hidden absolute top-2.5 left-2.5 z-30 p-1.5 rounded-md bg-ctp-surface0 text-ctp-text hover:bg-ctp-surface1"
    onclick={() => sidebarOpen.update(v => !v)}
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
    </svg>
  </button>
</div>
```

### 3.5 Actions (Business Logic)

**`src/lib/actions/session.js`**

```js
import { activeSession, sessions } from '$lib/stores/session.svelte.js';
import { rpcRunning } from '$lib/stores/rpc.svelte.js';
import { messages } from '$lib/stores/messages.svelte.js';
import { sidebarOpen } from '$lib/stores/ui.svelte.js';
import { fetchSession, fetchSessions } from '$lib/api/sessions.js';
import { stopRPC } from '$lib/api/rpc.js';

export async function selectSession(id) {
  // Close sidebar on mobile
  if (window.innerWidth <= 768) {
    sidebarOpen.set(false);
  }

  // Stop previous RPC if switching sessions
  if ($rpcRunning && $activeSession && $activeSession !== id) {
    try { await stopRPC($activeSession); } catch {}
  }

  activeSession.set(id);

  // Fetch session info
  try {
    const info = await fetchSession(id);
    // Store info for header display
  } catch {}

  // Clear chat
  messages.set([]);

  // Subscribe to WebSocket
  // (handled by ws store effect)
}

export async function quitSession() {
  if (!$activeSession) return;
  if (!confirm('Quit this session? This will stop the RPC process.')) return;

  try { await stopRPC($activeSession); } catch {}

  activeSession.set(null);
  messages.set([]);
}

export async function refreshSessions() {
  try {
    const list = await fetchSessions();
    sessions.set(list);
  } catch (e) {
    console.error('Failed to refresh sessions:', e);
  }
}
```

**`src/lib/actions/rpc.js`**

```js
import { activeSession } from '$lib/stores/session.svelte.js';
import { rpcRunning, isStreaming } from '$lib/stores/rpc.svelte.js';
import { messages } from '$lib/stores/messages.svelte.js';
import { startRPC, stopRPC, sendRPC } from '$lib/api/rpc.js';
import { addSystemMessage } from '$lib/utils/events.js';

export async function toggleRPC() {
  if (!$activeSession) return;

  if ($rpcRunning) {
    try {
      await stopRPC($activeSession);
      rpcRunning.set(false);
    } catch (e) {
      console.error('RPC stop error:', e);
    }
  } else {
    try {
      await startRPC($activeSession);
      rpcRunning.set(true);
    } catch (e) {
      addSystemMessage('Failed to start RPC: ' + e.message);
    }
  }
}

export async function abortRPC() {
  if (!$activeSession || !$rpcRunning) return;
  try {
    await sendRPC($activeSession, { type: 'abort' });
  } catch (e) {
    console.error('Abort error:', e);
  }
}

export async function sendMessage(text) {
  if (!text || !$rpcRunning) return;

  const cmd = { type: 'prompt', message: text };
  if ($isStreaming) cmd.streamingBehavior = 'steer';

  try {
    await sendRPC($activeSession, cmd);
  } catch (e) {
    addSystemMessage('Failed to send: ' + e.message);
  }
}
```

### 3.6 Event Processing (Replaces `chat.js` message handling)

**`src/lib/utils/events.js`**

```js
import { messages } from '$lib/stores/messages.svelte.js';
import { activeSession, sessions } from '$lib/stores/session.svelte.js';
import { isStreaming, rpcRunning } from '$lib/stores/rpc.svelte.js';
import { refreshSessions } from '$lib/actions/session.js';

// Deduplication
const seenEvents = new Set();

export function onWSMessage(msg) {
  const data = msg.data;
  if (!data || !data.type) return;

  // Session list update
  if (data.type === 'session') {
    refreshSessions();
    return;
  }

  // Filter by active session
  if ($activeSession && msg.session_id !== $activeSession) return;

  // Deduplicate
  if (data.id && seenEvents.has(data.id)) return;
  if (data.id) seenEvents.add(data.id);

  switch (data.type) {
    case 'agent_start':
    case 'turn_start':
      isStreaming.set(true);
      break;

    case 'agent_end':
      isStreaming.set(false);
      break;

    case 'message_update': {
      const ev = data.assistantMessageEvent;
      if (!ev) break;
      appendToCurrentAssistant(ev);
      break;
    }

    case 'message_end': {
      const msg = data.message;
      if (msg?.role === 'user') {
        addUserMessage(msg.content);
      } else if (msg?.role === 'toolResult') {
        addToolResult(msg);
      }
      break;
    }

    case 'message':
      renderLegacyMessage(data);
      break;
  }
}

function addUserMessage(content) {
  const text = typeof content === 'string' ? content : extractText(content);
  if (!text) return;

  messages.update(msgs => [...msgs, {
    id: crypto.randomUUID(),
    role: 'user',
    content: text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }]);
}

let currentAssistantId = null;

function appendToCurrentAssistant(ev) {
  if (ev.type === 'text_delta') {
    if (!currentAssistantId) {
      // Create new assistant message
      const id = crypto.randomUUID();
      currentAssistantId = id;
      messages.update(msgs => [...msgs, {
        id,
        role: 'assistant',
        rawText: ev.delta,
        thinking: '',
        toolCalls: [],
        isStreaming: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    } else {
      // Append to existing
      messages.update(msgs => msgs.map(m => {
        if (m.id === currentAssistantId) {
          return { ...m, rawText: (m.rawText || '') + ev.delta, isStreaming: true };
        }
        return m;
      }));
    }
  } else if (ev.type === 'thinking_delta') {
    messages.update(msgs => msgs.map(m => {
      if (m.id === currentAssistantId) {
        return { ...m, thinking: (m.thinking || '') + ev.delta };
      }
      return m;
    }));
  } else if (ev.type === 'toolcall_start') {
    messages.update(msgs => msgs.map(m => {
      if (m.id === currentAssistantId) {
        return {
          ...m,
          toolCalls: [...(m.toolCalls || []), {
            id: ev.toolCall?.id || '',
            name: ev.toolCall?.name || 'unknown',
            arguments: {},
          }],
        };
      }
      return m;
    }));
  } else if (ev.type === 'toolcall_end') {
    messages.update(msgs => msgs.map(m => {
      if (m.id === currentAssistantId) {
        return {
          ...m,
          toolCalls: (m.toolCalls || []).map(tc =>
            tc.id === ev.toolCall?.id
              ? { ...tc, arguments: ev.toolCall?.arguments || {} }
              : tc
          ),
        };
      }
      return m;
    }));
  } else if (ev.type === 'done') {
    isStreaming.set(false);
    currentAssistantId = null;
  }
}

function addToolResult(msg) {
  messages.update(msgs => [...msgs, {
    id: crypto.randomUUID(),
    role: 'toolResult',
    toolName: msg.toolName || 'unknown',
    content: msg.content || '',
    isError: msg.isError || false,
    toolCallId: msg.toolCallId || '',
    filePath: extractFilePath(msg),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }]);
}

function renderLegacyMessage(data) {
  // ... same logic as current chat.js renderLegacyMessage
  // but pushes to messages store instead of DOM manipulation
}

export function addSystemMessage(text) {
  messages.update(msgs => [...msgs, {
    id: crypto.randomUUID(),
    role: 'system',
    content: text,
  }]);
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(c => c.type === 'text')
      .map(c => typeof c.text === 'string' ? c.text : String(c.text ?? ''))
      .join('');
  }
  return '';
}

function extractFilePath(msg) {
  // Extract file path from tool result for syntax highlighting
  // ...
  return '';
}
```

---

## Phase 4: Tailwind Configuration

### 4.1 Tailwind Config (Catppuccin Theme)

**`frontend/src/app.css`** (or `tailwind.config.js` for v4)

```css
@import "tailwindcss";

@theme {
  --color-ctp-base: #1e1e2e;
  --color-ctp-mantle: #181825;
  --color-ctp-crust: #11111b;
  --color-ctp-surface0: #313244;
  --color-ctp-surface1: #45475a;
  --color-ctp-surface2: #585b70;
  --color-ctp-overlay0: #6c7086;
  --color-ctp-overlay1: #7f849c;
  --color-ctp-subtext0: #a6adc8;
  --color-ctp-text: #cdd6f4;
  --color-ctp-lavender: #b4befe;
  --color-ctp-blue: #89b4fa;
  --color-ctp-sky: #89dceb;
  --color-ctp-teal: #94e2d5;
  --color-ctp-green: #a6e3a1;
  --color-ctp-yellow: #f9e2af;
  --color-ctp-peach: #fab387;
  --color-ctp-maroon: #eba0ac;
  --color-ctp-red: #f38ba8;
  --color-ctp-mauve: #cba6f7;
  --color-ctp-pink: #f5c2e7;
  --color-ctp-flamingo: #f2cdcd;
  --color-ctp-rosewater: #f5e0dc;

  --font-family-sans: "JetBrains Mono", monospace;
  --font-family-mono: "JetBrains Mono", monospace;

  --animate-fade-in: fadeIn 0.2s ease;
  --animate-pulse-slow: pulse 1.5s ease-in-out infinite;

  @keyframes fadeIn {
    0% { opacity: 0; transform: translateY(-4px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
}
```

### 4.2 Global Styles

**`frontend/src/app.css`** — add scrollbar and markdown prose styles:

```css
/* Custom scrollbar */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #313244; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #45475a; }

/* Markdown prose (same as current .prose-markdown) */
.prose-markdown { font-size: 13px; line-height: 1.7; color: #cdd6f4; }
.prose-markdown p { margin: 0 0 0.6em 0; }
.prose-markdown p:last-child { margin-bottom: 0; }
.prose-markdown strong { color: #f5e0dc; font-weight: 600; }
.prose-markdown em { color: #f2cdcd; font-style: italic; }
.prose-markdown a { color: #89b4fa; text-decoration: underline; text-underline-offset: 2px; }
.prose-markdown h1, .prose-markdown h2, .prose-markdown h3, .prose-markdown h4 {
  margin: 1em 0 0.4em; font-weight: 700; color: #cba6f7;
}
.prose-markdown h1 { font-size: 1.4em; border-bottom: 1px solid #313244; padding-bottom: 0.3em; }
.prose-markdown h2 { font-size: 1.2em; border-bottom: 1px solid #313244; padding-bottom: 0.25em; }
.prose-markdown h3 { font-size: 1.05em; }
.prose-markdown code {
  font-size: 0.88em; padding: 0.15em 0.4em; border-radius: 4px;
  background: #181825; color: #fab387;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
}
.prose-markdown pre {
  margin: 0.6em 0; padding: 0.75em 1em; border-radius: 8px;
  background: #11111b; border: 1px solid #313244; overflow-x: auto;
}
.prose-markdown pre code { padding: 0; background: transparent; color: #cdd6f4; font-size: 0.85em; line-height: 1.6; }
.prose-markdown blockquote {
  margin: 0.6em 0; padding: 0.4em 1em; border-left: 3px solid #cba6f7;
  background: color-mix(in srgb, #cba6f7 8%, #1e1e2e);
  border-radius: 0 6px 6px 0; color: #a6adc8;
}
.prose-markdown ul { margin: 0.4em 0; padding-left: 1.4em; list-style: disc; }
.prose-markdown ol { margin: 0.4em 0; padding-left: 1.4em; list-style: decimal; }
.prose-markdown li { margin: 0.15em 0; padding-left: 0.2em; }
.prose-markdown li::marker { color: #7f849c; }
.prose-markdown table { margin: 0.6em 0; width: 100%; border-collapse: collapse; font-size: 0.92em; }
.prose-markdown th {
  text-align: left; padding: 0.4em 0.7em; background: #181825;
  color: #cba6f7; font-weight: 600; border: 1px solid #313244;
}
.prose-markdown td { padding: 0.4em 0.7em; border: 1px solid #313244; }
.prose-markdown tr:nth-child(even) td {
  background: color-mix(in srgb, #313244 30%, #1e1e2e);
}

/* highlight.js overrides */
.hljs { background: transparent !important; padding: 0 !important; }
pre .hljs { background: #11111b !important; padding: 0.75em 1em !important; border-radius: 6px; border: 1px solid #313244; }
```

---

## Phase 5: Go Server Changes

### 5.1 Remove HTMX Fragment Handler

**`internal/server/server.go`** — remove:

```go
// REMOVE:
var sessionsTemplate = template.Must(template.New("sessions").Parse(`...`))

mux.HandleFunc("/sessions", s.handleSessionsHTML)
```

The `/sessions` HTML fragment endpoint is no longer needed — the Svelte app will fetch `/api/sessions` (JSON) directly.

### 5.2 Update Static File Serving

**`internal/server/server.go`** — update the `//go:embed` and static serving:

```go
//go:embed static/dist/*
var staticFS embed.FS

// In Start():
staticSub, err := fs.Sub(staticFS, "static/dist")
if err == nil {
    // SPA file server with fallback
    mux.Handle("/", spaHandler(http.FS(staticSub)))
}
```

Add an SPA handler:

```go
// spaHandler serves the Svelte SPA with index.html fallback for client-side routing
func spaHandler(fileSystem fs.FS) http.Handler {
    index, err := fs.ReadFile(fileSystem, "index.html")
    if err != nil {
        log.Fatalf("failed to read index.html: %v", err)
    }

    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Try to serve the requested file
        path := filepath.Join(".", r.URL.Path)
        f, err := fileSystem.Open(path)
        if err == nil {
            f.Close()
            http.FileServer(http.FS(fileSystem)).ServeHTTP(w, r)
            return
        }

        // Fallback to index.html for SPA routing
        w.Header().Set("Content-Type", "text/html; charset=utf-8")
        w.Write(index)
    })
}
```

### 5.3 Remove Unused Imports

Remove `html/template` import since `sessionsTemplate` is removed.

---

## Phase 6: Build Pipeline

### 6.1 Updated Makefile

```makefile
.PHONY: build run test clean frontend frontend-build frontend-dev frontend-deps

BINARY = bin/server
GOCACHE ?= /tmp/go-cache

build: frontend-deps frontend-build
	GOCACHE=$(GOCACHE) go build -buildvcs=false -o $(BINARY) ./cmd/server/

run: build
	$(BINARY)

run-debug: frontend-deps frontend-build
	GOCACHE=$(GOCACHE) go run -buildvcs=false ./cmd/server/ -addr :8080

frontend:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

frontend-deps:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev -- --host

test:
	GOCACHE=$(GOCACHE) go test -buildvcs=false ./...

clean:
	rm -rf bin/
	cd frontend && rm -rf dist/ node_modules/
```

### 6.2 .gitignore Updates

```gitignore
# Frontend
frontend/node_modules/
frontend/dist/
frontend/.svelte-kit/

# Go
bin/
```

---

## Phase 7: Development Workflow

### 7.1 Dev Mode (Hot Reload)

**Option A: Separate servers (recommended for dev)**

```bash
# Terminal 1: Go API server
make run-debug   # Runs on :8080

# Terminal 2: Svelte dev server (Vite proxy)
cd frontend && npm run dev -- --host
```

Configure Vite proxy so API calls go to Go:

```js
// frontend/vite.config.js
export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
```

**Option B: Go serves Svelte dev build**

```js
// frontend/vite.config.js — output to Go's static dir
build: {
  outDir: '../internal/server/static/dist',
  emptyOutDir: true,
},
```

Then run `make run-debug` and Svelte rebuilds on every save.

### 7.2 Production Build

```bash
make build
# 1. npm install in frontend/
# 2. npm run build in frontend/ → outputs to internal/server/static/dist/
# 3. go build → embeds dist/ via go:embed
```

---

## Phase 8: Migration Checklist

### Backend (Go) — Minimal Changes

- [ ] Remove `sessionsTemplate` (HTMX HTML fragment)
- [ ] Remove `/sessions` endpoint
- [ ] Update `//go:embed` to target `static/dist/*`
- [ ] Add SPA fallback handler
- [ ] Remove `html/template` import
- [ ] Test all REST API endpoints still work
- [ ] Test WebSocket connection still works

### Frontend (Svelte) — Full Rewrite

- [ ] Initialize Svelte + Vite + Tailwind project
- [ ] Configure Tailwind with Catppuccin theme
- [ ] Create stores (session, ws, rpc, messages, ui)
- [ ] Create API client modules (sessions.js, rpc.js, websocket.js)
- [ ] Create utility modules (markdown.js, scroll.js, format.js, language.js, json.js)
- [ ] Create `Sidebar.svelte` component
- [ ] Create `ChatArea.svelte` component
- [ ] Create `MessageBubble.svelte` component
- [ ] Create `AssistantBubble.svelte` component
- [ ] Create `ThinkingBlock.svelte` component
- [ ] Create `ToolCallBlock.svelte` component
- [ ] Create `ToolResultBlock.svelte` component
- [ ] Create `HeaderBar.svelte` component
- [ ] Create `NewSessionModal.svelte` component
- [ ] Create `ScrollDownButton.svelte` component
- [ ] Create `LoadingIndicator.svelte` component
- [ ] Create action modules (session.js, rpc.js)
- [ ] Create event processing module (events.js)
- [ ] Create `+layout.svelte` (root layout)
- [ ] Create `+page.svelte` (main page)
- [ ] Create `app.html` (HTML shell with font imports)
- [ ] Create `app.css` (global styles + markdown prose)
- [ ] Test session list loads and updates
- [ ] Test session selection
- [ ] Test new session creation
- [ ] Test RPC start/stop
- [ ] Test message sending
- [ ] Test streaming message rendering
- [ ] Test thinking blocks
- [ ] Test tool call blocks
- [ ] Test tool result blocks with syntax highlighting
- [ ] Test WebSocket reconnection
- [ ] Test mobile responsive layout
- [ ] Test scroll-to-bottom button
- [ ] Test keyboard shortcuts (Enter to send, Shift+Enter for newline)

---

## Phase 9: File Removal

After migration is complete, delete the old frontend files:

```
internal/server/static/
├── index.html          ← DELETE
├── app.js              ← DELETE
├── chat.js             ← DELETE
├── rpc.js              ← DELETE
├── session.js          ← DELETE
├── state.js            ← DELETE
├── ui.js               ← DELETE
├── utils.js            ← DELETE
└── ws.js               ← DELETE
```

The `static/` directory should only contain the `dist/` subdirectory (built by Vite).

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Svelte reactivity doesn't match current behavior | Thoroughly test streaming, dedup, scroll tracking |
| Markdown rendering differs | Use same `marked` + `highlight.js` libs, copy CSS exactly |
| WebSocket reconnection logic breaks | Extract and reuse current `ws.js` logic into Svelte store |
| Go embed path breaks | Test `go build` + `go run` locally before committing |
| Performance regression | Svelte should be faster; profile if needed |
| Bundle size too large | Tree-shake highlight.js languages; lazy-load if needed |

---

## Estimated Effort

| Phase | Effort | Notes |
|-------|--------|-------|
| 1: Project Setup | 1-2 hours | Svelte init, Tailwind config, Vite config |
| 2: Directory Structure | 0.5 hours | Create folders, type definitions |
| 3: Components | 8-12 hours | 10+ components, stores, actions, utils |
| 4: Tailwind Config | 1-2 hours | Catppuccin theme, prose styles, scrollbar |
| 5: Go Server Changes | 1-2 hours | Remove HTMX, add SPA handler |
| 6: Build Pipeline | 1 hour | Makefile, .gitignore, proxy config |
| 7: Dev Workflow | 0.5 hours | Vite proxy, hot reload setup |
| 8: Testing | 4-6 hours | End-to-end testing of all features |
| 9: Cleanup | 0.5 hours | Delete old files |
| **Total** | **~18-26 hours** | |

---

## Summary

This migration replaces the vanilla JS + HTMX frontend with a **Svelte SPA** while keeping the **Go backend completely intact** (same API, same WebSocket, same RPC management). The Go server simply serves a different set of static files — the compiled Svelte app instead of the current JS modules. All business logic moves from inline DOM manipulation to **Svelte stores and reactive components**, making the code more maintainable, testable, and performant.
