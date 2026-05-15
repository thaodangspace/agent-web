<script>
  import { formatText } from '$lib/utils/markdown.js';
  import { extractImagePaths, stripImageBoilerplate } from '$lib/utils/images.js';
  import { imageViewUrl } from '$lib/api/rpc.js';
  import ImageViewer from './ImageViewer.svelte';

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

  // Build unified image list for viewer
  let imageList = $derived([
    ...localImagePaths.map(path => ({ src: imageViewUrl(path) })),
    ...legacyImages.map(img => ({
      src: img.type === 'image' ? `data:${img.mimeType};base64,${img.data}` : img
    }))
  ]);
  let hasImages = $derived(imageList.length > 0);

  let showViewer = $state(false);
  let viewerStartIndex = $state(0);

  function openViewer(index) {
    viewerStartIndex = index;
    showViewer = true;
  }
</script>

<div class="flex flex-col items-end animate-fadeIn">
  {#if hasImages}
    <div class="flex flex-wrap gap-2 mb-2 max-w-[75%] justify-end">
      {#each imageList as img, i}
        <img
          src={img.src}
          alt=""
          class="max-w-48 max-h-48 rounded-lg object-contain border border-ctp-crust cursor-pointer hover:opacity-90 transition-opacity"
          loading="lazy"
          onclick={() => openViewer(i)}
        />
      {/each}
    </div>
  {/if}
  {#if displayContent}
    <div
      class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words max-w-[75%] message-bubble"
      style="background:color-mix(in srgb, #036aca 10%, #ffffff); border-bottom-right-radius: 4px;"
    >
      <div class="prose-markdown">{@html formatText(displayContent)}</div>
    </div>
  {/if}
  <div class="text-[10px] text-ctp-overlay0 mt-0.5 px-1 text-right">{msg.timestamp}</div>
</div>

{#if showViewer}
  <ImageViewer images={imageList} startIndex={viewerStartIndex} onClose={() => showViewer = false} />
{/if}
