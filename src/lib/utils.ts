import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculatePagesPerDay(totalPages: number, currentPage: number, deadlineStr?: string): number {
  if (!deadlineStr) return 0;
  
  const deadline = new Date(deadlineStr);
  const now = new Date();
  
  // Calculate difference in days
  const diffTime = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return totalPages - currentPage;
  
  const remainingPages = totalPages - currentPage;
  return Math.ceil(remainingPages / diffDays);
}

export function getDaysRemaining(deadlineStr?: string): number {
  if (!deadlineStr) return 0;
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffTime = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}
