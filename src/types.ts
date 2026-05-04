/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ReadingStatus = 'Currently Reading' | 'To-Be-Read' | 'Finished';

export interface Bookmark {
  id: string;
  page: number;
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
  coverUrl?: string; // Data URL or external link
  fileDataId?: string; // ID for IndexedDB storage
  bookmarks?: Bookmark[];
  addedAt: string; // ISO date string
  lastReadAt?: string; // ISO date string
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

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  notificationsEnabled: boolean;
  notificationFrequency: 'once' | 'twice' | 'custom';
  customNotificationTimes: string[]; // ['09:00', '18:00', ...]
  dashboardStyle: 'linear' | 'circular';
  language: 'en' | 'ar';
}

export interface AppData {
  books: Book[];
  settings: AppSettings;
  goals: ReadingGoal[];
  readingLogs: ReadingLog[];
}
