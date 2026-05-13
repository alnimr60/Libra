import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { pdfjs } from '../lib/pdf';
import { useMotionValueEvent } from 'motion/react';

// --- TILE ENGINE CONSTANTS ---
const TILE_SIZE = 512;
const MAX_CACHE_MB = 450;
const MAX_CONCURRENT_RENDERS = 2;

// --- TILE ENGINE CLASSES ---

class TileLRUCache {
  private cache = new Map<string, { bitmap: ImageBitmap, size: number }>();
  private order: string[] = [];
  private currentSizeMB = 0;

  get(key: string) {
    const item = this.cache.get(key);
    if (item) {
      this.order = this.order.filter(k => k !== key);
      this.order.push(key);
      return item.bitmap;
    }
    return null;
  }

  set(key: string, bitmap: ImageBitmap) {
    const size = (bitmap.width * bitmap.height * 4) / (1024 * 1024);
    if (this.cache.has(key)) {
      this.currentSizeMB -= this.cache.get(key)!.size;
    }
    
    while (this.currentSizeMB + size > MAX_CACHE_MB && this.order.length > 0) {
      const oldestKey = this.order.shift()!;
      const oldestItem = this.cache.get(oldestKey);
      if (oldestItem) {
        this.currentSizeMB -= oldestItem.size;
        oldestItem.bitmap.close();
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { bitmap, size });
    this.order.push(key);
    this.currentSizeMB += size;
  }

  clear() {
    this.cache.forEach(item => item.bitmap.close());
    this.cache.clear();
    this.order = [];
    this.currentSizeMB = 0;
  }
}

const globalTileCache = new TileLRUCache();
const globalRenderQueue: { key: string, task: () => Promise<void> }[] = [];
let activeRenderCount = 0;

async function processQueue() {
  if (activeRenderCount >= MAX_CONCURRENT_RENDERS || globalRenderQueue.length === 0) return;
  activeRenderCount++;
  const item = globalRenderQueue.shift();
  if (!item) { activeRenderCount--; return; }
  try { await item.task(); } finally { activeRenderCount--; processQueue(); }
}

class PageTileRenderer {
  private tiles = new Map<string, HTMLCanvasElement>();
  private container: HTMLDivElement;
  private pdfPage: pdfjs.PDFPageProxy;
  private pageNumber: number;
  private logicalWidth: number;
  private logicalHeight: number;

  constructor(container: HTMLDivElement, pdfPage: pdfjs.PDFPageProxy, pageNumber: number, width: number, height: number) {
    this.container = container;
    this.pdfPage = pdfPage;
    this.pageNumber = pageNumber;
    this.logicalWidth = width;
    this.logicalHeight = height;
  }

  update(params: { scale: number, px: number, py: number, tier: number, version: number, vw: number, vh: number, pageOriginX: number, pageOriginY: number }) {
    const { scale, px, py, tier, version, vw, vh, pageOriginX, pageOriginY } = params;
    
    // We render tiles at the logical width/height of the page
    const cols = Math.ceil(this.logicalWidth / (TILE_SIZE / scale));
    const rows = Math.ceil(this.logicalHeight / (TILE_SIZE / scale));

    const visibleKeys = new Set<string>();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = c * (TILE_SIZE / scale);
        const ty = r * (TILE_SIZE / scale);

        // Visibility check: Map logical tile to reader viewport
        const tileLeft = px + pageOriginX + (tx * scale);
        const tileTop = py + pageOriginY + (ty * scale);
        
        if (tileLeft < vw && tileLeft + TILE_SIZE > 0 && tileTop < vh && tileTop + TILE_SIZE > 0) {
          const key = `${this.pageNumber}-${version}-${tier}-${r}-${c}`;
          visibleKeys.add(key);

          if (!this.tiles.has(key)) {
            this.createTile(key, r, c, tier, scale, tx, ty);
          }
        }
      }
    }

