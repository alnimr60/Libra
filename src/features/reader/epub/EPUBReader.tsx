import React, { useEffect, useRef, useState, useCallback } from 'react';
import ePub, { Rendition, Book as EpubBook } from 'epubjs';
import { get } from 'idb-keyval';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Book, Bookmark } from '../../../types';
import { useReader } from '../ReaderContext';
import ReaderShell from '../ReaderShell';

function validateEpubBinary(buffer: ArrayBuffer) {
  if (!buffer || buffer.byteLength < 4) {
    console.warn("[EPUB_BINARY_REJECTED] Uint8Array too small or empty");
    throw new Error("Invalid or empty file data.");
  }
  
  const view = new Uint8Array(buffer);
  const magic0 = view[0];
  const magic1 = view[1];
  
  if (magic0 === 0x50 && magic1 === 0x4B) { // 'P' 'K'
    console.log("[EPUB_MAGIC_VALID] Valid ZIP/EPUB binary magic bytes detected.");
  } else {
    console.warn("[EPUB_MAGIC_INVALID] Invalid magic bytes. Expected PK, got:", magic0, magic1);
    let previewText = "";
    try {
      const decoder = new TextDecoder("utf-8");
      previewText = decoder.decode(view.slice(0, 100)).trim();
    } catch (_) {}
    console.warn("[EPUB_BINARY_REJECTED] Preview of invalid file content:", previewText);
    
    if (previewText.toLowerCase().includes("<html") || previewText.toLowerCase().includes("<!doctype html")) {
      throw new Error("[EPUB_BINARY_REJECTED] HTML webpage or provider redirect received. Expected a valid EPUB document archive.");
    }
    if (previewText.toLowerCase().includes("<?xml")) {
      throw new Error("[EPUB_BINARY_REJECTED] XML document received. Expected a valid EPUB document archive.");
    }
    throw new Error("[EPUB_BINARY_REJECTED] Invalid file content. The file is not a valid zip/EPUB archive.");
  }
}

interface EPUBReaderProps {
  book: Book;
  initialPage?: number;
  onPageChange: (page: number, cfi?: string) => void;
  updateBook: (book: Book) => void;
  onUpdateBookmarks: (bookmarks: Bookmark[]) => void;
  onClose: () => void;
}

interface NavItem {
  label: string;
  href: string;
  subitems?: NavItem[];
}

