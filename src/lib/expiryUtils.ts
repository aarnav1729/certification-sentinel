import { differenceInDays, differenceInMonths, differenceInWeeks, isPast, parseISO } from 'date-fns';

export type ExpiryStatus = 
  | 'overdue' 
  | 'day-before' 
  | 'week' 
  | '2-weeks' 
  | 'month' 
  | '3-months' 
  | '6-months' 
  | 'safe';

export const getExpiryStatus = (validityUpto: string): ExpiryStatus => {
  if (!validityUpto) return 'safe';
  
  const expiryDate = parseISO(validityUpto);
  const today = new Date();
  
  if (isPast(expiryDate)) {
    return 'overdue';
  }
  
  const daysUntil = differenceInDays(expiryDate, today);
  const weeksUntil = differenceInWeeks(expiryDate, today);
  const monthsUntil = differenceInMonths(expiryDate, today);
  
  if (daysUntil <= 1) return 'day-before';
  if (daysUntil <= 7) return 'week';
  if (weeksUntil <= 2) return '2-weeks';
  if (monthsUntil <= 1) return 'month';
  if (monthsUntil <= 3) return '3-months';
  if (monthsUntil <= 6) return '6-months';
  
  return 'safe';
};

export const getExpiryLabel = (status: ExpiryStatus): string => {
  const labels: Record<ExpiryStatus, string> = {
    'overdue': 'Overdue',
    'day-before': 'Expires Tomorrow',
    'week': 'Expires in 1 Week',
    '2-weeks': 'Expires in 2 Weeks',
    'month': 'Expires in 1 Month',
    '3-months': 'Expires in 3 Months',
    '6-months': 'Expires in 6 Months',
    'safe': 'Valid',
  };
  return labels[status];
};

export const getExpiryColor = (status: ExpiryStatus): 'destructive' | 'warning' | 'info' | 'success' | 'muted' => {
  const colors: Record<ExpiryStatus, 'destructive' | 'warning' | 'info' | 'success' | 'muted'> = {
    'overdue': 'destructive',
    'day-before': 'destructive',
    'week': 'destructive',
    '2-weeks': 'warning',
    'month': 'warning',
    '3-months': 'info',
    '6-months': 'info',
    'safe': 'success',
  };
  return colors[status];
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '-';
  try {
    const date = parseISO(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
};

export const getDaysUntilExpiry = (validityUpto: string): number | null => {
  if (!validityUpto) return null;
  try {
    const expiryDate = parseISO(validityUpto);
    return differenceInDays(expiryDate, new Date());
  } catch {
    return null;
  }
};
