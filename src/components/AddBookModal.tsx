import React, { useState, useRef, useEffect } from 'react';
import ePub from 'epubjs';
import { Book, ReadingStatus, LanguageCode } from '../types';

import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, CheckCircle, Loader2, Calendar as CalendarIcon, Tag, Book as BookIcon, Image as ImageIcon } from 'lucide-react';
import { extractPDFMetadata, extractPDFSampleText, detectDirectionFromText } from '../lib/pdf';
import { cn } from '../lib/utils';
import { set } from 'idb-keyval';

import { translations } from '../translations';

interface EPUBMetadata {
  title: string;
  author: string;
  language: string;
  coverUrl?: string;
  identifier: string;
  description: string;
  direction: 'ltr' | 'rtl';
  directionDetected: boolean;
  totalPages: number;
}

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
      throw new Error("HTML webpage or provider redirect received. Expected a valid EPUB document archive.");
    }
    if (previewText.toLowerCase().includes("<?xml")) {
      throw new Error("XML document received. Expected a valid EPUB document archive.");
    }
    throw new Error("Invalid file content. The file is not a valid zip/EPUB archive.");
  }
}

async function extractEPUBMetadata(arrayBuffer: ArrayBuffer): Promise<EPUBMetadata> {
  validateEpubBinary(arrayBuffer);
  
  const epubBook = ePub(arrayBuffer) as any;
  await epubBook.ready;

  let title = 'Untitled Book';
  let author = '';
  let language = 'en';
  let coverUrl: string | undefined = undefined;
  let identifier = '';
  let description = '';
  let direction: 'ltr' | 'rtl' = 'ltr';
  let directionDetected = false;

  const meta = epubBook.package?.metadata;
  if (meta) {
    if (meta.title) {
      title = typeof meta.title === 'string' ? meta.title : (meta.title.title || JSON.stringify(meta.title));
    }
    if (meta.creator) {
      author = typeof meta.creator === 'string' ? meta.creator : (meta.creator.creator || JSON.stringify(meta.creator));
    }
    if (meta.language) {
      language = typeof meta.language === 'string' ? meta.language : (meta.language.language || 'en');
    }
    if (meta.identifier) {
      identifier = typeof meta.identifier === 'string' ? meta.identifier : (meta.identifier.identifier || '');
    }
    if (meta.description) {
      description = typeof meta.description === 'string' ? meta.description : '';
    }
    if (meta.direction) {
      direction = meta.direction === 'rtl' ? 'rtl' : 'ltr';
      directionDetected = true;
    }
  }

  // Cover extraction via CoverUrl promise
  try {
    const coverUrlPromise = epubBook.coverUrl();
    if (coverUrlPromise) {
      const resolved = await coverUrlPromise;
      if (resolved) {
        const res = await fetch(resolved);
        const blob = await res.blob();
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(blob);
        coverUrl = await base64Promise;
      }
    }
  } catch (coverErr) {
    console.warn("Failed to extract EPUB cover:", coverErr);
  }

  let totalPages = 100;
  if (epubBook.spine) {
    totalPages = Math.max(10, epubBook.spine.length * 8);
  }

  try {
    epubBook.destroy();
  } catch (e) {
    console.warn("Error destroying dynamic EPUB book representation:", e);
  }

  return {
    title,
    author,
    language,
    coverUrl,
    identifier,
    description,
    direction,
    directionDetected,
    totalPages
  };
}

interface AddBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (book: Book) => void;
  language?: LanguageCode;
}

