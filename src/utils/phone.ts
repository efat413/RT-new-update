/**
 * Utilities for formatting and normalizing phone and WhatsApp numbers,
 * especially for Bangladeshi (+880) telephone formats.
 */

export const cleanPhoneNumber = (phone?: string): string => {
  if (!phone) return '';
  return phone.replace(/[^0-9]/g, '');
};

/**
 * Normalizes phone number for WhatsApp API (wa.me/{number})
 * E.g.:
 * - '01518739561' -> '8801518739561'
 * - '+8801518739561' -> '8801518739561'
 * - '8801518739561' -> '8801518739561'
 */
export const normalizeWhatsAppNumber = (phone?: string): string => {
  if (!phone) return '8801518739561';
  let digits = phone.replace(/[^0-9]/g, '');
  // If user entered standard 11-digit local BD number like 017XXXXXXXX
  if (digits.length === 11 && digits.startsWith('0')) {
    return '88' + digits;
  }
  // If user entered 10 digits without leading zero
  if (digits.length === 10 && digits.startsWith('1')) {
    return '880' + digits;
  }
  return digits;
};

/**
 * Builds a direct WhatsApp chat URL with optional pre-filled greeting
 */
export const formatWhatsAppLink = (phone?: string, text?: string): string => {
  const normalized = normalizeWhatsAppNumber(phone);
  const baseUrl = `https://wa.me/${normalized}`;
  return text ? `${baseUrl}?text=${encodeURIComponent(text)}` : baseUrl;
};