    this.tiles.forEach((canvas, key) => {
      if (!visibleKeys.has(key)) {
        canvas.remove();
        this.tiles.delete(key);
      }
    });
  }

  private async createTile(key: string, row: number, col: number, tier: number, currentScale: number, tx: number, ty: number) {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    canvas.className = 'absolute pointer-events-none';
    
    // Position tiles in logical pixels (1:1 with the container)
    canvas.style.left = `${tx}px`;
    canvas.style.top = `${ty}px`;
    canvas.style.width = `${TILE_SIZE / currentScale}px`;
    canvas.style.height = `${TILE_SIZE / currentScale}px`;
    
    this.container.appendChild(canvas);
    this.tiles.set(key, canvas);

    const cached = globalTileCache.get(key);
    const ctx = canvas.getContext('2d', { alpha: false })!;

    if (cached) {
      ctx.drawImage(cached, 0, 0);
      return;
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    globalRenderQueue.push({
      key,
      task: async () => {
        if (!this.tiles.has(key)) return;

        const viewport = this.pdfPage.getViewport({ scale: 1 });
        const fitScale = this.logicalWidth / viewport.width;
        
        // The render scale must be high enough for the current zoom + tier
        const renderScale = fitScale * tier;
        
        // offsetX/Y moves the PDF origin. We want to 'look' at the tile's location.
        // We must move the origin by the tile's logical position multiplied by the render scale.
        const renderViewport = this.pdfPage.getViewport({ 
          scale: renderScale,
          offsetX: -(tx * fitScale * tier),
          offsetY: -(ty * fitScale * tier),
        });

        const offscreen = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
        const offCtx = offscreen.getContext('2d', { alpha: false })!;
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

        await this.pdfPage.render({ canvasContext: offCtx as any, viewport: renderViewport }).promise;
        const bitmap = offscreen.transferToImageBitmap();
        globalTileCache.set(key, bitmap);
        
        if (this.tiles.has(key)) {
          ctx.drawImage(bitmap, 0, 0);
        }
      }
    });

    processQueue();
  }

  destroy() {
    this.tiles.forEach(c => c.remove());
    this.tiles.clear();
  }
}

// --- REACT COMPONENT ---

interface PDFTileEngineProps {
  pageNumber: number;
  pdf: pdfjs.PDFDocumentProxy;
  width: number;
  height: number;
  panX: any;
  panY: any;
  liveScale: any;
  committedScale: number;
  dims: { width: number, height: number };
  isVisible: boolean;
  sheetRelX: number; // For side-by-side positioning
}

export const PDFTileEngine: React.FC<PDFTileEngineProps> = React.memo(({ 
  pageNumber, pdf, width, height, panX, panY, liveScale, committedScale, dims, isVisible, sheetRelX 
}) => {
  const paletteRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PageTileRenderer | null>(null);
  const [pdfPage, setPdfPage] = useState<any>(null);
  const [tier, setTier] = useState(1);
  const [version, setVersion] = useState(0);

  // 1. Lifecycle: Load PDF Page
  useEffect(() => {
    let active = true;
    pdf.getPage(pageNumber).then(page => {
      if (active) setPdfPage(page);
    });
    return () => { active = false; };
  }, [pdf, pageNumber]);

  // 2. Resolution: Update Tier when zoom settles
  useEffect(() => {
    const timer = setTimeout(() => {
      setVersion(v => v + 1);
      let newTier = 1;
      if (committedScale <= 1.2) newTier = 1.5;
      else if (committedScale <= 2.5) newTier = 2.5;
      else if (committedScale <= 5) newTier = 5;
      else newTier = 8;
      setTier(newTier);
    }, 150);
    return () => clearTimeout(timer);
  }, [committedScale]);

  // 3. Rendering: Update tiles on pan/zoom
  const run = useCallback(() => {
    if (!isVisible || !pdfPage || !paletteRef.current || !dims.width) return;
    if (!engineRef.current) engineRef.current = new PageTileRenderer(paletteRef.current, pdfPage, pageNumber, width, height);
    
    // Bridge V1 Math to Engine
    const px = panX.get() + (dims.width / 2);
    const py = panY.get() + (dims.height / 2) - (height * committedScale / 2);

    engineRef.current.update({ 
      scale: committedScale, 
      px, 
      py, 
      tier, 
      version, 
      vw: dims.width, 
      vh: dims.height, 
      pageOriginX: sheetRelX * committedScale,
      pageOriginY: 0
    });
  }, [isVisible, pdfPage, committedScale, tier, version, panX, panY, dims, width, height, sheetRelX]);

  useLayoutEffect(run, [run]);
  useMotionValueEvent(panX, "change", run);
  useMotionValueEvent(panY, "change", run);

  return (
    <div ref={paletteRef} className="absolute inset-0 z-0 pointer-events-none" />
  );
});