export default function AddBookModal({ isOpen, onClose, onAdd, language = 'en' }: AddBookModalProps) {
  const isRTL = ['ar', 'ur'].includes(language);
  const t = translations[language];
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Book>>({
    title: '',
    author: '',
    totalPages: 0,
    currentPage: 0,
    status: 'Currently Reading',
    tags: [],
    deadline: '',
    readingDirection: 'ltr',
  });
  const [tagInput, setTagInput] = useState('');
  const [dailyPages, setDailyPages] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    try {
      if (files.length === 1) {
        const file = files[0];
        const isPDF = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
        const isEPUB = file.name.toLowerCase().endsWith('.epub') || file.type === 'application/epub+zip';

        if (!isPDF && !isEPUB) {
          alert('Please upload a PDF or EPUB file.');
          return;
        }

        const arrayBuffer = await file.arrayBuffer();

        if (isPDF) {
          const metadata = await extractPDFMetadata(file); 
          
          const fileId = `pdf_${crypto.randomUUID()}`;
          await set(fileId, arrayBuffer);

          // Auto-detect language via sampled text
          let sampleText = '';
          try {
            sampleText = await extractPDFSampleText(file);
          } catch (e) {
            console.warn("Failed to sample text for language detection", e);
          }
          const direction = detectDirectionFromText(sampleText);

          setFormData(prev => ({
            ...prev,
            title: file.name.replace(/\.pdf$/i, ''),
            author: '',
            totalPages: metadata.pageCount,
            coverUrl: metadata.coverUrl,
            fileDataId: fileId,
            readingDirection: direction,
            directionDetected: !!sampleText,
            fileName: file.name,
            status: 'To-Be-Read'
          }));
        } else {
          // EPUB handling
          const fileId = `epub_${crypto.randomUUID()}`;
          await set(fileId, arrayBuffer);

          const metadata = await extractEPUBMetadata(arrayBuffer);

          setFormData(prev => ({
            ...prev,
            title: metadata.title,
            author: metadata.author,
            totalPages: metadata.totalPages,
            coverUrl: metadata.coverUrl,
            fileDataId: fileId,
            readingDirection: metadata.direction,
            directionDetected: metadata.directionDetected,
            fileName: file.name,
            language: metadata.language,
            identifier: metadata.identifier,
            description: metadata.description,
            status: 'To-Be-Read'
          }));
        }
        setStep(2);
      } else {
        for (const file of Array.from(files)) {
          const isPDF = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
          const isEPUB = file.name.toLowerCase().endsWith('.epub') || file.type === 'application/epub+zip';

          if (!isPDF && !isEPUB) {
            console.warn(`Skipping unsupported file type: ${file.name}`);
            continue;
          }

          const arrayBuffer = await file.arrayBuffer();

          if (isPDF) {
            const metadata = await extractPDFMetadata(file); 
            
            const fileId = `pdf_${crypto.randomUUID()}`;
            await set(fileId, arrayBuffer);

            // Auto-detect language via sampled text
            let sampleText = '';
            try {
              sampleText = await extractPDFSampleText(file);
            } catch (e) {
              console.warn("Failed to sample text for language detection", e);
            }
            const direction = detectDirectionFromText(sampleText);

            const newBook: Book = {
              id: crypto.randomUUID(),
              title: file.name.replace(/\.pdf$/i, ''),
              author: '',
              totalPages: metadata.pageCount,
              currentPage: 0,
              status: 'To-Be-Read',
              tags: [],
              readingDirection: direction,
              directionDetected: !!sampleText,
              coverUrl: metadata.coverUrl,
              fileDataId: fileId,
              fileName: file.name,
              addedAt: new Date().toISOString(),
            };
            onAdd(newBook);
          } else {
            // EPUB handling in bulk
            const fileId = `epub_${crypto.randomUUID()}`;
            await set(fileId, arrayBuffer);

            const metadata = await extractEPUBMetadata(arrayBuffer);

            const newBook: Book = {
              id: crypto.randomUUID(),
              title: metadata.title,
              author: metadata.author,
              totalPages: metadata.totalPages,
              currentPage: 0,
              status: 'To-Be-Read',
              tags: [],
              readingDirection: metadata.direction,
              directionDetected: metadata.directionDetected,
              coverUrl: metadata.coverUrl,
              fileDataId: fileId,
              fileName: file.name,
              language: metadata.language,
              identifier: metadata.identifier,
              description: metadata.description,
              addedAt: new Date().toISOString(),
            };
            onAdd(newBook);
          }
        }
        onClose();
      }
    } catch (error) {
      console.error('Failed to parse book files:', error);
      alert('Error reading some book files.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData(prev => ({ ...prev, coverUrl: event.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleAddTag = () => {
    if (tagInput && !formData.tags?.includes(tagInput)) {
      setFormData(prev => ({ ...prev, tags: [...(prev.tags || []), tagInput] }));
      setTagInput('');
    }
  };

  const calculateDailyPagesNeeded = (deadline: string, current: number, total: number) => {
    if (!deadline || total <= current) return 0;
    const target = new Date(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? Math.ceil((total - current) / diffDays) : (total - current);
  };

  const calculateDeadlineFromDaily = (daily: number, current: number, total: number) => {
    if (daily <= 0 || total <= current) return '';
    const daysNeeded = Math.ceil((total - current) / daily);
    const target = new Date();
    target.setDate(target.getDate() + daysNeeded);
    return target.toISOString().split('T')[0];
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.totalPages) {
      alert('Please enter at least Title and Total Pages.');
      return;
    }

    const newBook: Book = {
      id: crypto.randomUUID(),
      title: formData.title || 'Untitled',
      author: formData.author,
      totalPages: formData.totalPages || 0,
      currentPage: formData.currentPage || 0,
      status: formData.status || 'To-Be-Read',
      tags: formData.tags || [],
      readingDirection: formData.readingDirection || 'ltr',
      directionDetected: formData.directionDetected,
      coverUrl: formData.coverUrl,
      fileDataId: formData.fileDataId,
      fileName: formData.fileName,
      deadline: formData.deadline,
      language: formData.language,
      identifier: formData.identifier,
      description: formData.description,
      addedAt: new Date().toISOString(),
    };

    onAdd(newBook);
    reset();
    onClose();
  };

  const reset = () => {
    setStep(1);
    setFormData({
      title: '',
      author: '',
      totalPages: 0,
      currentPage: 0,
      status: 'Currently Reading',
      tags: [],
      deadline: '',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 pt-[calc(1rem+var(--msp-top))] pb-[calc(1rem+var(--msp-bottom))]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-[#1A1614] w-full max-w-lg rounded-[32px] overflow-hidden flex flex-col max-h-full"
      >
        <div className="px-6 py-4 flex justify-between items-center border-b border-black/5 dark:border-white/5" dir={isRTL ? "rtl" : "ltr"}>
          <h2 className={cn("text-lg font-serif", isRTL ? "font-bold" : "font-medium")}>
            {t.addToLibrary}
          </h2>
          <button onClick={onClose} className={cn("p-1 opacity-50 hover:opacity-100", isRTL ? "-ml-1" : "-mr-1")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto no-scrollbar flex-1" dir={isRTL ? "rtl" : "ltr"}>
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-8"
              >
                <div className="text-center space-y-2">
                  <p className={cn("text-sm opacity-60", isRTL && "font-bold")}>
                    {t.uploadPDF.replace(/PDF/g, "PDF / EPUB")}
                  </p>
                </div>

                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-video border-2 border-dashed border-black/10 dark:border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                >
                  <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.epub" multiple onChange={handleFileChange} />
                  {isLoading ? (
                    <Loader2 className="w-12 h-12 animate-spin opacity-40" />
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-black dark:bg-[#E0D8D0] text-white dark:text-black rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                        <Upload className="w-8 h-8" />
                      </div>
                      <span className={cn("text-sm font-medium", isRTL && "font-bold")}>
                        {t.dropPDF.replace(/PDFs?/gi, "PDF / EPUB")}
                      </span>
                    </>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-black/5 dark:border-white/5"></div>
                  </div>
                  <div className={cn("relative flex justify-center text-xs uppercase tracking-widest opacity-30", isRTL && "tracking-normal")}>
                    <span className="bg-white dark:bg-[#1A1614] px-4">
                      {t.orStartManually}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => setStep(2)}
                  className={cn("w-full py-4 text-sm font-medium bg-black/5 dark:bg-white/5 rounded-2xl hover:bg-black/10 transition-colors", isRTL && "font-bold")}
                >
                  {t.enterManual}
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {/* Visual Preview */}
                <div className="flex gap-3 items-start">
                  <div 
                    onClick={() => coverInputRef.current?.click()}
                    className="group relative w-20 h-28 bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden shadow-md flex-shrink-0 cursor-pointer"
                  >
                    <input type="file" ref={coverInputRef} className="hidden" accept="image/*" onChange={handleCoverChange} />
                    {formData.coverUrl ? (
                      <img src={formData.coverUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center opacity-20 text-center p-1">
                         <BookIcon className="w-8 h-8" />
                         <span className="text-[7px] mt-1 font-bold">{t.addCover}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ImageIcon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-3">
                    <InputGroup 
                      icon={<BookIcon className="w-4 h-4" />}
                      label={t.bookTitle}
                      value={formData.title}
                      onChange={(val) => setFormData(p => ({ ...p, title: val }))}
                      placeholder={t.searchPlaceholder}
                      isRTL={isRTL}
                    />
                    <InputGroup 
                      icon={<Tag className="w-4 h-4" />}
                      label={t.author}
                      value={formData.author}
                      onChange={(val) => setFormData(p => ({ ...p, author: val }))}
                      placeholder={t.unknownAuthor}
                      isRTL={isRTL}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <InputGroup 
                    label={t.totalPages}
                    type="number"
                    value={formData.totalPages}
                    onChange={(val) => {
                      const num = parseInt(val) || 0;
                      setFormData(p => ({ ...p, totalPages: num }));
                      setDailyPages(calculateDailyPagesNeeded(formData.deadline || '', formData.currentPage || 0, num));
                    }}
                    isRTL={isRTL}
                  />
                  <div className="space-y-1.5 text-right">
                    <label className={cn("text-[10px] uppercase tracking-widest opacity-40 font-semibold", isRTL ? "mr-1" : "ml-1")}>
                      {t.status}
                    </label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData(p => ({ ...p, status: e.target.value as ReadingStatus }))}
                      className="w-full px-4 py-3 bg-black/5 dark:bg-white/5 rounded-2xl text-sm focus:outline-none"
                    >
                      <option value="To-Be-Read">{t.toBeRead}</option>
                      <option value="Currently Reading">{t.currentlyReading}</option>
                      <option value="Finished">{t.finished}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <InputGroup 
                    icon={<CalendarIcon className="w-4 h-4" />}
                    label={t.deadline}
                    type="date"
                    value={formData.deadline}
                    onChange={(val) => {
                      setFormData(p => ({ ...p, deadline: val }));
                      setDailyPages(calculateDailyPagesNeeded(val, formData.currentPage || 0, formData.totalPages || 0));
                    }}
                    isRTL={isRTL}
                  />
                  <InputGroup 
                    label={t.goal}
                    type="number"
                    value={dailyPages}
                    placeholder={t.daily}
                    onChange={(val) => {
                      const num = parseInt(val) || 0;
                      setDailyPages(num);
                      setFormData(p => ({ ...p, deadline: calculateDeadlineFromDaily(num, formData.currentPage || 0, formData.totalPages || 0) }));
                    }}
                    isRTL={isRTL}
                  />
                </div>

                <div className="space-y-1 text-right">
                  <label className={cn("text-[10px] uppercase tracking-widest opacity-40 font-semibold", isRTL ? "mr-1" : "ml-1")}>
                     {t.tags}
                  </label>
                  <div className="flex gap-1.5 mb-1.5 flex-wrap">
                    {formData.tags?.map(t => (
                      <span key={t} className="px-2 py-0.5 bg-black/5 dark:bg-white/5 rounded-lg text-[10px] flex items-center gap-1">
                        {t}
                        <button onClick={() => setFormData(p => ({ ...p, tags: p.tags?.filter(tag => tag !== t) }))}>
                          <X className="w-2.5 h-2.5 hover:text-red-400" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder={t.addTag}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                      className={cn("flex-1 px-3 py-2 bg-black/5 dark:bg-white/5 rounded-xl text-xs focus:outline-none", isRTL && "text-right")}
                    />
                    <button onClick={handleAddTag} className="p-2 bg-black dark:bg-[#E0D8D0] text-white dark:text-black rounded-xl">
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setStep(1)}
                    className={cn("flex-1 py-3 text-xs font-medium border border-black/10 dark:border-white/10 rounded-2xl", isRTL && "font-bold")}
                  >
                    {t.back}
                  </button>
                  <button 
                    onClick={handleSubmit}
                    className={cn("flex-[2] py-3 text-xs font-medium bg-black dark:bg-[#E0D8D0] text-white dark:text-black rounded-2xl shadow-xl hover:scale-[1.01] transition-transform", isRTL && "font-bold")}
                  >
                    {t.finishAndAdd}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function InputGroup({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  type = 'text', 
  icon,
  isRTL
}: { 
  label: string, 
  value: any, 
  onChange: (val: string) => void, 
  placeholder?: string, 
  type?: string,
  icon?: React.ReactNode,
  isRTL?: boolean
}) {
  return (
    <div className={cn("space-y-1.5 flex-1", isRTL ? "text-right" : "text-left")}>
      <label className={cn("text-[10px] uppercase tracking-widest opacity-40 font-semibold", isRTL ? "mr-1" : "ml-1")}>{label}</label>
      <div className="relative">
        {icon && <div className={cn("absolute top-1/2 -translate-y-1/2 opacity-30", isRTL ? "right-4" : "left-4")}>{icon}</div>}
        <input 
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full py-3 bg-black/5 dark:bg-white/5 rounded-2xl text-sm focus:outline-none",
            icon ? (isRTL ? "pr-11 pl-4 text-right" : "pl-11 pr-4") : "px-4",
            isRTL && !icon && "text-right"
          )}
        />
      </div>
    </div>
  );
}
