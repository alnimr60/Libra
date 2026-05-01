/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ReadingStatus = 'Currently Reading' | 'To-Be-Read' | 'Finished';

export interface Book {
  id: string;
  title: string;
  author?: string;
  totalPages: number;
  currentPage: number;
  deadline?: string; // ISO date string
  status: ReadingStatus;
  tags: string[];
  coverUrl?: string; // Data URL or external link
  fileDataId?: string; // ID for IndexedDB storage
  addedAt: string; // ISO date string
  lastReadAt?: string; // ISO date string
}

export interface AppSettings {
  theme: 'light' | 'dark';
  notificationsEnabled: boolean;
  notificationFrequency: 'once' | 'twice' | 'custom';
  customNotificationTimes: string[]; // ['09:00', '18:00', ...]
}
