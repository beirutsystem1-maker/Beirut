// Parsea "YYYY-MM-DD" sin conversión de timezone
export const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Formatea Date a "YYYY-MM-DD" sin convertir a UTC
export const toLocalDateString = (date: Date): string => {
  return date.toLocaleDateString('en-CA'); // formato YYYY-MM-DD local
};

// Compara si una fecha string está vencida (sin timezone)
export const isOverdue = (dueDateStr: string | null | undefined): boolean => {
  if (!dueDateStr) return false;
  const due = parseLocalDate(dueDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
};
