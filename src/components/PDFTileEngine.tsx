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
  private fingerprint: string;

  constructor(container: HTMLDivElement, pdfPage: pdfjs.PDFPageProxy, pageNumber: number, width: number, height: number, fingerprint: string) {
    this.container = container;
    this.pdfPage = pdfPage;
    this.pageNumber = pageNumber;
    this.logicalWidth = width;
    this.logicalHeight = height;
    this.fingerprint = fingerprint;
  }

  update(params: { scale: number, px: number, py: number, tier: number, version: number, vw: number, vh: number, pageOriginX: number, pageOriginY: number }) {
    const { scale, px, py, tier, version, vw, vh, pageOriginX, pageOriginY } = params;
    
    const RENDER_TILE_SIZE = 512;
    const snapTier = Math.max(1, Math.floor(tier));
    
    const logicalTileWidth = RENDER_TILE_SIZE / snapTier;
    const cols = Math.ceil(this.logicalWidth / logicalTileWidth);
    const rows = Math.ceil(this.logicalHeight / logicalTileWidth);

    const visibleKeys = new Set<string>();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = c * logicalTileWidth;
        const ty = r * logicalTileWidth;

        const tileLeft = px + pageOriginX + (tx * scale);
        const tileTop = py + pageOriginY + (ty * scale);
        const physicalDisplaySize = logicalTileWidth * scale;
        
        if (tileLeft < vw && tileLeft + physicalDisplaySize > 0 && tileTop < vh && tileTop + physicalDisplaySize > 0) {
          // Use fingerprint to guarantee zero cross-book contamination
          const key = `${this.fingerprint}-${this.pageNumber}-${version}-${snapTier}-${r}-${c}`;
          visibleKeys.add(key);

          if (!this.tiles.has(key)) {
            this.createTile(key, r, c, snapTier, logicalTileWidth, tx, ty);
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

  private async createTile(key: string, row: number, col: number, tier: number, lts: number, tx: number, ty: number) {
    const canvas = document.createElement('canvas');
    const RENDER_TILE_SIZE = 512;
    
    canvas.width = RENDER_TILE_SIZE;
    canvas.height = RENDER_TILE_SIZE;
    canvas.className = 'absolute pointer-events-none';
    
    canvas.style.left = `${tx}px`;
    canvas.style.top = `${ty}px`;
    canvas.style.width = `${lts}px`;
    canvas.style.height = `${lts}px`;
    
    this.container.appendChild(canvas);
    this.tiles.set(key, canvas);

    const cached = globalTileCache.get(key);
    const ctx = canvas.getContext('2d', { alpha: false })!;

    if (cached) {
      ctx.drawImage(cached, 0, 0);
      return;
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, RENDER_TILE_SIZE, RENDER_TILE_SIZE);

    globalRenderQueue.push({
      key,
      task: async () => {
        // If the tile was deleted (e.g. scrolled past), abort instantly to clear queue
        if (!this.tiles.has(key)) return;

        const baseViewport = this.pdfPage.getViewport({ scale: 1 });
        const fitScale = this.logicalWidth / baseViewport.width;
        const renderScale = fitScale * tier;
        
        const renderViewport = this.pdfPage.getViewport({ 
          scale: renderScale,
          offsetX: -(col * RENDER_TILE_SIZE),
          offsetY: -(row * RENDER_TILE_SIZE)
        });

        const offscreen = new OffscreenCanvas(RENDER_TILE_SIZE, RENDER_TILE_SIZE);
        const offCtx = offscreen.getContext('2d', { alpha: false })!;
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, RENDER_TILE_SIZE, RENDER_TILE_SIZE);

        await this.pdfPage.render({ 
          canvasContext: offCtx as any, 
          viewport: renderViewport 
        }).promise;

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

  // 2. Cleanup: Destroy Engine on unmount to clear queue
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  // 3. Resolution: Update Tier when zoom settles
  useEffect(() => {
    const timer = setTimeout(() => {
      setVersion(v => v + 1);
      let newTier = 1;
      if (committedScale <= 1.5) newTier = 2;
      else if (committedScale <= 3) newTier = 4;
      else newTier = 8;
      setTier(newTier);
    }, 150);
    return () => clearTimeout(timer);
  }, [committedScale]);

  // 4. Rendering: Update tiles on pan/zoom
  const run = useCallback(() => {
    if (!isVisible || !pdfPage || !paletteRef.current || !dims.width) return;
    
    if (!engineRef.current) {
      const fingerprint = (pdf as any).fingerprint || "fallback-doc";
      engineRef.current = new PageTileRenderer(paletteRef.current, pdfPage, pageNumber, width, height, fingerprint);
    }
    
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
  }, [isVisible, pdfPage, committedScale, tier, version, panX, panY, dims, width, height, sheetRelX, pdf]);

  useLayoutEffect(run, [run]);
  useMotionValueEvent(panX, "change", run);
  useMotionValueEvent(panY, "change", run);

  return (
    <div ref={paletteRef} className="absolute inset-0 z-0 pointer-events-none" />
  );
});

