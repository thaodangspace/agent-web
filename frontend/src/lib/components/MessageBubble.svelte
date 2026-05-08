<script>
  import { formatText } from '$lib/utils/markdown.js';
  import { extractImagePaths, stripImageBoilerplate } from '$lib/utils/images.js';
  import { imageViewUrl } from '$lib/api/rpc.js';

  let { msg } = $props();

  // Support both string content and array content blocks
  let rawContent = $derived(
    typeof msg.content === 'string' ? msg.content : 
    Array.isArray(msg.content) ? msg.content.filter(c => c.type === 'text').map(c => c.text || '').join('') : ''
  );

  // Detect local image paths in the text and strip boilerplate
  let localImagePaths = $derived(extractImagePaths(rawContent));
  let displayContent = $derived(stripImageBoilerplate(rawContent));

  // Also support legacy base64 images from content blocks or msg.images
  let contentImages = $derived(
    Array.isArray(msg.content) ? msg.content.filter(c => c.type === 'image') : []
  );
  let legacyImages = $derived(
    msg.images
      ? [...contentImages, ...msg.images].filter(img => {
          if (img.type === 'image') {
            return img.data && img.mimeType && img.data.length > 0;
          }
          return img && typeof img === 'string' && img.length > 0;
        })
      : contentImages.filter(img => img.data && img.mimeType && img.data.length > 0)
  );

  let hasImages = $derived(localImagePaths.length > 0 || legacyImages.length > 0);
</script>

<div class="flex flex-col items-end animate-fadeIn">
  {#if hasImages}
    <div class="flex flex-wrap gap-2 mb-2 max-w-[75%] justify-end">
      <!-- Local file images served via API -->
      {#each localImagePaths as path}
        <img
          src={imageViewUrl(path)}
          alt=""
          class="max-w-48 max-h-48 rounded-lg object-contain border border-ctp-surface0 cursor-pointer hover:opacity-90 transition-opacity"
          loading="lazy"
        />
      {/each}
      <!-- Legacy base64 images -->
      {#each legacyImages as img}
        <img
          src={img.type === 'image' ? `data:${img.mimeType};base64,${img.data}` : img}
          alt=""
          class="max-w-48 max-h-48 rounded-lg object-contain border border-ctp-surface0"
        />
      {/each}
    </div>
  {/if}
  {#if displayContent}
    <div
      class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words max-w-[75%] message-bubble"
      style="background:color-mix(in srgb, #89b4fa 25%, #313244); border-bottom-right-radius: 4px;"
    >
      <div class="prose-markdown">{@html formatText(displayContent)}</div>
    </div>
  {/if}
  <div class="text-[10px] text-ctp-overlay0 mt-0.5 px-1 text-right">{msg.timestamp}</div>
</div>
