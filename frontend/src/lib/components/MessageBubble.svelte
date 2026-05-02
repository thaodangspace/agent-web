<script>
  import { formatText } from '$lib/utils/markdown.js';

  let { msg } = $props();
</script>

<div class="flex flex-col items-end animate-fadeIn">
  <div
    class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words max-w-[75%] message-bubble"
    style="background:color-mix(in srgb, #89b4fa 25%, #313244); border-bottom-right-radius: 4px;"
  >
    <div class="prose-markdown">{@html formatText(msg.content)}</div>
  </div>
  <div class="text-[10px] text-ctp-overlay0 mt-0.5 px-1 text-right">{msg.timestamp}</div>
</div>
