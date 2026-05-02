<script>
  import { newSessionModalOpen } from '$lib/stores/ui.svelte.js';
  import { createSession, fetchSessions } from '$lib/api/sessions.js';
  import { selectSession } from '$lib/actions/session.js';

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
      await fetchSessions().then(list => {
        // Import sessions store dynamically
        import('$lib/stores/session.svelte.js').then(({ sessions }) => {
          sessions.set(list);
        });
      });
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
          <button
            class="text-ctp-overlay0 hover:text-ctp-text transition-colors p-1 rounded-md hover:bg-ctp-surface0"
            onclick={close}
          >
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
        <button
          class="px-4 py-2 rounded-lg text-xs font-medium text-ctp-overlay0 bg-ctp-surface0 hover:bg-ctp-surface1 hover:text-ctp-text transition-all"
          onclick={close}
        >
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
          <div
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-ctp-red"
            style="background:color-mix(in srgb, #f38ba8 10%, #1e1e2e)"
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
