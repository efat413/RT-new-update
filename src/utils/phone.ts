/**
 * Utilities for formatting and normalizing phone and WhatsApp numbers,
 * especially for Bangladeshi (+880) telephone formats.
 */

export const cleanPhoneNumber = (phone?: string): string => {
  if (!phone) return '';
  return phone.replace(/[^0-9]/g, '');
};

/**
 * Normalizes and validates Bangladeshi phone numbers according to standard telco rules
 * (11 digits, starts with 01[3-9], strips +88/880 prefixes).
 */
export const normalizeAndValidatePhone = (phoneInput: string): { isValid: boolean; normalized: string; error?: string } => {
  const cleanDigits = (phoneInput || '').replace(/[^0-9]/g, '');
  let normalized = cleanDigits;

  if (normalized.startsWith('8801')) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith('88') && normalized.length > 11) {
    normalized = normalized.slice(2);
  }

  if (!normalized) {
    return { isValid: false, normalized: '', error: 'Please enter a valid mobile number.' };
  }
  if (!normalized.startsWith('01')) {
    return { isValid: false, normalized, error: 'Mobile number must begin with 01 (e.g. 01712345678).' };
  }
  if (normalized.length !== 11) {
    return { isValid: false, normalized, error: `Mobile number must be exactly 11 digits (current: ${normalized.length}).` };
  }

  const validPrefixes = ['013', '014', '015', '016', '017', '018', '019'];
  const prefix = normalized.substring(0, 3);
  if (!validPrefixes.includes(prefix)) {
    return { isValid: false, normalized, error: `Invalid Bangladeshi operator prefix "${prefix}".` };
  }

  return { isValid: true, normalized };
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
