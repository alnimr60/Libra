import React, { useState, useRef } from 'react';
import { Book, ReadingStatus, LanguageCode } from '../types';

import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, CheckCircle, Loader2, Calendar as CalendarIcon, Tag, Book as BookIcon, Image as ImageIcon } from 'lucide-react';
import { extractPDFMetadata, extractPDFSampleText, detectDirectionFromText } from '../lib/pdf';
import { cn } from '../lib/utils';
import { set } from 'idb-keyval';

import { translations } from '../translations';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    try {
      if (files.length === 1) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
          alert('Please upload a PDF file.');
          return;
        }

        const arrayBuffer = await file.arrayBuffer();
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
          title: file.name.replace('.pdf', ''),
          totalPages: metadata.pageCount,
          coverUrl: metadata.coverUrl,
          fileDataId: fileId,
          readingDirection: direction,
          directionDetected: !!sampleText,
          status: 'To-Be-Read'
        }));
        setStep(2);
      } else {
        for (const file of Array.from(files)) {
          if (file.type !== 'application/pdf') {
            console.warn(`Skipping non-PDF file: ${file.name}`);
            continue;
          }

          const arrayBuffer = await file.arrayBuffer();
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
            title: file.name.replace('.pdf', ''),
            author: '',
            totalPages: metadata.pageCount,
            currentPage: 0,
            status: 'To-Be-Read',
            tags: [],
            readingDirection: direction,
            directionDetected: !!sampleText,
            coverUrl: metadata.coverUrl,
            fileDataId: fileId,
            addedAt: new Date().toISOString(),
          };
          onAdd(newBook);
        }
        onClose();
      }
    } catch (error) {
      console.error('Failed to parse PDFs:', error);
      alert('Error reading some PDF files.');
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
      deadline: formData.deadline,
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-6 pt-[calc(1.5rem+var(--msp-top))] pb-[calc(1.5rem+var(--msp-bottom))]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-[#1A1614] w-full max-w-lg rounded-[32px] overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-8 py-6 flex justify-between items-center border-b border-black/5 dark:border-white/5" dir={isRTL ? "rtl" : "ltr"}>
          <h2 className={cn("text-xl font-serif", isRTL ? "font-bold" : "font-medium")}>
            {t.addToLibrary}
          </h2>
          <button onClick={onClose} className={cn("p-2 opacity-50 hover:opacity-100", isRTL ? "-ml-2" : "-mr-2")}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto flex-1" dir={isRTL ? "rtl" : "ltr"}>
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
                    {t.uploadPDF}
                  </p>
                </div>

                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-video border-2 border-dashed border-black/10 dark:border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                >
                  <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" multiple onChange={handleFileChange} />
                  {isLoading ? (
                    <Loader2 className="w-12 h-12 animate-spin opacity-40" />
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-black dark:bg-[#E0D8D0] text-white dark:text-black rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                        <Upload className="w-8 h-8" />
                      </div>
                      <span className={cn("text-sm font-medium", isRTL && "font-bold")}>
                        {t.dropPDF}
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
                className="space-y-6"
              >
                {/* Visual Preview */}
                <div className="flex gap-4 items-start">
                  <div 
                    onClick={() => coverInputRef.current?.click()}
                    className="group relative w-24 h-32 bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden shadow-md flex-shrink-0 cursor-pointer"
                  >
                    <input type="file" ref={coverInputRef} className="hidden" accept="image/*" onChange={handleCoverChange} />
                    {formData.coverUrl ? (
                      <img src={formData.coverUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center opacity-20">
                         <BookIcon className="w-10 h-10" />
                         <span className="text-[8px] mt-1 font-bold">{t.addCover}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ImageIcon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-4">
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

                <div className="grid grid-cols-2 gap-4">
                  <InputGroup 
                    label={t.totalPages}
                    type="number"
                    value={formData.totalPages}
                    onChange={(val) => setFormData(p => ({ ...p, totalPages: parseInt(val) || 0 }))}
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

                <InputGroup 
                  icon={<CalendarIcon className="w-4 h-4" />}
                  label={t.deadline}
                  type="date"
                  value={formData.deadline}
                  onChange={(val) => setFormData(p => ({ ...p, deadline: val }))}
                  isRTL={isRTL}
                />

                <div className="space-y-1.5 text-right">
                  <label className={cn("text-[10px] uppercase tracking-widest opacity-40 font-semibold", isRTL ? "mr-1" : "ml-1")}>
                     {t.tags}
                  </label>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {formData.tags?.map(t => (
                      <span key={t} className="px-3 py-1 bg-black/5 dark:bg-white/5 rounded-lg text-xs flex items-center gap-1">
                        {t}
                        <button onClick={() => setFormData(p => ({ ...p, tags: p.tags?.filter(tag => tag !== t) }))}>
                          <X className="w-3 h-3 hover:text-red-400" />
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
                      className={cn("flex-1 px-4 py-2 bg-black/5 dark:bg-white/5 rounded-xl text-sm focus:outline-none", isRTL && "text-right")}
                    />
                    <button onClick={handleAddTag} className="p-2 bg-black dark:bg-[#E0D8D0] text-white dark:text-black rounded-xl">
                      <CheckCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setStep(1)}
                    className={cn("flex-1 py-4 text-sm font-medium border border-black/10 dark:border-white/10 rounded-2xl", isRTL && "font-bold")}
                  >
                    {t.back}
                  </button>
                  <button 
                    onClick={handleSubmit}
                    className={cn("flex-[2] py-4 text-sm font-medium bg-black dark:bg-[#E0D8D0] text-white dark:text-black rounded-2xl shadow-xl hover:scale-[1.02] transition-transform", isRTL && "font-bold")}
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
