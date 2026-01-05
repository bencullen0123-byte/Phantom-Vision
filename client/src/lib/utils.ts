import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(cents: number | null | undefined, currency: string = 'usd') {
  const safeAmount = cents === null || cents === undefined || isNaN(cents) ? 0 : cents;
  
  const safeCurrency = (currency || 'usd').toUpperCase();

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount / 100);
  } catch (e) {
    // Fallback to USD if currency code is invalid
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(safeAmount / 100);
  }
}
