<script>
  import { onMount } from 'svelte';
  import { connectWS } from '$lib/api/websocket.js';
  import { fetchSessions } from '$lib/api/sessions.js';
  import { sessions } from '$lib/stores/session.svelte.js';
  import { sidebarOpen, newSessionModalOpen } from '$lib/stores/ui.svelte.js';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import HeaderBar from '$lib/components/HeaderBar.svelte';
  import ChatArea from '$lib/components/ChatArea.svelte';
  import NewSessionModal from '$lib/components/NewSessionModal.svelte';

  let isMobile = $state(false);

  onMount(() => {
    // Check if mobile
    isMobile = window.innerWidth <= 768;

    // Listen for resize
    const handleResize = () => {
      isMobile = window.innerWidth <= 768;
    };
    window.addEventListener('resize', handleResize);

    // Connect WebSocket
    connectWS();

    // Fetch initial session list
    fetchSessions()
      .then(list => sessions.set(list))
      .catch(e => console.error('Failed to fetch sessions:', e));

    // Refresh sessions periodically
    const interval = setInterval(() => {
      fetchSessions()
        .then(list => sessions.set(list))
        .catch(() => {});
    }, 5000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', handleResize);
    };
  });

  function showNewSessionModal() {
    newSessionModalOpen.set(true);
  }
</script>

<div class="flex h-screen">
  <!-- Sidebar overlay (mobile) -->
  {#if isMobile}
    <div
      class="sidebar-overlay"
      class:hidden={!$sidebarOpen}
      onclick={() => sidebarOpen.set(false)}
    ></div>
  {/if}

  <!-- Sidebar -->
  <div
    class="sidebar"
    class:hidden={isMobile && !$sidebarOpen}
  >
    <Sidebar onNewSession={showNewSessionModal} />
  </div>

  <!-- Main -->
  <div class="flex-1 flex flex-col main-content">
    <HeaderBar />
    <ChatArea />
  </div>

  <!-- New Session Modal -->
  <NewSessionModal />
</div>

<style>
  @media (min-width: 769px) {
    .sidebar {
      position: relative !important;
      left: 0 !important;
    }
    .sidebar-overlay {
      display: none !important;
    }
  }
</style>
