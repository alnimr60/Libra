/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ReadingStatus = 'Currently Reading' | 'To-Be-Read' | 'Finished';

export interface Bookmark {
  id: string;
  page: number;
  cfi?: string;
  label?: string;
  createdAt: string;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  totalPages: number;
  currentPage: number;
  deadline?: string; // ISO date string
  status: ReadingStatus;
  tags: string[];
  readingDirection: 'ltr' | 'rtl';
  directionDetected?: boolean;
  coverUrl?: string; // Data URL or external link
  fileDataId?: string; // ID for IndexedDB storage
  fileName?: string; // Original filename, usually includes extension (.epub, .pdf)
  bookmarks?: Bookmark[];
  addedAt: string; // ISO date string
  lastReadAt?: string; // ISO date string
  currentCfi?: string; // For EPUB persistence
  language?: string; // EPUB language
  identifier?: string; // EPUB Identifier
  description?: string; // EPUB description
  locations?: string; // Serialized epubjs locations
}

export interface ReadingLog {
  date: string; // YYYY-MM-DD
  pagesRead: number;
}

export type GoalFrequency = 'daily' | 'weekly';

export interface ReadingGoal {
  id: string;
  target: number; // number of pages
  frequency: GoalFrequency;
  createdAt: string;
}

export type LanguageCode = 'en' | 'ar' | 'zh' | 'hi' | 'fr' | 'ru' | 'de' | 'ja' | 'bn' | 'pt' | 'ur' | 'id' | 'ng' | 'mr';

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  notificationsEnabled: boolean;
  notificationFrequency: 'once' | 'twice' | 'custom';
  customNotificationTimes: string[]; // ['09:00', '18:00', ...]
  dashboardStyle: 'linear' | 'circular';
  language: LanguageCode;
}

export interface AppData {
  books: Book[];
  settings: AppSettings;
  goals: ReadingGoal[];
  readingLogs: ReadingLog[];
}
