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
  const [location, setLocation] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [totalPages, setTotalPages] = useState(100); // EPUB pages are dynamic, we use it for slider

  // Pipeline execution stages
  type EPUBStage = 'WAITING_CONTAINER' | 'WAITING_LAYOUT' | 'CREATING_RENDITION' | 'DISPLAYING' | 'READY' | 'FAILED';
  const [stage, setStage] = useState<EPUBStage>('WAITING_CONTAINER');
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const initializedRef = useRef(false);

  const { theme, fontSize, setFontSize, direction } = useReader();

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
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timeoutId!);
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
        'body': {
          'padding': '0 40px !important',
          'font-family': 'Inter, system-ui, sans-serif !important',
          'line-height': '1.8 !important',
          'direction': isRTL ? 'rtl !important' : 'ltr !important',
          'text-align': 'justify !important'
        },
        'img': { 'max-width': '100% !important' }
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

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const last = lastDimensionsRef.current;
          if (!last || Math.abs(last.width - width) > 1 || Math.abs(last.height - height) > 1) {
            lastDimensionsRef.current = { width, height };
            console.log(`[EPUB_CONTAINER_READY] Dimensions updated: ${width}x${height}`);
            setDimensions({ width, height });
          }
        }
      }
    });

    observer.observe(viewer);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      setStage('WAITING_CONTAINER');
      return;
    }

    console.log("[EPUB_LAYOUT_READY] Layout is stabilized.");
    setStage('CREATING_RENDITION');

    const initBook = async () => {
      try {
        setLoading(true);
        setError(null);
        setErrorDetail(null);
        setIsReady(false);

        if (!book.fileDataId) {
          throw new Error('No local file data ID associated with this library entry.');
        }

        console.log("[EPUB_STEP_2] file lookup start");
        const fileData = await get(book.fileDataId);
        if (!fileData) {
          throw new Error('This book\'s data could not be found in local offline storage (IndexedDB). It might have been deleted, or the offline sync failed.');
        }

        console.log("[EPUB_STEP_4] normalization start");
        const epubData = await normalizeEpubData(fileData);
        
        // EPUB binary validation
        validateEpubBinary(epubData);

        if (isCancelled) return;

        // Clean up any stale partial instances to prevent deadlocks or overlap
        if (renditionRef.current) {
          try { renditionRef.current.destroy(); } catch (_) {}
          renditionRef.current = null;
        }
        if (bookRef.current) {
          try { bookRef.current.destroy(); } catch (_) {}
          bookRef.current = null;
        }

        console.log("[EPUB_STEP_6] epub.js constructor start");
        const epubBook = ePub(epubData) as any;
        bookRef.current = epubBook;

        setStage('DISPLAYING');
        console.log("[EPUB_DISPLAY_START] Display process starting.");

        const viewer = viewerRef.current;
        if (!viewer) {
          throw new Error('EPUB viewer container is not mounted.');
        }

        // Wait for ePub book to parse structures using our timeout guard (only external async calls)
        await withTimeout(epubBook.ready, 30000, "[EPUB_BOOK_READY]");
        console.log("[EPUB_READY] EPUB book parsed structures successfully.");

        // TOC extraction
        try {
          const navigation = (await withTimeout(epubBook.loaded.navigation, 8000, "[EPUB_NAVIGATION_READY]")) as any;
          if (!isCancelled) {
            setToc(navigation.toc || []);
          }
        } catch (e) {
          console.warn("[EPUB_NAVIGATION_ERROR] Optional navigation loading timed out/failed:", e);
        }

        if (isCancelled) return;

        // Create Rendition at exact dimension scale
        console.log("[EPUB_RENDITION_CREATED] renderTo invoked.");
        const rendition = epubBook.renderTo(viewer, {
          width: '100%',
          height: '100%',
          flow: 'paginated',
          manager: 'default',
          spread: 'none'
        });
        renditionRef.current = rendition;

        // Register event handlers
        rendition.on("rendered", (section: any) => {
          console.log("[EPUB_RENDERED] section index:", section?.index);
        });

        rendition.on("displayed", (section: any) => {
          console.log("[EPUB_DISPLAYED] section index:", section?.index);
        });

        rendition.on("started", () => {
          console.log("[EPUB_STARTED]");
        });

        rendition.on("layout", (layout: any) => {
          console.log("[EPUB_LAYOUT] width:", layout?.width);
        });

        rendition.on('relocated', (location: any) => {
          if (isCancelled) return;
          console.log("[EPUB_RELOCATED] cfi:", location?.start?.cfi, "percentage:", location?.start?.percentage);
          setLocation(location);
          const perc = location?.start?.percentage || 0;
          setProgress(Math.round(perc * 100));

          // Calculate approximate location index from total locations
          const totalLocs = (epubBook.locations as any).total || 100;
          const currentLocIndex = (epubBook.locations as any).locationFromCfi(location?.start?.cfi) as any;
          const approxPage = typeof currentLocIndex === 'number' && currentLocIndex >= 0 ? currentLocIndex + 1 : Math.max(1, Math.ceil(perc * totalLocs));

          onPageChange(approxPage, location?.start?.cfi);
        });

        // Load Cached Locations if present to enable performance-neutral pagination/seeking instantly
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

        const savedCfi = book.currentCfi;
        console.log("[EPUB_DISPLAY_START] Displaying CFI=" + savedCfi);
        await withTimeout(rendition.display(savedCfi || undefined), 15000, "[EPUB_DISPLAY_SUCCESS]");
        console.log("[EPUB_DISPLAY_SUCCESS] Rendition content shown.");

        if (isCancelled) return;
        setIsReady(true);
        setLoading(false);
        setStage('READY');
        console.log("[EPUB_READY] EPUB Engine is fully ready.");

        // Generate Locations asynchronously in the background so it never blocks or deadlocks display
        if (!(epubBook.locations as any).total) {
          console.log("[EPUB_LOCATIONS_GENERATING_START] Generating book path locations in background...");
          (epubBook.locations as any).generate(2048)
            .then(() => {
              if (isCancelled) return;
              const totalGenerated = (epubBook.locations as any).total || 100;
              console.log("[EPUB_LOCATIONS_GENERATED] Location paths successfully drawn in background. total:", totalGenerated);
              setTotalPages(totalGenerated);
              
              try {
                const serialized = (epubBook.locations as any).save();
                if (serialized) {
                  console.log("[EPUB_LOCATIONS_CACHE] Storing locations cache to storage, length:", serialized.length);
                  updateBook({
                    ...book,
                    locations: serialized,
                    totalPages: totalGenerated
                  });
                }
              } catch (err) {
                console.warn("Could not cache generated locations:", err);
              }
            })
            .catch((err: any) => {
              console.warn("[EPUB_LOCATIONS_GENERATED_ERR] Failed to generate locations in background:", err);
            });
        }

      } catch (e: any) {
        console.error("[EPUB_FAIL]", e);
        if (!isCancelled) {
          setIsReady(false);
          setLoading(false);
          setStage('FAILED');
          setError(e?.message || 'Failed to parse and initialize the EPUB file format.');
          setErrorDetail(e?.stack || '');

          // Explicit cleanup and resource deallocation on failures to prevent deadlocks
          if (renditionRef.current) {
            try { renditionRef.current.destroy(); } catch (_) {}
            renditionRef.current = null;
          }
          if (bookRef.current) {
            try { bookRef.current.destroy(); } catch (_) {}
            bookRef.current = null;
          }
        }
      }
    };

    initBook();

    return () => {
      isCancelled = true;
      try {
        renditionRef.current?.destroy();
      } catch (e) {
        console.warn("[EPUB_CLEANUP_RENDITION_ERROR]", e);
      }
      try {
        bookRef.current?.destroy();
      } catch (e) {
        console.warn("[EPUB_CLEANUP_BOOK_ERROR]", e);
      }
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [book.id, book.fileDataId, dimensions, retryTrigger]);

  useEffect(() => {
    if (renditionRef.current && isReady) {
      renditionRef.current.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize, isReady]);

  useEffect(() => {
    if (isReady) applyTheme(theme);
  }, [theme, applyTheme, isReady]);

  const locationsObj = bookRef.current ? (bookRef.current.locations as any) : null;
  const currentLocIndex = (locationsObj && location)
    ? locationsObj.locationFromCfi(location.start.cfi) as any
    : -1;
  const currentPage = typeof currentLocIndex === 'number' && currentLocIndex >= 0 ? currentLocIndex + 1 : Math.max(1, Math.ceil((progress / 100) * totalPages));

  return (
    <ReaderShell
      book={book}
      title={book.title}
      onClose={onClose}
      currentPage={currentPage}
      totalPages={totalPages}
      progress={progress}
      onPageChange={() => {}}
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
      onJumpToPage={(p) => {
        const bookObj = bookRef.current;
        if (!bookObj || !renditionRef.current) return;

        const percentage = p / (totalPages || 100);
        const cfi = (bookObj.locations && typeof (bookObj.locations as any).cfiFromPercentage === 'function') 
          ? (bookObj.locations as any).cfiFromPercentage(percentage) 
          : undefined;

        if (cfi) {
          renditionRef.current.display(cfi);
        } else {
          // Fallback to location index
          try {
            const locIndex = Math.max(0, Math.min(p - 1, (((bookObj.locations as any)?.total || 1) as number) - 1));
            const locationCfi = (bookObj.locations as any)?.cfiFromIndex(locIndex);
            if (locationCfi) {
              renditionRef.current.display(locationCfi);
            }
          } catch (err) {
            console.error("Jump to page failed:", err);
          }
        }
      }}
      zoomPercentage={fontSize}
      onZoomIn={handleZoomIn}
      onZoomOut={handleZoomOut}
      onResetZoom={handleZoomReset}
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
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              background: themeStyles.bg,
              color: themeStyles.text,
            }}
          >
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
              style={{
                width: "100%",
                height: "100%",
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                background: "transparent",
              }}
            />
          </div>
        );
      })()}
    </ReaderShell>
  );
}