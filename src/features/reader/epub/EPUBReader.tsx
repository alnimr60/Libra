import React, { useEffect, useRef, useState, useCallback } from 'react';
import ePub, { Rendition, Book as EpubBook } from 'epubjs';
import { get } from 'idb-keyval';
import { cn } from '../../../lib/utils';
import { Book, Bookmark } from '../../../types';
import { useReader } from '../ReaderContext';
import ReaderShell from '../ReaderShell';

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
  const [toc, setToc] = useState<NavItem[]>([]);
  const [location, setLocation] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [totalPages, setTotalPages] = useState(100); // EPUB pages are dynamic, we use it for slider
  
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
    if (fileData instanceof Blob) return fileData.arrayBuffer();
    if (fileData instanceof ArrayBuffer) return fileData;
    if (ArrayBuffer.isView(fileData)) {
      const view = fileData as ArrayBufferView;
      return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    }
    throw new Error(`Unsupported EPUB storage type: ${Object.prototype.toString.call(fileData)}`);
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

  useEffect(() => {
    let isCancelled = false;
    const initBook = async () => {
      try {
        if (initializedRef.current) {
          console.log("[EPUB_GUARD] duplicate init prevented");
          return;
        }

        initializedRef.current = true;
        console.log("[EPUB_STEP_1] component mounted");
        setLoading(true);
        setIsReady(false);

        if (!book.fileDataId) throw new Error('No file data ID found');
        console.log("[EPUB_STEP_2] file lookup start");
        const fileData = await get(book.fileDataId);
        console.log("[EPUB_STEP_3] file lookup success", {
          exists: !!fileData,
          type: typeof fileData,
          size:
            fileData?.size ||
            fileData?.byteLength
        });

        if (!fileData) throw new Error('File not found in storage');
        console.log("[EPUB_STEP_4] normalization start");
        const epubData = await normalizeEpubData(fileData);
        console.log("[EPUB_STEP_5] normalization complete", {
          byteLength: epubData?.byteLength
        });

        console.log("[EPUB_STEP_6] epub.js constructor start");
        const epubBook = ePub(epubData, { openAs: 'epub' } as any);
        bookRef.current = epubBook;
        console.log("[EPUB_STEP_7] epub.js constructor success");

        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (isCancelled) return;
        const viewer = viewerRef.current;
        console.log("[EPUB_STEP_8] viewerRef check", {
          exists: !!viewerRef.current,
          width: viewerRef.current?.clientWidth,
          height: viewerRef.current?.clientHeight,
        });
        if (!viewer) throw new Error('EPUB viewer container is not mounted');

        const width = viewer.clientWidth;
        const height = viewer.clientHeight;
        if (width <= 0 || height <= 0) {
          throw new Error(`EPUB viewer has invalid dimensions: ${width}x${height}`);
        }

        epubBook.ready
          .then(() => {
            if (!isCancelled) {
              console.log("[EPUB_BOOK_READY]");
            }
          })
          .catch((error: unknown) => {
            if (!isCancelled) {
              console.error("[EPUB_BOOK_READY_ERROR]", error);
            }
          });

        epubBook.loaded.navigation
          .then((navigation: any) => {
            if (!isCancelled) {
              console.log("[EPUB_NAVIGATION_READY]", navigation);
              setToc(navigation.toc || []);
            }
          })
          .catch((error: unknown) => {
            if (!isCancelled) {
              console.error("[EPUB_NAVIGATION_ERROR]", error);
            }
          });

        epubBook.loaded.spine
          .then((spine: any) => {
            if (!isCancelled) {
              console.log("[EPUB_SPINE_READY]", spine);
            }
          })
          .catch((error: unknown) => {
            if (!isCancelled) {
              console.error("[EPUB_SPINE_ERROR]", error);
            }
          });

        epubBook.loaded.metadata
          .then((metadata: any) => {
            if (!isCancelled) {
              console.log("[EPUB_METADATA_READY]", metadata);
            }
          })
          .catch((error: unknown) => {
            if (!isCancelled) {
              console.error("[EPUB_METADATA_ERROR]", error);
            }
          });

        console.log("[EPUB_STEP_9] renderTo start");
        const rendition = epubBook.renderTo(viewer, {
          width: '100%',
          height: '100%',
          flow: 'paginated',
          manager: 'default',
          spread: 'none'
        });

        renditionRef.current = rendition;
        console.log("[EPUB_STEP_10] renderTo success");

        rendition.on("rendered", (section: any) => {
          console.log("[EPUB_RENDERED]", section);
        });

        rendition.on("displayed", (section: any) => {
          console.log("[EPUB_DISPLAYED]", section);
        });

        rendition.on("relocated", (location: any) => {
          console.log("[EPUB_RELOCATED]", location);
        });

        rendition.on("started", () => {
          console.log("[EPUB_STARTED]");
        });

        rendition.on("layout", (layout: any) => {
          console.log("[EPUB_LAYOUT]", layout);
        });

        rendition.on('relocated', (location: any) => {
          if (isCancelled) return;
          setLocation(location);
          const perc = location.start.percentage || 0;
          setProgress(Math.round(perc * 100));
          const approxPage = Math.max(1, Math.ceil(perc * 100));
          onPageChange(approxPage, location.start.cfi);
        });

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              console.log("[EPUB_DISPLAY_ATTEMPT]");
              rendition.display();
            } catch (e) {
              console.error("[EPUB_DISPLAY_ERROR]", e);
            }
          });
        });

        if (isCancelled) return;
        console.log("[EPUB_STEP_12] display success");

        setIsReady(true);
        setLoading(false);
        console.log("[EPUB_STEP_13] loading=false");
      } catch (e) {
        console.error("[EPUB_ERROR]", e);
        if (!isCancelled) {
          setIsReady(false);
          setLoading(false);
        }
      }
    };
    initBook();
    return () => {
      isCancelled = true;
      initializedRef.current = false;
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
  }, [book.id, book.fileDataId]);

  useEffect(() => {
    if (renditionRef.current && isReady) {
      renditionRef.current.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize, isReady]);

  useEffect(() => {
    if (isReady) applyTheme(theme);
  }, [theme, applyTheme, isReady]);

  const currentPage = Math.max(1, Math.ceil(progress));

  return (
    <ReaderShell
      book={book}
      title={book.title}
      onClose={onClose}
      currentPage={currentPage}
      totalPages={100}
      progress={progress}
      onPageChange={() => {}}
      onUpdateBookmarks={onUpdateBookmarks}
      onPrev={() => renditionRef.current?.prev()}
      onNext={() => renditionRef.current?.next()}
      onJumpToPage={(p) => {
        const perc = p / 100;
        const cfi = bookRef.current?.locations.cfiFromPercentage(perc);
        if (cfi) renditionRef.current?.display(cfi);
      }}
      zoomPercentage={fontSize}
      onZoomIn={handleZoomIn}
      onZoomOut={handleZoomOut}
      onResetZoom={handleZoomReset}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: "white",
        }}
      >
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Loading EPUB Engine
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
    </ReaderShell>
  );
}