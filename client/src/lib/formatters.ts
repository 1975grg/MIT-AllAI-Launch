// Number formatting utilities for financial inputs

/**
 * Formats a number with commas for thousands separator
 * @param value - The numeric value to format
 * @returns Formatted string with commas
 */
export function formatNumberWithCommas(value: number | string): string {
  if (!value && value !== 0) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US');
}

/**
 * Removes commas from a formatted number string
 * @param value - The formatted string with commas
 * @returns Clean numeric string
 */
export function removeCommas(value: string): string {
  return value.replace(/,/g, '');
}

/**
 * Formats currency with dollar sign and commas
 * @param value - The numeric value to format
 * @returns Formatted currency string
 */
export function formatCurrency(value: number | string): string {
  if (!value && value !== 0) return '$0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0';
  return `$${num.toLocaleString('en-US')}`;
}

/**
 * Custom hook for financial input handling with comma formatting
 * @param onChange - The form field onChange handler
 * @returns Object with formatted value and change handler
 */
export function useFormattedInput(onChange: (value: number | undefined) => void) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = removeCommas(e.target.value);
    const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
    
    // Update the actual form value (numeric)
    onChange(numericValue);
    
    // Format the display value with commas
    if (rawValue && !isNaN(parseFloat(rawValue))) {
      const formatted = formatNumberWithCommas(parseFloat(rawValue));
      e.target.value = formatted;
    }
  };

  const formatDisplayValue = (value: number | undefined): string => {
    if (!value && value !== 0) return '';
    return formatNumberWithCommas(value);
  };

  return { handleChange, formatDisplayValue };
}