export default function EPUBReader({ 
  book, 
  initialPage,
  onClose, 
  onPageChange, 
  updateBook,
  onUpdateBookmarks
}: EPUBReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [currentCfi, setCurrentCfi] = useState<string | null>(book.currentCfi || null);
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const isReadyRef = useRef(false);
  const startupLockRef = useRef(true);
  const [totalPages, setTotalPages] = useState(100); 

  // Pipeline execution stages
  type EPUBStage = 'WAITING_CONTAINER' | 'WAITING_LAYOUT' | 'CREATING_RENDITION' | 'DISPLAYING' | 'READY' | 'FAILED';
  const [stage, setStage] = useState<EPUBStage>('WAITING_CONTAINER');
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [epubBook, setEpubBook] = useState<any>(null);
  
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const initializedRef = useRef(false);
  const isMountedRef = useRef(true);
  const settledRef = useRef(false);
  const ignoredInitialRelocation = useRef(false);
  const lastEmittedCfiRef = useRef<string | null>(null);
  const displayAttemptsRef = useRef(0);

  const { theme, fontSize, setFontSize, direction, showControls, setShowControls } = useReader();
  const showControlsRef = useRef(showControls);

  const settledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relocatedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    console.log("[EPUB_MOUNT] EPUBReader component mounted.");
    return () => {
      isMountedRef.current = false;
      console.log("[EPUB_UNMOUNT] EPUBReader component unmounting.");
      if (settledTimerRef.current) clearTimeout(settledTimerRef.current);
      if (relocatedTimerRef.current) clearTimeout(relocatedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    showControlsRef.current = showControls;
  }, [showControls]);

  const handleZoomIn = () => {
    const next = Math.min(fontSize + 15, 300);
    console.log(`[ZOOM_BUTTON_IN] targetScale: ${next}, liveScale: ${fontSize}, reader: EPUB`);
    setFontSize(next);
  };

  const handleZoomOut = () => {
    const next = Math.max(fontSize - 15, 50);
    console.log(`[ZOOM_BUTTON_OUT] targetScale: ${next}, liveScale: ${fontSize}, reader: EPUB`);
    setFontSize(next);
  };

  const handleZoomReset = () => {
    console.log(`[ZOOM_BUTTON_RESET] targetScale: 100, liveScale: ${fontSize}, reader: EPUB`);
    setFontSize(100);
  };

  const themes = {
    light: { body: { color: "#18181b", background: "transparent" } },
    dark: { body: { color: "#d4d4d8", background: "transparent" } },
    sepia: { body: { color: "#433422", background: "transparent" } }
  };

  const normalizeEpubData = async (fileData: unknown): Promise<ArrayBuffer> => {
    if (!fileData) {
      throw new Error(`EPUB file data is null or undefined`);
    }

    const typeStr = Object.prototype.toString.call(fileData);

    // Cross-frame safe detection for Blob
    if (fileData instanceof Blob || typeStr === '[object Blob]' || (typeof (fileData as any).arrayBuffer === 'function')) {
      return (fileData as any).arrayBuffer();
    }

    // Cross-frame safe detection for ArrayBuffer
    if (fileData instanceof ArrayBuffer || typeStr === '[object ArrayBuffer]') {
      return fileData as ArrayBuffer;
    }

    // Cross-frame safe detection for TypedArrays / ArrayBufferView
    if (ArrayBuffer.isView(fileData) || (fileData && (fileData as any).buffer)) {
      const view = fileData as ArrayBufferView;
      const buffer = view.buffer || (fileData as any).buffer;
      const byteOffset = view.byteOffset !== undefined ? view.byteOffset : 0;
      const byteLength = view.byteLength !== undefined ? view.byteLength : (fileData as any).length;
      return buffer.slice(byteOffset, byteOffset + byteLength);
    }

    throw new Error(`Unsupported EPUB storage type: ${typeStr}`);
  };

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });

    try {
      const result = await Promise.race([promise, timeout]);
      return result;
    } finally {
      if (timeoutId!) clearTimeout(timeoutId);
    }
  };

  const applyTheme = useCallback((targetTheme: 'light' | 'dark' | 'sepia') => {
    const rendition = renditionRef.current;
    if (!rendition || !isReady) return;
    
    try {
      const config = themes[targetTheme];
      rendition.themes.register(targetTheme, config);
      rendition.themes.select(targetTheme);
      
      const isRTL = direction === 'rtl';

      rendition.themes.default({
        'html': {
          'height': 'auto !important',
          'min-height': '100% !important',
          'max-height': 'none !important',
          'margin': '0 !important',
          'padding': '0 !important',
          'box-sizing': 'border-box !important',
          'overflow-y': 'auto !important',
          'overflow-x': 'hidden !important',
          'position': 'relative !important'
        },
        'body': {
          'height': 'auto !important',
          'min-height': '100% !important',
          'max-height': 'none !important',
          'margin': '0 !important',
          'padding': '0 24px !important',
          'box-sizing': 'border-box !important',
          'overflow-y': 'auto !important',
          'overflow-x': 'hidden !important',
          'position': 'relative !important',
          'font-family': 'Inter, system-ui, sans-serif !important',
          'line-height': '1.8 !important',
          'direction': isRTL ? 'rtl !important' : 'ltr !important',
          'text-align': 'justify !important'
        },
        '*, *::before, *::after': {
          'box-sizing': 'border-box !important'
        },
        'p, div, section, article, figure, blockquote': {
          'margin-top': '0 !important',
          'margin-bottom': '0 !important'
        },
        'img': { 
          'max-width': '100% !important',
          'height': 'auto !important'
        }
      });
    } catch (e) {
      console.warn("[EPUB_THEME_ERROR]", e);
    }
  }, [direction, isReady]);

  // ResizeObserver to detect stable non-zero scale and dimension transitions
  const lastDimensionsRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Initial measurement fallback
    const rect = viewer.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      console.log(`[EPUB_CONTAINER_INIT] Initial dimensions found: ${rect.width}x${rect.height}`);
      setDimensions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    } else {
      // If still 0, try a few retries
      let retries = 0;
      const interval = setInterval(() => {
        if (!isMountedRef.current || retries > 10) {
           clearInterval(interval);
           if (retries > 10 && (!lastDimensionsRef.current)) {
             console.error("[EPUB_DIMENSION_ERROR] Failed to obtain valid dimensions after 5 seconds.");
           }
           return;
        }
        retries++;
        const r = viewer.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
           console.log(`[EPUB_CONTAINER_DELAYED] Dimensions found after ${retries * 500}ms: ${r.width}x${r.height}`);
           setDimensions({ width: Math.floor(r.width), height: Math.floor(r.height) });
           clearInterval(interval);
        }
      }, 500);
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.floor(entry.contentRect.width);
        const height = Math.floor(entry.contentRect.height);
        if (width > 0 && height > 0) {
          const last = lastDimensionsRef.current;
          if (!last || Math.abs(last.width - width) > 1 || Math.abs(last.height - height) > 1) {
            lastDimensionsRef.current = { width, height };
            setTimeout(() => {
              if (isMountedRef.current) {
                setDimensions(prev => {
                  if (prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1) return prev;
                  console.log(`[EPUB_CONTAINER_READY] Dimensions updated: ${width}x${height}`);
                  return { width, height };
                });
              }
            }, 0);
          }
        }
      }
    });

    observer.observe(viewer);
    return () => {
      observer.disconnect();
    };
  }, []);

  // --- EFFECT 1: Pure Book Binary Loader & ePub Instance Creator ---
  useEffect(() => {
    let isCancelled = false;
    let b: any = null;

    const loadBookBinary = async () => {
      try {
        setLoading(true);
        setError(null);
        setErrorDetail(null);
        setIsReady(false);
        setEpubBook(null);

        if (!book.fileDataId) {
          throw new Error('No local file data ID associated with this library entry.');
        }

        console.log("[EPUB_LIFECYCLE] [1/4] Book binary lookup start for ID:", book.id);
        const fileData = await get(book.fileDataId);
        if (!fileData) {
          throw new Error('This book\'s data could not be found in local offline storage (IndexedDB). It might have been deleted, or the offline sync failed.');
        }

        if (isCancelled) return;

        console.log("[EPUB_LIFECYCLE] [2/4] Normalization start. File size in DB:", fileData ? (fileData as any).byteLength || (fileData as any).size : "unknown");
        const epubData = await normalizeEpubData(fileData);
        
        // Comprehensive EPUB binary validation with improved diagnostics
        const sizeMB = (epubData.byteLength / (1024 * 1024)).toFixed(2);
        console.log(`[EPUB_VALIDATION] Size: ${epubData.byteLength} bytes (${sizeMB} MB)`);
        const hex = Array.from(new Uint8Array(epubData).slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`[EPUB_VALIDATION] First 8 bytes hex signature: ${hex}`);

        validateEpubBinary(epubData);

        if (isCancelled) return;

        console.log("[EPUB_LIFECYCLE] [3/4] epub.js constructor call");
        b = ePub(epubData) as any;
        
        // EPUB_STRUCTURE_INVALID: Validate basic structure before proceeding
        await b.ready;
        if (isCancelled) return;

        const spineLength = b.spine?.length || 0;
        console.log(`[EPUB_SPINE_VALIDATION] Spine items count: ${spineLength}`);
        
        if (spineLength === 0) {
          throw new Error("EPUB_STRUCTURE_INVALID: Document has an empty spine (no chapters or content found).");
        }

        // Check if spine items actually have hrefs (hard crash prevention)
        const validSpineItem = (b.spine as any).get(0);
        if (!validSpineItem || !validSpineItem.href) {
           // Some epubs have a spine but items are missing hrefs
           console.warn("[EPUB_SPINE_WARNING] First spine item is missing href/path. Scanning for valid item...");
           let foundValid = false;
           for (let i = 0; i < spineLength; i++) {
             const it = (b.spine as any).get(i);
             if (it && it.href) {
               foundValid = true;
               break;
             }
           }
           if (!foundValid) {
             throw new Error("EPUB_STRUCTURE_INVALID: No valid content sections found in document manifest.");
           }
        }
        
        // TOC extraction
        b.loaded.navigation
          .then((navigation: any) => {
            if (!isCancelled) {
              console.log("[EPUB_LIFECYCLE] TOC loaded successfully, items count:", navigation?.toc?.length || 0);
              setToc(navigation.toc || []);
            }
          })
          .catch((e: any) => {
            console.warn("[EPUB_NAVIGATION_ERROR] Optional navigation loading failed:", e);
          });

        if (isCancelled) {
          b.destroy();
          return;
        }

        bookRef.current = b;
        setEpubBook(b);
        console.log("[EPUB_LIFECYCLE] [4/4] ePub Book instance created and set.");
      } catch (e: any) {
        console.error("[EPUB_LIFECYCLE_FAIL] Book binary load or validation failed:", e);
        if (!isCancelled) {
          setIsReady(false);
          setLoading(false);
          setStage('FAILED');
          setError(e?.message || 'Failed to parse and initialize the EPUB file format.');
          setErrorDetail(e?.stack || '');
        }
      }
    };

    loadBookBinary();

    return () => {
      isCancelled = true;
      console.log("[EPUB_LIFECYCLE] Cleanup book binary loader effect for ID:", book.id);
      if (b) {
        try {
          b.destroy();
          console.log("[EPUB_LIFECYCLE] Book instance destroyed successfully.");
        } catch (err) {
          console.warn("[EPUB_LIFECYCLE_WARN] Error destroying book instance:", err);
        }
      }
      bookRef.current = null;
    };
  }, [book.id, book.fileDataId, retryTrigger]);

  const pointerDownPos = useRef<{ x: number, y: number } | null>(null);

  // --- EFFECT 2: Rendition creation, display, and initial positioning ---
  useEffect(() => {
    let isCancelled = false;

    if (!epubBook) {
      return;
    }

    // REMOVE INITIALIZATION DEADLOCK: 
    // Do NOT require isDimensionsStable. Just require width and height > 0.
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      console.log("[EPUB_LIFECYCLE] WAITING_CONTAINER: Waiting for non-zero container dimensions.");
      setStage('WAITING_CONTAINER');
      return;
    }

    console.log("[EPUB_LIFECYCLE] Creating rendition. Dimensions:", dimensions);
    setStage('CREATING_RENDITION');
    
    const viewer = viewerRef.current;
    if (!viewer) {
      console.error("[EPUB_LIFECYCLE_ERROR] EPUB viewer container DOM element not found on mount!");
      return;
    }

    let rendition: Rendition | null = null;
    try {
      console.log(`[EPUB_LIFECYCLE] Creating rendition in continuous scroll mode. Dimensions:`, dimensions);

      rendition = epubBook.renderTo(viewer, {
        width: '100%',
        height: '100%',
        flow: 'scrolled',
        manager: 'continuous',
        spread: 'none',
        allowScriptedContent: true
      });
      renditionRef.current = rendition;

      console.log("[EPUB_LIFECYCLE] Rendition created. Attaching content hooks & event listeners...");
      setStage('DISPLAYING');

      // Register content hooks for strict layout stabilization & override styles
      rendition.hooks.content.register((contents: any) => {
        if (isCancelled) return;
        try {
          const doc = contents.document;
          const style = doc.createElement('style');
          style.id = "epub-layout-stabilizer";
          
          style.textContent = `
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              box-sizing: border-box !important;
              position: relative !important;
              overflow-x: hidden !important;
              height: auto !important;
              min-height: 100% !important;
              max-height: none !important;
              overflow-y: auto !important;
              -webkit-text-size-adjust: 100% !important;
              -webkit-overflow-scrolling: touch !important;
            }
            body {
              padding: 0 24px !important; 
              font-family: Inter, system-ui, sans-serif !important;
              line-height: 1.8 !important;
              text-align: justify !important;
              display: block !important;
              visibility: visible !important;
            }
            * {
              box-sizing: border-box !important;
            }
            p, div, section, article, figure, blockquote {
              margin-top: 0 !important;
              margin-bottom: 0.8em !important;
              max-height: none !important;
              break-inside: auto !important;
              page-break-inside: auto !important;
            }
            img {
              max-width: 100% !important;
              max-height: 90% !important;
              height: auto !important;
              object-fit: contain !important;
              display: block !important;
              margin: 1em auto !important;
              break-inside: avoid !important;
            }
          `;
          doc.head.appendChild(style);

          // Force iframe styling to remain stable & allowed to expand naturally with content
          const iframe = contents.iframe || doc.defaultView?.frameElement;
          if (iframe) {
            Object.assign(iframe.style, {
              height: '100%',
              width: '100%',
              position: 'relative',
              margin: '0',
              padding: '0',
              border: 'none'
            });
          }

          // Logs & Diagnostics
          const container = viewerRef.current;
          const containerW = container ? container.clientWidth : 0;
          const containerH = container ? container.clientHeight : 0;
          console.log(`[EPUB_LAYOUT_CONTAINER] width: ${containerW}, height: ${containerH}`);

          const docEl = doc.documentElement;
          const bodyEl = doc.body;

          const scrollH = docEl.scrollHeight || bodyEl.scrollHeight;
          const clientH = docEl.clientHeight || bodyEl.clientHeight;

          console.log(`[EPUB_LAYOUT_BODY] scrollHeight: ${scrollH}, clientHeight: ${clientH}`);

          // Register scroll tracking event listener inside iframe
          const handleInternalScroll = () => {
            const scrollTop = docEl.scrollTop || bodyEl.scrollTop || 0;
            const scrollH = docEl.scrollHeight || bodyEl.scrollHeight || 1;
            const clientH = docEl.clientHeight || bodyEl.clientHeight || 1;
            const progressPerc = Math.max(0, Math.min(1, scrollTop / (scrollH - clientH || 1)));

            console.log(`[EPUB_INTERNAL_SCROLL] scrollTop: ${scrollTop}, progress: ${progressPerc}`);
            
            // Forward scroll position to epub.js rendition tracking to keep continuous manager aligned
            try {
              if (typeof rendition.currentLocation === 'function') {
                rendition.currentLocation();
              }
            } catch (e) {
              console.warn("[EPUB_SCROLL_CURRENT_LOCATION_ERR]", e);
            }

            // Fallback / precise element-level CFI tracking
            if (!startupLockRef.current) {
              let foundElement: Element | null = null;
              const x = Math.min(80, (docEl.clientWidth || bodyEl.clientWidth) / 4 || 80);
              
              // Scan top area coordinates to locate visible elements
              for (let y = 10; y < 300; y += 35) {
                const el = doc.elementFromPoint(x, y);
                if (el && el.tagName && !['HTML', 'BODY', 'IFRAME'].includes(el.tagName)) {
                  foundElement = el;
                  break;
                }
              }
              
              if (!foundElement) {
                foundElement = doc.elementFromPoint(40, 40);
              }

              if (foundElement) {
                try {
                  const cfi = contents.cfiFromElement(foundElement);
                  if (cfi && typeof cfi === 'string' && cfi.startsWith('epubcfi(')) {
                    setCurrentCfi(cfi);
                    setProgress(Math.round(progressPerc * 100));

                    let currentLocIndex = -1;
                    const totalLocs = (epubBook.locations as any)?.total || 0;
                    const hasLocs = epubBook.locations && (epubBook.locations as any).cfis && (epubBook.locations as any).cfis.length > 0;
                    if (hasLocs) {
                      try {
                        currentLocIndex = (epubBook.locations as any).locationFromCfi(cfi);
                      } catch (_) {}
                    }
                    const approxPage = typeof currentLocIndex === 'number' && currentLocIndex >= 0 
                      ? currentLocIndex + 1 
                      : Math.max(1, Math.ceil(progressPerc * (totalLocs || 100)));

                    if (relocatedTimerRef.current) clearTimeout(relocatedTimerRef.current);
                    relocatedTimerRef.current = setTimeout(() => {
                      if (isMountedRef.current && !startupLockRef.current) {
                        console.log("[EPUB_SCROLL_PERSIST] Emitting persistent cfi update:", cfi);
                        onPageChange(approxPage, cfi);
                      }
                    }, 500);
                  }
                } catch (err) {
                  console.warn("[EPUB_CFI_ERROR]", err);
                }
              }
            }
          };

          doc.addEventListener('scroll', handleInternalScroll, { passive: true });

          // Register tap vs scroll detection
          doc.addEventListener('pointerdown', (e: PointerEvent) => {
             pointerDownPos.current = { x: e.clientX, y: e.clientY };
          });

          // Register center click handler to toggle HUD controls
          doc.addEventListener('click', (event: MouseEvent) => {
            // Track movement delta to distinguish taps from scrolls
            const down = pointerDownPos.current;
            if (down) {
               const dx = Math.abs(event.clientX - down.x);
               const dy = Math.abs(event.clientY - down.y);
               if (dx > 10 || dy > 10) {
                 console.log("[EPUB_CLICK_REJECTED] Movement detected, likely scroll or drag.");
                 return;
               }
            }

            // Skip text selection
            const win = contents.window || doc.defaultView;
            const selection = win ? win.getSelection() : null;
            if (selection && selection.toString().trim().length > 0) {
              return;
            }

            console.log("[EPUB_CLICK_HUD_TOGGLE] Click action inside iframe document, toggling HUD.");
            setShowControls(!showControlsRef.current);
          });
        } catch (err) {
          console.warn("EPUB hooks content processing failed:", err);
        }
      });

      // Register rendition event handlers
      rendition.on("rendered", (section: any) => {
        console.log("[EPUB_RENDERED] section index:", section?.index);
      });

      rendition.on("displayed", (section: any) => {
        console.log(`[EPUB_DISPLAYED] Section loaded. Index: ${section?.index}, ID: ${section?.id}`);
      });

      rendition.on("manager:drag", (e: any) => {
        console.log("[EPUB_DRAG] Internal drag detected.");
      });

      rendition.on("scrolled", (location: any) => {
        console.log("[EPUB_SCROLLED] Scroll position updated:", location);
      });

      rendition.on("started", () => {
        console.log("[EPUB_STARTED]");
      });

      rendition.on("layout", (layout: any) => {
        console.log("[EPUB_LAYOUT] width:", layout?.width);
      });

      rendition.on('relocated', (location: any) => {
        if (isCancelled || !isMountedRef.current) return;
        
        const cfiStr = location?.start?.cfi || '';
        if (!cfiStr) return;
        
        // Skip outward sync during STARTUP LOCK window
        if (startupLockRef.current) {
          console.log("[EPUB_RELOCATED] Startup Lock Active: Suppressing outward progress sync. CFI:", cfiStr);
          return;
        }

        // Skip emission during startup or if it's the exact same CFI as last time
        if (cfiStr === lastEmittedCfiRef.current) {
          return;
        }

        console.log("[EPUB_RELOCATED] New Page Position:", { cfi: cfiStr, percentage: location?.start?.percentage });
        lastEmittedCfiRef.current = cfiStr;
        setCurrentCfi(cfiStr);
        
        const perc = location?.start?.percentage || 0;
        setProgress(Math.round(perc * 100));

        // Calculate location index safely
        let currentLocIndex = -1;
        const totalLocs = (epubBook.locations as any)?.total || 0;
        const hasLocations = epubBook.locations && (epubBook.locations as any).cfis && (epubBook.locations as any).cfis.length > 0;
        
        if (hasLocations) {
          try {
            currentLocIndex = (epubBook.locations as any).locationFromCfi(cfiStr);
          } catch (e) {
            console.warn("[EPUB_LOCATION_ERROR] Error resolving CFI to index:", e);
          }
        }
        const approxPage = typeof currentLocIndex === 'number' && currentLocIndex >= 0 
          ? currentLocIndex + 1 
          : Math.max(1, Math.ceil(perc * (totalLocs || 100)));

        // DEBOUNCE PERSISTENCE: Use 500ms to avoid database/parent feedback loops during active scrolling
        if (relocatedTimerRef.current) clearTimeout(relocatedTimerRef.current);
        relocatedTimerRef.current = setTimeout(() => {
          if (isMountedRef.current && !startupLockRef.current) {
            console.log("[EPUB_SYNC_PERSIST] Emitting persistent cfi update:", cfiStr);
            onPageChange(approxPage, cfiStr);
          }
        }, 500);
      });

      // Load cached locations if available
      if (book.locations) {
        try {
          console.log("[EPUB_LOCATIONS_LOAD_START] Reading locations from cache.");
          (epubBook.locations as any).load(book.locations);
          setTotalPages((epubBook.locations as any).total);
          console.log("[EPUB_LOCATIONS_LOAD_SUCCESS] Loaded cached locations count:", (epubBook.locations as any).total);
        } catch (err) {
          console.warn("[EPUB_LOCATIONS_LOAD_FAILED] Stale/invalid locations cache:", err);
        }
      }

      const savedCfi = currentCfi || book.currentCfi;
      
      // FIX epub.js indexOf / PATH CRASH: Validate CFI before display
      // We check if the target exists in the spine to prevent internal Path/indexOf crashes
      let displayTarget: string | undefined = undefined;
      
      if (typeof savedCfi === 'string' && savedCfi.startsWith('epubcfi(')) {
        try {
          const spine = epubBook.spine as any;
          if (spine && typeof spine.get === 'function') {
            const section = spine.get(savedCfi);
            if (section && section.href) {
              displayTarget = savedCfi;
              console.log("[EPUB_DISPLAY_TARGET] Provided CFI validated against spine. target:", displayTarget);
            } else {
              console.warn("[EPUB_DISPLAY_TARGET_INVALID] Saved CFI points to missing or href-less section. target:", savedCfi);
            }
          }
        } catch (e) {
          console.warn("[EPUB_DISPLAY_TARGET_ERROR] Error validating CFI against spine:", e);
        }
      }

      console.log("[EPUB_DISPLAY_START] Displaying target=" + (displayTarget || "FIRST_VALID_SECTION"));
      startupLockRef.current = true;

      // RELAX DISPLAY TIMEOUT: Increase to 180s for massive EPUBs or slow connections
      const startDisplay = async () => {
        try {
          // STABILIZE INITIAL RENDITION TIMING:
          // Ensure container is painted and stable before display()
          console.log("[EPUB_LIFECYCLE] Applying stabilization gate (RAF x2 + timeout 300ms)...");
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          await new Promise(r => setTimeout(r, 300));

          if (isCancelled || !isMountedRef.current) return;

          // If no target or invalid target, specifically look for the first valid spine item
          if (!displayTarget) {
             const spineLength = epubBook.spine?.length || 0;
             for (let i = 0; i < spineLength; i++) {
               const it = (epubBook.spine as any).get(i);
               if (it && it.href) {
                 displayTarget = it.href; 
                 console.log(`[EPUB_FALLBACK_DISPLAY] Resolved first valid spine element at index ${i}: ${displayTarget}`);
                 break;
               }
             }
          }

          console.log("[EPUB_DISPLAY_START] Attempting display of target:", displayTarget || "START_DEFAULT");
          try {
            await withTimeout(rendition!.display(displayTarget), 180000, "[EPUB_DISPLAY_SUCCESS]");
          } catch (e) {
            console.warn("[EPUB_DISPLAY_RETRY] Failed initial display attempt. Retrying with default START fallback...");
            await withTimeout(rendition!.display(), 60000, "[EPUB_DISPLAY_RETRY_SUCCESS]");
          }
          
          if (isCancelled || !isMountedRef.current) return;
          console.log("[EPUB_DISPLAY_SUCCESS] Rendition content shown.");

          // Verify visibility - fix white screen issue
          setTimeout(() => {
            if (!isMountedRef.current || !renditionRef.current) return;
            const ifr = viewerRef.current?.querySelector('iframe');
            if (ifr) {
              const rect = ifr.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) {
                console.warn("[EPUB_VISIBILITY_REPAIR] Iframe has 0 dimensions after success. Forcing resize.");
                renditionRef.current.resize(dimensions.width, dimensions.height);
              }
            }
          }, 100);
          
          // STARTUP LOCK: Wait 1500ms before allowing outward progress sync
          if (settledTimerRef.current) clearTimeout(settledTimerRef.current);
          settledTimerRef.current = setTimeout(() => {
            if (!isCancelled && isMountedRef.current) {
              const viewer = viewerRef.current;
              const iframe = viewer?.querySelector('iframe');
              const body = iframe?.contentDocument?.body;
              
              const isBlank = !body || body.innerHTML.trim().length === 0;
              console.log("[EPUB_LIFECYCLE] Settling check. Content detected:", !isBlank);
              
              if (isBlank) {
                console.warn("[EPUB_REPAIR] Blank body detected after settling time. Forcing rendition update.");
                renditionRef.current?.resize(dimensions.width, dimensions.height);
              }

              console.log("[EPUB_LIFECYCLE] Reader settled. Startup lock cleared.");
              startupLockRef.current = false;
              settledRef.current = true;
              isReadyRef.current = true;
              setIsReady(true);
              setLoading(false);
              setStage('READY');
            }
          }, 1500);
          
          // Background location generation
          if (!(epubBook.locations as any).total) {
            console.log("[EPUB_LOCATIONS_GENERATING_START] Generating book path locations in background...");
            epubBook.ready
              .then(() => {
                if (isCancelled) return;
                return (epubBook.locations as any).generate(2048);
              })
              .then(() => {
                if (isCancelled) return;
                const totalGenerated = (epubBook.locations as any).total || 100;
                console.log("[EPUB_LOCATIONS_GENERATED] Location paths successfully drawn in background. total:", totalGenerated);
                setTotalPages(totalGenerated);
                
                try {
                  const locationsObj = epubBook.locations as any;
                  if (locationsObj && locationsObj.cfis && locationsObj.cfis.length > 0) {
                    const serialized = locationsObj.save();
                    if (serialized && !isCancelled) {
                      console.log("[EPUB_LOCATIONS_CACHE] Storing locations cache to storage.");
                      updateBook({
                        ...book,
                        locations: serialized,
                        totalPages: totalGenerated
                      });
                    }
                  }
                } catch (err) {
                  console.warn("Could not cache generated locations:", err);
                }
              })
              .catch((err: any) => {
                console.warn("[EPUB_LOCATIONS_GENERATED_ERR] Failed to generate locations in background:", err);
              });
          }
        } catch (err: any) {
          console.error("[EPUB_DISPLAY_FAILED] Rendition display failed:", err);
          
          // If we tried a specific CFI and it failed, try falling back to start once
          if (displayTarget && !isCancelled && isMountedRef.current) {
            console.warn("[EPUB_DISPLAY_FALLBACK] Retrying display from default start of book.");
            try {
              // Try the absolute simplest display call as a last resort
              await withTimeout(rendition!.display(), 30000, "[EPUB_FALLBACK_DISPLAY]");
              if (!isCancelled && isMountedRef.current) {
                // Settle logic here too
                settledTimerRef.current = setTimeout(() => {
                  if (!isCancelled && isMountedRef.current) {
                    settledRef.current = true;
                    setIsReady(true);
                    setLoading(false);
                    setStage('READY');
                  }
                }, 600);
                return;
              }
            } catch (fallbackErr) {
              console.error("[EPUB_FALLBACK_FAILED] All display attempts failed.", fallbackErr);
            }
          }

          if (!isCancelled) {
            setIsReady(false);
            setLoading(false);
            setStage('FAILED');
            setError(err?.message || 'Failed to display section of the electronic book.');
            setErrorDetail(err?.stack || '');
          }
        }
      };

      startDisplay();

    } catch (err: any) {
      console.error("[EPUB_RENDITION_INIT_FAILED] Failed to construct rendition:", err);
      if (!isCancelled) {
        setIsReady(false);
        setLoading(false);
        setStage('FAILED');
        setError(err?.message || 'Could not map electronic book contents onto the device window.');
        setErrorDetail(err?.stack || '');
      }
    }

    return () => {
      isCancelled = true;
      const reason = !isMountedRef.current ? 'unmount' : 'dependency_change';
      console.log(`[EPUB_CLEANUP_REASON] ${reason}. Destroying rendition...`);
      settledRef.current = false;
      isReadyRef.current = false;
      startupLockRef.current = true;
      ignoredInitialRelocation.current = false;
      if (rendition) {
        try {
          rendition.destroy();
          console.log("[EPUB_LIFECYCLE] Rendition destroyed successfully.");
        } catch (err) {
          console.warn("[EPUB_LIFECYCLE_WARN] Error destroying rendition:", err);
        }
      }
      renditionRef.current = null;
    };
  }, [epubBook, !!dimensions]); // Only restart rendition if book changes or dimensions go from invalid to valid


      // --- EFFECT 3: Rendition Resizer ---
  useEffect(() => {
    if (!isReady || !renditionRef.current || !dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      return;
    }

    const rendition = renditionRef.current;
    
    // DEBOUNCED RESIZER: 150ms as suggested
    const timer = setTimeout(() => {
      if (!isMountedRef.current || !renditionRef.current) return;
      console.log(`[EPUB_RESIZE] Executing debounced resize to ${dimensions.width}x${dimensions.height}`);
      try {
        renditionRef.current.resize(dimensions.width, dimensions.height);
      } catch (err) {
        console.warn("[EPUB_RESIZE_WARN] Resize call failed:", err);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [dimensions?.width, dimensions?.height, isReady]);

  // Handle zoom changes
  useEffect(() => {
    if (renditionRef.current && isReady) {
      try {
        renditionRef.current.themes.fontSize(`${fontSize}%`);
      } catch (e) {
        console.warn("[EPUB_ZOOM_ERROR]", e);
      }
    }
  }, [fontSize, isReady]);

  useEffect(() => {
    if (isReady && isMountedRef.current) applyTheme(theme);
  }, [theme, applyTheme, isReady]);

  const locationsObj = bookRef.current ? (bookRef.current.locations as any) : null;
  let currentLocIndex = -1;
  const hasLocations = locationsObj && locationsObj.cfis && locationsObj.cfis.length > 0;
  
  if (hasLocations && currentCfi) {
    try {
      currentLocIndex = locationsObj.locationFromCfi(currentCfi) as any;
    } catch (e) {
      console.warn("[EPUB_UI_LOCATION_ERROR] Error resolving currentCfi for UI:", e);
    }
  }
  const currentPage = typeof currentLocIndex === 'number' && currentLocIndex >= 0 
    ? currentLocIndex + 1 
    : Math.max(1, Math.ceil((progress / 100) * (totalPages || 100)));

  const handleJumpToPage = useCallback((p: number) => {
    const bookObj = bookRef.current;
    if (!bookObj || !renditionRef.current || !isMountedRef.current) return;

    console.log(`[EPUB_JUMP] Jumping to page ${p} of ${totalPages}`);
    const percentage = p / (totalPages || 100);
    const locationsObj = bookObj.locations as any;
    const hasLocations = locationsObj && locationsObj.cfis && locationsObj.cfis.length > 0;
    
    const cfi = (hasLocations && typeof locationsObj.cfiFromPercentage === 'function') 
      ? locationsObj.cfiFromPercentage(percentage) 
      : undefined;

    if (cfi && typeof cfi === 'string') {
      // Validate CFI before jump
      try {
        const spine = bookObj.spine as any;
        if (spine && typeof spine.get === 'function') {
          const section = spine.get(cfi);
          if (section && section.href) {
            renditionRef.current.display(cfi).catch(e => {
              console.warn("[EPUB_JUMP_DISPLAY_FAIL] Target CFI display failed, falling back to simple display.", e);
              renditionRef.current?.display();
            });
          } else {
            console.warn("[EPUB_JUMP_INVALID] Target CFI is invalid or missing href:", cfi);
            renditionRef.current.display().catch(() => {});
          }
        } else {
          renditionRef.current.display(cfi).catch(() => {});
        }
      } catch (e) {
        console.warn("[EPUB_JUMP_ERROR] Error validating CFI before jump:", e);
        renditionRef.current.display().catch(() => {});
      }
    } else {
      // Fallback to location index
      try {
        const locations = bookObj.locations as any;
        const spine = bookObj.spine as any;
        const locIndex = Math.max(0, Math.min(p - 1, ((locations?.total || 1) as number) - 1));
        const locationCfi = (locations && typeof locations.cfiFromIndex === 'function' && locations.cfis) 
          ? locations.cfiFromIndex(locIndex) 
          : undefined;

        if (locationCfi && spine && typeof spine.get === 'function') {
           const section = spine.get(locationCfi);
           if (section && section.href) {
             renditionRef.current.display(locationCfi).catch(() => renditionRef.current?.display());
           } else {
             renditionRef.current.display().catch(() => {});
           }
        } else {
           renditionRef.current.display().catch(() => {});
        }
      } catch (err) {
        console.error("Jump to page failed:", err);
        renditionRef.current.display().catch(() => {});
      }
    }
  }, [totalPages]);

  // --- EFFECT 4: Render Diagnostics ---
  useEffect(() => {
    if (!isReady || !renditionRef.current) return;
    
    const interval = setInterval(() => {
      if (!renditionRef.current || !viewerRef.current) return;
      try {
        const rendition = renditionRef.current;
        const viewer = viewerRef.current;
        const iframe = viewer.querySelector('iframe');
        
        console.log("[EPUB_DIAGNOSTICS]", {
          viewportWidth: viewer.clientWidth,
          viewportHeight: viewer.clientHeight,
          iframeWidth: iframe?.clientWidth,
          iframeTransform: iframe?.style.transform,
          columnWidth: (rendition as any).manager?.layout?.columnWidth,
          gap: (rendition as any).manager?.layout?.gap,
          currentCfi: currentCfi
        });
      } catch (e) {}
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isReady, currentCfi]);

  return (
    <ReaderShell
      book={book}
      title={book.title}
      onClose={onClose}
      currentPage={currentPage}
      totalPages={totalPages}
      progress={progress}
      onPageChange={handleJumpToPage}
      onUpdateBookmarks={onUpdateBookmarks}
      onPrev={() => {
        const rendition = renditionRef.current;
        if (rendition && (rendition as any).manager) {
          try {
            rendition.prev();
          } catch (err) {
            console.error("[EPUBReader] Error navigating prev:", err);
          }
        }
      }}
      onNext={() => {
        const rendition = renditionRef.current;
        if (rendition && (rendition as any).manager) {
          try {
            rendition.next();
          } catch (err) {
            console.error("[EPUBReader] Error navigating next:", err);
          }
        }
      }}
      onJumpToPage={handleJumpToPage}
      zoomPercentage={fontSize}
      onZoomIn={handleZoomIn}
      onZoomOut={handleZoomOut}
      onResetZoom={handleZoomReset}
      centerClickThrough={true}
      disableInteractionZones={true}
    >
      {/* Dynamic theme style resolution */}
      {(() => {
        const getThemeStyles = () => {
          switch(theme) {
            case 'dark':
              return { bg: "#09090b", text: "#f4f4f5", accent: "#ef4444", secondaryText: "#a1a1aa" };
            case 'sepia':
              return { bg: "#fbf0db", text: "#433422", accent: "#b45309", secondaryText: "#5c4d3c" };
            default:
              return { bg: "#ffffff", text: "#18181b", accent: "#ef4444", secondaryText: "#71717a" };
          }
        };
        const themeStyles = getThemeStyles();

        return (
          <>
            {loading && (
              <div
                className="flex flex-col items-center justify-center p-8 text-center"
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 2,
                  background: themeStyles.bg,
                }}
              >
                <Loader2 className="w-10 h-10 animate-spin mb-4" style={{ color: theme === 'sepia' ? '#b45309' : '#3b82f6' }} />
                <span className="font-serif text-lg font-medium">Preparing EPUB Document...</span>
                <span className="text-xs font-mono mt-2 animate-pulse" style={{ color: themeStyles.secondaryText }}>Assembling digital layout and styles</span>
              </div>
            )}

            {error && (
              <div
                className="flex flex-col items-center justify-center p-6 text-center"
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 3,
                  background: themeStyles.bg,
                  color: themeStyles.text
                }}
              >
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 animate-pulse" style={{ background: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2' }}>
                  <AlertCircle className="w-8 h-8" style={{ color: themeStyles.accent }} />
                </div>
                <h3 className="text-xl font-serif font-semibold mb-2" style={{ color: themeStyles.text }}>
                  Could Not Open Digital Book
                </h3>
                <p className="max-w-md text-sm mb-6 leading-relaxed" style={{ color: themeStyles.secondaryText }}>
                  {error}
                </p>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => setRetryTrigger(prev => prev + 1)}
                    className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-white font-sans transition-all duration-200 cursor-pointer active:scale-95 hover:brightness-110"
                    style={{
                      background: theme === 'sepia' ? '#b45309' : '#3b82f6',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry Loading
                  </button>
                  <button
                    onClick={onClose}
                    className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border font-sans transition-all duration-200 cursor-pointer active:scale-95 hover:bg-black/5 dark:hover:bg-white/5"
                    style={{
                      borderColor: theme === 'dark' ? '#3f3f46' : '#e4e4e7',
                      color: themeStyles.text,
                      background: theme === 'dark' ? '#18181b' : '#f4f4f5',
                    }}
                  >
                    Return to Library
                  </button>
                </div>

                {errorDetail && (
                  <details className="mt-8 text-left max-w-lg w-full">
                    <summary className="text-xs font-mono cursor-pointer select-none opacity-50 hover:opacity-100">
                      Technical Details
                    </summary>
                    <div 
                      className="mt-2 p-3 rounded-lg border text-left font-mono text-[10px] whitespace-pre-wrap max-h-40 overflow-auto"
                      style={{
                        background: theme === 'dark' ? '#18181b' : '#fefefe',
                        borderColor: theme === 'dark' ? '#27272a' : '#e4e4e7',
                        color: themeStyles.secondaryText
                      }}
                    >
                      {errorDetail}
                    </div>
                  </details>
                )}
              </div>
            )}

            <div
              ref={viewerRef}
              className="epub-viewer-viewport overflow-hidden"
              style={{
                width: "100%",
                height: "100%",
                position: "absolute",
                inset: 0,
                background: themeStyles.bg,
                WebkitOverflowScrolling: "touch",
                touchAction: 'pan-y'
              }}
            />
          </>
        );
      })()}
    </ReaderShell>
  );
}