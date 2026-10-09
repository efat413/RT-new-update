/**
 * Rongodhonu Trade (রঙধনু ট্রেড) - Technical SEO Engine
 * Provides dynamic meta tags, canonical URLs, Schema.org JSON-LD structured data,
 * OpenGraph, Twitter Cards, and Bangladesh search-intent optimizations.
 */

import { Product, Category, StoreSettings, ProductReview } from '../types';

export const SITE_DOMAIN = 'https://rongdhonutrade.com';
export const DEFAULT_SITE_NAME = 'Rongodhonu Trade';
export const DEFAULT_BENGALI_BRAND_NAME = 'রঙধনু ট্রেড';
export const BRAND_SEARCH_VARIATIONS = [
  'Rongodhonu Trade',
  'রঙধনু ট্রেড',
  'Rongdhonu',
  'রংধনু',
  'রঙধনু',
  'Rongdhonu Trade',
];
export const DEFAULT_FALLBACK_IMAGE = 'https://i.pinimg.com/736x/bb/fe/59/bbfe59570509bbc00e9d703fd45ada18.jpg';

export const DEFAULT_HOMEPAGE_TITLE = 'Rongodhonu Trade | রঙধনু ট্রেড - Online Shopping in Bangladesh';
export const DEFAULT_HOMEPAGE_DESCRIPTION =
  'Rongodhonu Trade (রঙধনু ট্রেড / Rongdhonu) - বাংলাদেশের বিশ্বস্ত অনলাইন শপ। ঘড়ি, ব্রেসলেট, মানিব্যাগ, হেডফোন, TWS ইয়ারবাডস ও আকর্ষণীয় গিফট আইটেম কিনুন ক্যাশ অন ডেলিভারিতে। রংধনু কালেকশন।';

export interface CategorySEOKeywords {
  primaryKeyword: string;
  secondaryKeywords: string[];
  englishKeywords: string[];
  bengaliKeywords: string[];
}

export interface SEOMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType?: 'website' | 'product';
  ogImage?: string;
  noIndex?: boolean;
  product?: Product;
  category?: Category;
  reviews?: ProductReview[];
  breadcrumbs?: Array<{ name: string; url: string }>;
  keywords?: CategorySEOKeywords;
}

/**
 * Category intent mapping for targeted Bangladesh e-commerce queries
 */
export interface CategoryIntentRule {
  id?: string;
  matchKeywords: string[];
  title: string;
  h1: string;
  description: string;
  keywords?: CategorySEOKeywords;
}

export const CATEGORY_INTENT_RULES: CategoryIntentRule[] = [
  // 1. Custom Laser Print Money Bag (Most specific wallet variant)
  {
    id: 'custom-laser-print-money-bag',
    matchKeywords: [
      'custom laser print money bag',
      'laser printed money bag',
      'laser print money bag',
      'custom laser print wallet',
      'laser printed wallet',
      'laser print wallet',
      'custom money bag',
      'custom wallet',
      'personalized wallet',
      'personalized money bag',
      'custom gift wallet',
      'custom-money-bag',
      'custom-wallet',
      'কাস্টম মানিব্যাগ',
      'কাস্টম মানি ব্যাগ',
      'পার্সোনালাইজড মানিব্যাগ',
      'লেজার প্রিন্ট মানিব্যাগ',
      'লেজার প্রিন্ট মানি ব্যাগ',
      'নাম লেখা মানিব্যাগ',
      'কাস্টম গিফট মানিব্যাগ',
    ],
    title: 'কাস্টম লেজার প্রিন্ট মানিব্যাগ | Custom Laser Print Wallet in Bangladesh | Rongodhonu Trade',
    h1: 'কাস্টম লেজার প্রিন্ট মানিব্যাগ কালেকশন - Personalized Leather Wallet',
    description: 'নাম ও ছবি সহ কাস্টম লেজার প্রিন্ট মানিব্যাগ তৈরি করুন। প্রিয়জনের জন্য স্পেশাল পার্সোনালাইজড গিফট লেদার মানিব্যাগ ও কাস্টম ওয়ালেট কিনুন Rongodhonu Trade থেকে।',
    keywords: {
      primaryKeyword: 'Custom Money Bag',
      secondaryKeywords: ['Custom Wallet', 'Personalized Wallet', 'Personalized Money Bag', 'Laser Printed Wallet', 'Custom Laser Print Wallet', 'Custom Gift Wallet'],
      englishKeywords: ['Custom Money Bag', 'Custom Wallet', 'Personalized Wallet', 'Personalized Money Bag', 'Laser Printed Wallet', 'Laser Printed Money Bag', 'Custom Laser Print Wallet', 'Custom Gift Wallet'],
      bengaliKeywords: ['কাস্টম মানিব্যাগ', 'কাস্টম মানি ব্যাগ', 'পার্সোনালাইজড মানিব্যাগ', 'লেজার প্রিন্ট মানিব্যাগ', 'লেজার প্রিন্ট মানি ব্যাগ', 'নাম লেখা মানিব্যাগ', 'কাস্টম গিফট মানিব্যাগ'],
    },
  },

  // 2. Custom Laser Print Bracelet (Most specific bracelet variant)
  {
    id: 'custom-laser-print-bracelet',
    matchKeywords: [
      'custom bracelet',
      'personalized bracelet',
      'customized bracelet',
      'laser printed bracelet',
      'custom laser print bracelet',
      "personalized men's bracelet",
      'personalized mens bracelet',
      'কাস্টম ব্রেসলেট',
      'পার্সোনালাইজড ব্রেসলেট',
      'কাস্টমাইজড ব্রেসলেট',
      'লেজার প্রিন্ট ব্রেসলেট',
      'নাম লেখা ব্রেসলেট',
      'কাস্টম ছেলেদের ব্রেসলেট',
    ],
    title: 'কাস্টম ব্রেসলেট | Custom Laser Print Bracelet in Bangladesh | Rongodhonu Trade',
    h1: "কাস্টম লেজার প্রিন্ট ব্রেসলেট কালেকশন - Personalized Men's Bracelet",
    description: 'নাম ও স্পেশাল মেসেজ লেখা কাস্টম ব্রেসলেট ও পার্সোনালাইজড ছেলেদের ব্রেসলেট কিনুন সেরা দামে বাংলাদেশে। স্টেইনলেস স্টিল লেজার প্রিন্ট ব্রেসলেট Rongodhonu Trade-এ।',
    keywords: {
      primaryKeyword: 'Custom Bracelet',
      secondaryKeywords: ['Personalized Bracelet', 'Customized Bracelet', 'Laser Printed Bracelet', 'Custom Laser Print Bracelet', "Personalized Men's Bracelet"],
      englishKeywords: ['Custom Bracelet', 'Personalized Bracelet', 'Customized Bracelet', 'Laser Printed Bracelet', 'Custom Laser Print Bracelet', "Personalized Men's Bracelet"],
      bengaliKeywords: ['কাস্টম ব্রেসলেট', 'পার্সোনালাইজড ব্রেসলেট', 'কাস্টমাইজড ব্রেসলেট', 'লেজার প্রিন্ট ব্রেসলেট', 'নাম লেখা ব্রেসলেট', 'কাস্টম ছেলেদের ব্রেসলেট'],
    },
  },

  // 3. Custom Photo Frame (Specific personalized variant)
  {
    id: 'custom-photo-frame',
    matchKeywords: [
      'custom photo frame',
      'customized photo frame',
      'personalized photo frame',
      'custom picture frame',
      'personalized picture frame',
      'custom gift frame',
      'কাস্টম ফটো ফ্রেম',
      'কাস্টম ছবি ফ্রেম',
      'পার্সোনালাইজড ফটো ফ্রেম',
      'কাস্টম ছবির ফ্রেম',
      'কাস্টম গিফট ফ্রেম',
      'ছবি দিয়ে ফটো ফ্রেম',
    ],
    title: 'কাস্টম ফটো ফ্রেম | Custom Photo Frame in Bangladesh | Rongodhonu Trade',
    h1: 'কাস্টম ছবি ও ফটো ফ্রেম কালেকশন - Personalized Picture Frame',
    description: 'ছবি দিয়ে পার্সোনালাইজড কাস্টম ফটো ফ্রেম ও গিফট ফ্রেম তৈরি করুন সেরা দামে বাংলাদেশে। নান্দনিক ডিজাইন ও স্মৃতির সুরক্ষায় কাস্টম ছবির ফ্রেম Rongodhonu Trade-এ।',
    keywords: {
      primaryKeyword: 'Custom Photo Frame',
      secondaryKeywords: ['Customized Photo Frame', 'Personalized Photo Frame', 'Custom Picture Frame', 'Personalized Picture Frame', 'Custom Gift Frame'],
      englishKeywords: ['Custom Photo Frame', 'Customized Photo Frame', 'Personalized Photo Frame', 'Custom Picture Frame', 'Personalized Picture Frame', 'Custom Gift Frame'],
      bengaliKeywords: ['কাস্টম ফটো ফ্রেম', 'কাস্টম ছবি ফ্রেম', 'পার্সোনালাইজড ফটো ফ্রেম', 'কাস্টম ছবির ফ্রেম', 'কাস্টম গিফট ফ্রেম', 'ছবি দিয়ে ফটো ফ্রেম'],
    },
  },

  // 4. Custom Laser Print Keyring
  {
    id: 'custom-laser-print-keyring',
    matchKeywords: [
      'custom keyring',
      'custom keychain',
      'personalized keyring',
      'personalized keychain',
      'laser printed keyring',
      'laser printed keychain',
      'custom laser print keyring',
      'কাস্টম কী-রিং',
      'কাস্টম কি-রিং',
      'কাস্টম কি-চেইন',
      'পার্সোনালাইজড কী-রিং',
      'পার্সোনালাইজড কি-চেইন',
      'লেজার প্রিন্ট কী-রিং',
      'নাম লেখা কী-রিং',
    ],
    title: 'কাস্টম কী-রিং | Custom Laser Print Keyring & Keychain in Bangladesh | Rongodhonu Trade',
    h1: 'কাস্টম লেজার প্রিন্ট কী-রিং কালেকশন - Personalized Keychain',
    description: 'নাম লেখা কাস্টম কী-রিং ও পার্সোনালাইজড কি-চেইন তৈরি করুন সাশ্রয়ী মূল্যে। টেকসই লেজার প্রিন্ট মেটাল ও উডেন কি-রিং কালেকশন Rongodhonu Trade-এ ক্যাশ অন ডেলিভারিতে।',
    keywords: {
      primaryKeyword: 'Custom Keyring',
      secondaryKeywords: ['Custom Keychain', 'Personalized Keyring', 'Personalized Keychain', 'Laser Printed Keyring', 'Laser Printed Keychain', 'Custom Laser Print Keyring'],
      englishKeywords: ['Custom Keyring', 'Custom Keychain', 'Personalized Keyring', 'Personalized Keychain', 'Laser Printed Keyring', 'Laser Printed Keychain', 'Custom Laser Print Keyring'],
      bengaliKeywords: ['কাস্টম কী-রিং', 'কাস্টম কি-রিং', 'কাস্টম কি-চেইন', 'পার্সোনালাইজড কী-রিং', 'পার্সোনালাইজড কি-চেইন', 'লেজার প্রিন্ট কী-রিং', 'নাম লেখা কী-রিং'],
    },
  },

  // 5. Custom Laser Print Water Bottle
  {
    id: 'custom-laser-print-water-bottle',
    matchKeywords: [
      'custom laser print water bottle',
      'laser printed water bottle',
      'laser print water bottle',
      'custom water bottle',
      'personalized water bottle',
      'customized water bottle',
      'custom bottle',
      'personalized bottle',
      'water bottle',
      'water-bottle',
      'water bottles',
      'bottle',
      'bottles',
      'custom-water-bottle',
      'কাস্টম ওয়াটার বোতল',
      'কাস্টম পানির বোতল',
      'পার্সোনালাইজড বোতল',
      'লেজার প্রিন্ট বোতল',
      'নাম লেখা পানির বোতল',
      'কাস্টম বোতল',
      'পানির বোতল',
      'বোতল',
    ],
    title: 'কাস্টম পানির বোতল | Custom Laser Print Water Bottle in Bangladesh | Rongodhonu Trade',
    h1: 'কাস্টম লেজার প্রিন্ট ওয়াটার বোতল - Personalized Water Bottle',
    description: 'নাম খোদাই করা কাস্টম পানির বোতল ও পার্সোনালাইজড স্টেইনলেস স্টিল বোতল কিনুন বাংলাদেশে। হট ও কোল্ড ইনসুলেটেড কাস্টম বোতল অর্ডার করুন Rongodhonu Trade থেকে।',
    keywords: {
      primaryKeyword: 'Custom Water Bottle',
      secondaryKeywords: ['Personalized Water Bottle', 'Customized Water Bottle', 'Laser Printed Water Bottle', 'Custom Bottle', 'Personalized Bottle'],
      englishKeywords: ['Custom Water Bottle', 'Personalized Water Bottle', 'Customized Water Bottle', 'Laser Printed Water Bottle', 'Custom Bottle', 'Personalized Bottle'],
      bengaliKeywords: ['কাস্টম ওয়াটার বোতল', 'কাস্টম পানির বোতল', 'পার্সোনালাইজড বোতল', 'লেজার প্রিন্ট বোতল', 'নাম লেখা পানির বোতল', 'কাস্টম বোতল'],
    },
  },

  // 6. Men's Bracelet
  {
    id: 'mens-bracelet',
    matchKeywords: [
      "men's bracelet",
      'mens bracelet',
      'men bracelet',
      "men's fashion bracelet",
      'mens fashion bracelet',
      "men's stylish bracelet",
      'mens stylish bracelet',
      'bracelet for men',
      'ছেলেদের ব্রেসলেট',
      'পুরুষদের ব্রেসলেট',
      'ছেলেদের ফ্যাশন ব্রেসলেট',
      'পুরুষদের ফ্যাশন ব্রেসলেট',
      'ছেলেদের স্টাইলিশ ব্রেসলেট',
      'পুরুষদের অ্যাক্সেসরিজ',
    ],
    title: "ছেলেদের ব্রেসলেট | Men's Fashion Bracelet in Bangladesh | Rongodhonu Trade",
    h1: "ছেলেদের ফ্যাশন ব্রেসলেট কালেকশন - Men's Stylish Bracelet in Bangladesh",
    description: 'পুরুষদের ফ্যাশন ও স্টাইলিশ ছেলেদের ব্রেসলেট কিনুন সেরা দামে Rongodhonu Trade থেকে। প্রিমিয়াম কোয়ালিটি ছেলেদের অ্যাক্সেসরিজ ও সারা দেশে ক্যাশ অন ডেলিভারি সুবিধা।',
    keywords: {
      primaryKeyword: "Men's Bracelet",
      secondaryKeywords: ['Men Bracelet', "Men's Fashion Bracelet", "Men's Stylish Bracelet", 'Bracelet for Men', "Men's Accessories"],
      englishKeywords: ["Men's Bracelet", 'Men Bracelet', "Men's Fashion Bracelet", "Men's Stylish Bracelet", 'Bracelet for Men', "Men's Accessories"],
      bengaliKeywords: ['ছেলেদের ব্রেসলেট', 'পুরুষদের ব্রেসলেট', 'ছেলেদের ফ্যাশন ব্রেসলেট', 'পুরুষদের ফ্যাশন ব্রেসলেট', 'ছেলেদের স্টাইলিশ ব্রেসলেট', 'পুরুষদের অ্যাক্সেসরিজ'],
    },
  },

  // 7. ব্রেসলেট / Bracelets (General)
  {
    id: 'bracelets',
    matchKeywords: ['ব্রেসলেট', 'bracelet', 'bracelets', 'fashion bracelet', 'stylish bracelet'],
    title: 'ব্রেসলেট | Bracelet Price in Bangladesh | Rongodhonu Trade',
    h1: 'ব্রেসলেট কালেকশন - Bracelet Collection in Bangladesh',
    description: 'বাংলাদেশে সেরা দামে ছেলেদের ও মেয়েদের ব্রেসলেট কিনুন Rongodhonu Trade থেকে। স্টেইনলেস স্টিল ও প্রিমিয়াম ডিজাইনের ব্রেসলেট কালেকশন এবং সারা দেশে ক্যাশ অন ডেলিভারি।',
    keywords: {
      primaryKeyword: 'Bracelet',
      secondaryKeywords: ["Men's Bracelet", "Men's Fashion Bracelet", 'Fashion Bracelet', 'Stylish Bracelet', 'Bracelet for Men'],
      englishKeywords: ['Bracelet', "Men's Bracelet", "Men's Fashion Bracelet", 'Fashion Bracelet', 'Stylish Bracelet', 'Bracelet for Men'],
      bengaliKeywords: ['ব্রেসলেট', 'ছেলেদের ব্রেসলেট', 'পুরুষদের ব্রেসলেট', 'ফ্যাশন ব্রেসলেট', 'স্টাইলিশ ব্রেসলেট'],
    },
  },

  // 8. মানিব্যাগ / Wallets & Money Bags
  {
    id: 'wallets',
    matchKeywords: [
      'মানিব্যাগ',
      'মানি ব্যাগ',
      'wallet',
      'wallets',
      "men's wallet",
      'mens wallet',
      'leather wallet',
      "men's money bag",
      'mens money bag',
      'premium wallet',
      'card holder',
      'cardholder',
      'পুরুষদের মানিব্যাগ',
      'ছেলেদের মানিব্যাগ',
      'চামড়ার মানিব্যাগ',
      'লেদার মানিব্যাগ',
    ],
    title: 'মানিব্যাগ | Leather Wallet & Money Bag Price in Bangladesh | Rongodhonu Trade',
    h1: "জেনুইন লেদার মানিব্যাগ কালেকশন - Men's Leather Wallets in Bangladesh",
    description: '১০০% অরিজিনাল লেদার মানিব্যাগ ও কার্ড হোল্ডার কিনুন বাংলাদেশে। প্রিমিয়াম ফিনিশিং ও লং-লাস্টিং কোয়ালিটিসহ জেনুইন লেদার ওয়ালেট কালেকশন Rongodhonu Trade-এ।',
    keywords: {
      primaryKeyword: 'Money Bag',
      secondaryKeywords: ['Wallet', "Men's Wallet", 'Leather Wallet', "Men's Money Bag", 'Premium Wallet'],
      englishKeywords: ['Money Bag', 'Wallet', "Men's Wallet", 'Leather Wallet', "Men's Money Bag", 'Premium Wallet'],
      bengaliKeywords: ['মানিব্যাগ', 'মানি ব্যাগ', 'পুরুষদের মানিব্যাগ', 'ছেলেদের মানিব্যাগ', 'চামড়ার মানিব্যাগ', 'লেদার মানিব্যাগ'],
    },
  },

  // 9. ব্লুটুথ স্পিকার / Bluetooth Speakers
  {
    id: 'bluetooth-speakers',
    matchKeywords: [
      'bluetooth speaker',
      'bluetooth speakers',
      'wireless speaker',
      'portable bluetooth speaker',
      'portable speaker',
      'sound box',
      'স্পিকার',
      'ব্লুটুথ স্পিকার',
      'ওয়্যারলেস স্পিকার',
      'পোর্টেবল স্পিকার',
      'ব্লুটুথ সাউন্ড বক্স',
    ],
    title: 'ব্লুটুথ স্পিকার | Bluetooth Speaker Price in Bangladesh | Rongodhonu Trade',
    h1: 'ব্লুটুথ স্পিকার কালেকশন - Wireless Bluetooth Speakers in Bangladesh',
    description: 'সেরা সাউন্ড কোয়ালিটির পোর্টেবল ব্লুটুথ স্পিকার ও ওয়্যারলেস সাউন্ড বক্স কিনুন সাশ্রয়ী দামে। ডিপ বাস ও লং ব্যাটারি ব্যাকআপযুক্ত ব্লুটুথ স্পিকার Rongodhonu Trade-এ।',
    keywords: {
      primaryKeyword: 'Bluetooth Speaker',
      secondaryKeywords: ['Bluetooth Speakers', 'Wireless Speaker', 'Portable Bluetooth Speaker', 'Portable Speaker'],
      englishKeywords: ['Bluetooth Speaker', 'Bluetooth Speakers', 'Wireless Speaker', 'Portable Bluetooth Speaker', 'Portable Speaker'],
      bengaliKeywords: ['ব্লুটুথ স্পিকার', 'ওয়্যারলেস স্পিকার', 'পোর্টেবল স্পিকার', 'ব্লুটুথ সাউন্ড বক্স'],
    },
  },

  // 10. ডাটা ক্যাবল / Cables & Data Cables
  {
    id: 'data-cables',
    matchKeywords: [
      'data cable',
      'data cables',
      'usb cable',
      'charging cable',
      'type-c cable',
      'type c cable',
      'usb data cable',
      'fast charging cable',
      'ডাটা ক্যাবল',
      'ডাটা কেবল',
      'চার্জিং ক্যাবল',
      'ইউএসবি ক্যাবল',
      'টাইপ-সি ক্যাবল',
      'মোবাইল ডাটা ক্যাবল',
      'ফাস্ট চার্জিং ক্যাবল',
    ],
    title: 'ডাটা ক্যাবল | USB & Type-C Data Cable in Bangladesh | Rongodhonu Trade',
    h1: 'ডাটা ক্যাবল ও চার্জিং ক্যাবল কালেকশন - Fast USB & Type-C Cables',
    description: 'ফাস্ট চার্জিং ডাটা ক্যাবল ও ইউএসবি টাইপ-সি ক্যাবল কিনুন বাংলাদেশে সেরা দামে। টেকসই ও দ্রুত ডাটা ট্রান্সফার ক্যাবল Rongodhonu Trade থেকে ক্যাশ অন ডেলিভারিতে পান।',
    keywords: {
      primaryKeyword: 'Data Cable',
      secondaryKeywords: ['Data Cables', 'USB Cable', 'Charging Cable', 'Type-C Cable', 'USB Data Cable', 'Fast Charging Cable'],
      englishKeywords: ['Data Cable', 'Data Cables', 'USB Cable', 'Charging Cable', 'Type-C Cable', 'USB Data Cable', 'Fast Charging Cable'],
      bengaliKeywords: ['ডাটা ক্যাবল', 'ডাটা কেবল', 'চার্জিং ক্যাবল', 'ইউএসবি ক্যাবল', 'টাইপ-সি ক্যাবল', 'মোবাইল ডাটা ক্যাবল', 'ফাস্ট চার্জিং ক্যাবল'],
    },
  },

  // 11. চার্জার ও অ্যাডাপ্টার / Chargers & Adapters
  {
    id: 'chargers-adapters',
    matchKeywords: [
      'charger',
      'chargers',
      'mobile charger',
      'fast charger',
      'usb charger',
      'power adapter',
      'charging adapter',
      'fast charging adapter',
      'চার্জার',
      'মোবাইল চার্জার',
      'ফাস্ট চার্জার',
      'ইউএসবি চার্জার',
      'পাওয়ার অ্যাডাপ্টার',
      'চার্জিং অ্যাডাপ্টার',
    ],
    title: 'চার্জার | Mobile Fast Charger & Power Adapter in Bangladesh | Rongodhonu Trade',
    h1: 'মোবাইল চার্জার ও পাওয়ার অ্যাডাপ্টার - Fast Chargers & Adapters',
    description: 'মোবাইল ফাস্ট চার্জার ও ইউএসবি পাওয়ার অ্যাডাপ্টার কিনুন সাশ্রয়ী দামে। হাই-স্পিড ও নিরাপদ চার্জিং অ্যাডাপ্টার কালেকশন Rongodhonu Trade থেকে হোম ডেলিভারিতে পান।',
    keywords: {
      primaryKeyword: 'Charger',
      secondaryKeywords: ['Mobile Charger', 'Fast Charger', 'USB Charger', 'Power Adapter', 'Charging Adapter', 'Fast Charging Adapter'],
      englishKeywords: ['Charger', 'Mobile Charger', 'Fast Charger', 'USB Charger', 'Power Adapter', 'Charging Adapter', 'Fast Charging Adapter'],
      bengaliKeywords: ['চার্জার', 'মোবাইল চার্জার', 'ফাস্ট চার্জার', 'ইউএসবি চার্জার', 'পাওয়ার অ্যাডাপ্টার', 'চার্জিং অ্যাডাপ্টার'],
    },
  },

  // 12. TWS / Earbuds & Wireless Earphones
  {
    id: 'earbuds-tws',
    matchKeywords: [
      'earbuds',
      'earbud',
      'tws',
      'tws earbuds',
      'wireless earbuds',
      'bluetooth earbuds',
      'wireless earphones',
      'bluetooth earphones',
      'ইয়ারবাডস',
      'ইয়ারবাডস',
      'tws ইয়ারবাডস',
      'ব্লুটুথ ইয়ারবাডস',
      'ওয়্যারলেস ইয়ারবাডস',
      'ব্লুটুথ ইয়ারফোন',
    ],
    title: 'TWS ইয়ারবাডস | TWS & Wireless Earbuds Price in Bangladesh | Rongodhonu Trade',
    h1: 'TWS ইয়ারবাডস কালেকশন - Wireless Earbuds & Earphones in Bangladesh',
    description: 'বাংলাদেশে সেরা দামে TWS ইয়ারবাডস ও ব্লুটুথ ইয়ারফোন কিনুন। হাই-কোয়ালিটি সাউন্ড, এক্টিভ নয়েজ ক্যান্সেলেশন ও লং ব্যাটারিযুক্ত ওয়্যারলেস ইয়ারবাডস Rongodhonu Trade-এ।',
    keywords: {
      primaryKeyword: 'Earbuds',
      secondaryKeywords: ['TWS', 'TWS Earbuds', 'Wireless Earbuds', 'Bluetooth Earbuds', 'Wireless Earphones', 'Bluetooth Earphones'],
      englishKeywords: ['Earbuds', 'TWS', 'TWS Earbuds', 'Wireless Earbuds', 'Bluetooth Earbuds', 'Wireless Earphones', 'Bluetooth Earphones'],
      bengaliKeywords: ['ইয়ারবাডস', 'ইয়ারবাডস', 'TWS ইয়ারবাডস', 'ব্লুটুথ ইয়ারবাডস', 'ওয়্যারলেস ইয়ারবাডস', 'ব্লুটুথ ইয়ারফোন'],
    },
  },

  // 13. হেডফোন ও হেডসেট / Headphones & Headsets
  {
    id: 'headphones-headsets',
    matchKeywords: [
      'headphone',
      'headphones',
      'headset',
      'headsets',
      'bluetooth headphones',
      'wireless headphones',
      'bluetooth headset',
      'হেডফোন',
      'হেডসেট',
      'ব্লুটুথ হেডফোন',
      'ওয়্যারলেস হেডফোন',
      'ব্লুটুথ হেডসেট',
    ],
    title: 'হেডফোন | Headphone & Headset Price in Bangladesh | Rongodhonu Trade',
    h1: 'হেডফোন ও হেডসেট কালেকশন - Bluetooth & Wireless Headphones',
    description: 'হাই-কোয়ালিটি ওয়্যারলেস ও ব্লুটুথ হেডফোন কিনুন সাশ্রয়ী দামে। ডিপ বাস ও ক্রিস্টাল ক্লিয়ার সাউন্ডযুক্ত হেডসেট কালেকশন Rongodhonu Trade থেকে ক্যাশ অন ডেলিভারিতে পান।',
    keywords: {
      primaryKeyword: 'Headphones',
      secondaryKeywords: ['Headphone', 'Headsets', 'Headset', 'Bluetooth Headphones', 'Wireless Headphones', 'Bluetooth Headset'],
      englishKeywords: ['Headphones', 'Headphone', 'Headsets', 'Headset', 'Bluetooth Headphones', 'Wireless Headphones', 'Bluetooth Headset'],
      bengaliKeywords: ['হেডফোন', 'হেডসেট', 'ব্লুটুথ হেডফোন', 'ওয়্যারলেস হেডফোন', 'ব্লুটুথ হেডসেট'],
    },
  },

  // 14. পাওয়ার ব্যাংক / Power Bank
  {
    id: 'power-banks',
    matchKeywords: [
      'power bank',
      'power banks',
      'portable power bank',
      'fast charging power bank',
      'fast charge power bank',
      'mobile power bank',
      'পাওয়ার ব্যাংক',
      'পাওয়ার ব্যাংক',
      'পোর্টেবল পাওয়ার ব্যাংক',
      'ফাস্ট চার্জিং পাওয়ার ব্যাংক',
      'মোবাইল পাওয়ার ব্যাংক',
    ],
    title: 'পাওয়ার ব্যাংক | Power Bank Price in Bangladesh | Rongodhonu Trade',
    h1: 'পোর্টেবল পাওয়ার ব্যাংক কালেকশন - Fast Charging Power Bank in Bangladesh',
    description: 'মোবাইল ফাস্ট চার্জিং পাওয়ার ব্যাংক কিনুন সেরা দামে বাংলাদেশে। লং-লাস্টিং ব্যাটারি ক্যাপাসিটি ও পোর্টেবল পাওয়ার ব্যাংক Rongodhonu Trade থেকে অনলাইনে অর্ডার করুন।',
    keywords: {
      primaryKeyword: 'Power Bank',
      secondaryKeywords: ['Power Banks', 'Portable Power Bank', 'Fast Charging Power Bank', 'Fast Charge Power Bank', 'Mobile Power Bank'],
      englishKeywords: ['Power Bank', 'Power Banks', 'Portable Power Bank', 'Fast Charging Power Bank', 'Fast Charge Power Bank', 'Mobile Power Bank'],
      bengaliKeywords: ['পাওয়ার ব্যাংক', 'পাওয়ার ব্যাংক', 'পোর্টেবল পাওয়ার ব্যাংক', 'ফাস্ট চার্জিং পাওয়ার ব্যাংক', 'মোবাইল পাওয়ার ব্যাংক'],
    },
  },

  // 15. ঘড়ি ও স্মার্টওয়াচ / Watches & Smartwatches
  {
    id: 'watches',
    matchKeywords: [
      'ঘড়ি',
      'ঘড়ি',
      'হাতঘড়ি',
      'হাতঘড়ি',
      'watch',
      'watches',
      "men's watch",
      'mens watch',
      "women's watch",
      'womens watch',
      'digital watch',
      'smart watch',
      'smartwatch',
      'wrist watch',
      'পুরুষদের ঘড়ি',
      'ছেলেদের ঘড়ি',
      'মেয়েদের ঘড়ি',
      'ডিজিটাল ঘড়ি',
      'স্মার্ট ওয়াচ',
      'স্মার্ট ঘড়ি',
    ],
    title: 'ঘড়ি ও স্মার্ট ওয়াচ | Watch & Smartwatch Price in Bangladesh | Rongodhonu Trade',
    h1: "হাতঘড়ি ও স্মার্ট ঘড়ি কালেকশন - Men's & Women's Watches in Bangladesh",
    description: 'পুরুষ ও মেয়েদের হাতঘড়ি, ডিজিটাল ঘড়ি এবং স্মার্ট ওয়াচ কিনুন সেরা মূল্যে। প্রিমিয়াম কোয়ালিটি রিস্ট ওয়াচ কালেকশন Rongodhonu Trade থেকে দ্রুত হোম ডেলিভারিতে পান।',
    keywords: {
      primaryKeyword: 'Watch',
      secondaryKeywords: ['Watches', "Men's Watch", "Women's Watch", 'Digital Watch', 'Smart Watch', 'Smartwatch', 'Wrist Watch'],
      englishKeywords: ['Watch', 'Watches', "Men's Watch", "Women's Watch", 'Digital Watch', 'Smart Watch', 'Smartwatch', 'Wrist Watch'],
      bengaliKeywords: ['ঘড়ি', 'ঘড়ি', 'হাতঘড়ি', 'হাতঘড়ি', 'পুরুষদের ঘড়ি', 'ছেলেদের ঘড়ি', 'মেয়েদের ঘড়ি', 'ডিজিটাল ঘড়ি', 'স্মার্ট ওয়াচ', 'স্মার্ট ঘড়ি'],
    },
  },

  // 16. চেইন ও লকেট / Chain & Locket
  {
    id: 'chain-locket',
    matchKeywords: ['চেইন', 'লকেট', 'chain', 'locket', 'necklace'],
    title: "মেনস চেইন ও লকেট | Men's Chain & Locket in Bangladesh | Rongodhonu Trade",
    h1: "মেনস চেইন ও লকেট কালেকশন - Men's Chain & Locket in Bangladesh",
    description: 'মেনস চেইন ও লকেট কিনুন সেরা দামে বাংলাদেশে। স্টাইলিশ পুরুষদের চেইন, লকেট ও চেইন-লকেট সেট কালেকশন পান Rongodhonu Trade-এ ক্যাশ অন ডেলিভারি সুবিধাসহ।',
  },

  // 17. সাধারণ ফটো ফ্রেম / Photo Frames
  {
    id: 'photo-frames',
    matchKeywords: ['ফটো ফ্রেম', 'photo frame', 'photo frames', 'picture frame'],
    title: 'ফটো ফ্রেম | Photo Frame Price in Bangladesh | Rongodhonu Trade',
    h1: 'ফটো ফ্রেম কালেকশন - Photo Frames in Bangladesh',
    description: 'মেমোরি ধরে রাখতে ক্রিয়েটিভ ফটো ফ্রেম কিনুন সেরা দামে বাংলাদেশে। নান্দনিক ডিজাইন ও গিফটের জন্য পারফেক্ট ফটো ফ্রেম।',
  },

  // 18. গিফট আইটেম / Gift Items
  {
    id: 'gift-items',
    matchKeywords: ['gift items', 'gift box', 'gift', 'গিফট', 'গিফট আইটেম'],
    title: 'গিফট আইটেম | Gift Items in Bangladesh | Rongodhonu Trade',
    h1: 'গিফট আইটেম কালেকশন - Handpicked Gift Items in Bangladesh',
    description: 'যেকোনো উৎসব ও বিশেষ দিনের আকর্ষণীয় গিফট আইটেম কিনুন Rongodhonu Trade থেকে। প্রিমিয়াম কোয়ালিটি গিফট বক্স ও হ্যান্ডপিকড আইটেমস।',
  },

  // 19. কাপল আইটেম / Couple Items
  {
    id: 'couple-items',
    matchKeywords: ['couple items', 'couple watch', 'couple', 'কাপল', 'কাপল আইটেম'],
    title: 'কাপল আইটেম | Couple Items in Bangladesh | Rongodhonu Trade',
    h1: 'কাপল আইটেম ও গিফট কালেকশন - Couple Items in Bangladesh',
    description: 'প্রিয়জনের জন্য আকর্ষণীয় কাপল আইটেম ও কাপল গিফট সেট কিনুন বাংলাদেশে। কাপল ওয়াচ ও স্পেশাল গিফট কালেকশন।',
  },

  // 20. Existing Category: Men's Accessories
  {
    id: 'mens-accessories',
    matchKeywords: ["men's accessories", 'mens-accessories', 'mens accessories', 'accessories'],
    title: "ছেলেদের এক্সেসরিজ | Men's Accessories | Rongodhonu Trade",
    h1: "Men's Accessories Collection - ছেলেদের ফ্যাশন ও লাইফস্টাইল এক্সেসরিজ",
    description: 'ছেলেদের প্রিমিয়াম লেদার মানিব্যাগ, বেল্ট, ওয়াচ, ব্রেসলেট ও ফ্যাশন এক্সেসরিজ কিনুন সেরা দামে Rongodhonu Trade থেকে ক্যাশ অন ডেলিভারিতে।',
  },

  // 21. Existing Category: Gadgets & Electronics
  {
    id: 'gadgets-electronics',
    matchKeywords: ['gadgets & electronics', 'gadgets-electronics', 'gadgets', 'electronics'],
    title: 'TWS, হেডফোন ও গ্যাজেট | Gadgets & Electronics | Rongodhonu Trade',
    h1: 'Gadgets & Electronics Collection - স্মার্ট গ্যাজেট ও ইলেকট্রনিক্স',
    description: 'লেটেস্ট স্মার্ট গ্যাজেট, ব্লুটুথ স্পিকার, TWS ইয়ারবাডস, পাওয়ার ব্যাংক ও ইলেকট্রনিক্স এক্সেসরিজ কিনুন সাশ্রয়ী মূল্যে সারা বাংলাদেশে।',
  },
];

export interface CategorySEOData {
  title: string;
  h1: string;
  description: string;
  keywords?: CategorySEOKeywords;
}

/**
 * Resolves SEO title, H1, description, and keywords for a category
 */
export function getCategorySEOData(category: Category, siteName: string = DEFAULT_SITE_NAME): CategorySEOData {
  const normName = category.name.toLowerCase();
  const normSlug = (category.slug || '').toLowerCase();

  for (const rule of CATEGORY_INTENT_RULES) {
    const isMatch = rule.matchKeywords.some(
      (kw) => normName.includes(kw.toLowerCase()) || normSlug.includes(kw.toLowerCase())
    );
    if (isMatch) {
      return {
        title: rule.title.replace(/Rongdhonu Trade|Rongodhonu Trade/g, siteName),
        h1: rule.h1,
        description: rule.description.replace(/Rongdhonu Trade|Rongodhonu Trade/g, siteName),
        keywords: rule.keywords,
      };
    }
  }

  // Fallback for custom categories created dynamically in D1
  const cleanCatName = category.name.trim();
  return {
    title: `${cleanCatName} | Online Shopping in Bangladesh | ${siteName}`,
    h1: `${cleanCatName} Collection`,
    description: category.description && category.description.length > 20
      ? `${category.description} ${siteName} থেকে কিনুন সাশ্রয়ী দামে ক্যাশ অন ডেলিভারিতে।`
      : `${cleanCatName} কিনুন ${siteName} থেকে। সেরা দাম ও সারা বাংলাদেশে দ্রুত ক্যাশ অন ডেলিভারি।`,
  };
}

/**
 * Automatically generates a clean, SEO-friendly URL slug from a product title.
 * Adheres strictly to the following rules:
 * - Converts English characters to lowercase.
 * - Converts spaces to hyphens.
 * - Preserves numeric formatting correctly (e.g. "20,000mAh" -> "20000mah").
 * - Converts decimal dots to hyphens (e.g. "22.5W" -> "22-5w").
 * - Removes unnecessary punctuation and special characters while preserving Unicode Bengali characters.
 * - Collapses consecutive hyphens and trims leading/trailing hyphens.
 * - Retains important product model numbers, capacity, wattage, and keywords.
 * - Prevents excessively long URLs (capped at ~90 characters at word boundary).
 */
export function generateProductSlug(title: string): string {
  if (!title || typeof title !== 'string') return '';

  let slug = title.trim();

  // 1. Remove commas inside numbers: e.g. "20,000" -> "20000"
  slug = slug.replace(/(\d+),(\d+)/g, '$1$2');

  // 2. Replace dots between digits with hyphens: e.g. "22.5W" -> "22-5w"
  slug = slug.replace(/(\d+)\.(\d+)/g, '$1-$2');

  // 3. Replace ampersand with "and"
  slug = slug.replace(/&/g, 'and');

  // 4. Convert English characters to lowercase
  slug = slug.toLowerCase();

  // 5. Replace any character that is NOT lowercase a-z, 0-9, Bengali Unicode (\u0980-\u09FF), or hyphen with a hyphen
  slug = slug.replace(/[^a-z0-9\u0980-\u09FF-]+/g, '-');

  // 6. Collapse duplicate consecutive hyphens
  slug = slug.replace(/-+/g, '-');

  // 7. Trim leading and trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');

  // 8. Prevent excessively long URLs (capped at max 90 characters at word/hyphen boundary)
  if (slug.length > 90) {
    const truncated = slug.slice(0, 90);
    const lastHyphen = truncated.lastIndexOf('-');
    slug = lastHyphen > 40 ? truncated.slice(0, lastHyphen) : truncated;
    slug = slug.replace(/-+$/, '');
  }

  return slug;
}

/**
 * Resolves SEO title, description, and canonical for a single product
 */
export function getProductSEOMetadata(
  product: Product,
  siteName: string = DEFAULT_SITE_NAME
): SEOMetadata {
  const cleanTitle = product.title.trim();
  const title = `${cleanTitle} Price in Bangladesh | ${siteName}`;

  // Description adhering strictly to prompt template:
  // {Product Name} কিনুন বাংলাদেশে। দাম ৳{price}। বিস্তারিত তথ্য, ছবি ও ফিচার দেখে Rongodhonu Trade থেকে অনলাইনে অর্ডার করুন।
  const cleanDescSnippet = product.description
    ? product.description.replace(/\s+/g, ' ').trim().slice(0, 90) + '...'
    : '';

  const description = `${cleanTitle} কিনুন বাংলাদেশে। দাম ৳${product.price.toLocaleString()}। ${cleanDescSnippet} বিস্তারিত তথ্য ও ফিচার দেখে ${siteName} থেকে অনলাইনে অর্ডার করুন।`;

  const slugOrId = product.slug || generateProductSlug(product.title) || product.id;
  const canonicalUrl = `${SITE_DOMAIN}/product/${encodeURIComponent(slugOrId)}`;
  const ogImage = product.imageUrl || (product.images && product.images[0]) || DEFAULT_FALLBACK_IMAGE;

  return {
    title,
    description,
    canonicalUrl,
    ogType: 'product',
    ogImage,
    product,
  };
}

/**
 * Generates Schema.org Organization structured data
 * Uses only real, existing properties from settings - no invented data
 * Includes preferred English (Rongodhonu Trade) and Bengali (রঙধনু ট্রেড) brand names,
 * as well as brand search variations (Rongdhonu, রংধনু, রঙধনু) as alternateName.
 */
export function generateOrganizationSchema(settings?: Partial<StoreSettings>) {
  const name = settings?.siteName || DEFAULT_SITE_NAME;
  const phone = settings?.footer?.supportPhone || settings?.phone || '+8801518739561';
  // SEO schema address: fallback represents only Uttara, Dhaka 1230 without street address
  const fallbackAddress = 'Uttara, Dhaka 1230';
  const address = fallbackAddress;
  const logo = settings?.logoUrl || DEFAULT_FALLBACK_IMAGE;

  const sameAs: string[] = [];
  if (settings?.footer?.facebookUrl && settings.footer.facebookUrl.startsWith('http')) {
    sameAs.push(settings.footer.facebookUrl);
  }
  if (settings?.footer?.instagramUrl && settings.footer.instagramUrl.startsWith('http')) {
    sameAs.push(settings.footer.instagramUrl);
  }
  if (settings?.footer?.youtubeUrl && settings.footer.youtubeUrl.startsWith('http')) {
    sameAs.push(settings.footer.youtubeUrl);
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    alternateName: ['রঙধনু ট্রেড', 'Rongdhonu', 'রংধনু', 'রঙধনু', 'Rongdhonu Trade'],
    url: SITE_DOMAIN,
    logo,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: phone,
      contactType: 'customer service',
      areaServed: 'BD',
      availableLanguage: ['bn', 'en'],
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Uttara',
      addressRegion: 'Dhaka',
      postalCode: '1230',
      addressCountry: 'BD',
    },
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/**
 * Generates Schema.org WebSite structured data with SearchAction
 * Includes preferred English and Bengali brand names and search variations
 */
export function generateWebSiteSchema(siteName: string = DEFAULT_SITE_NAME) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    alternateName: ['রঙধনু ট্রেড', 'Rongdhonu', 'রংধনু', 'রঙধনু', 'Rongdhonu Trade'],
    url: SITE_DOMAIN,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_DOMAIN}/?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Generates Schema.org BreadcrumbList structured data
 */
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Generates Schema.org Product structured data
 * Strictly respects rule: ONLY include aggregateRating if genuine approved reviews/ratings exist.
 * Never includes buying price, cost, or profit.
 */
export function generateProductSchema(
  product: Product,
  categoryName?: string,
  siteName: string = DEFAULT_SITE_NAME,
  reviews?: ProductReview[]
) {
  const slugOrId = product.slug || generateProductSlug(product.title) || product.id;
  const canonicalUrl = `${SITE_DOMAIN}/product/${encodeURIComponent(slugOrId)}`;
  const images = (product.images && product.images.length > 0)
    ? product.images
    : [product.imageUrl || DEFAULT_FALLBACK_IMAGE];

  let ratingNum = 0;
  let reviewCountNum = 0;

  if (Array.isArray(reviews)) {
    const approvedReviews = reviews.filter(
      (r) => r && r.productId === product.id && r.status === 'approved'
    );
    reviewCountNum = approvedReviews.length;
    if (reviewCountNum > 0) {
      const sum = approvedReviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
      ratingNum = Math.round((sum / reviewCountNum) * 10) / 10;
    }
  } else {
    // When review array is not passed, use product reviewsCount ONLY if genuine count > 0 and rating > 0
    const count = typeof product.reviewsCount === 'number' && Number.isFinite(product.reviewsCount)
      ? Math.max(0, Math.floor(product.reviewsCount))
      : 0;
    const rating = count > 0 && typeof product.rating === 'number' && Number.isFinite(product.rating) && product.rating > 0
      ? Math.min(5, Math.max(1, Math.round(product.rating * 10) / 10))
      : 0;
    if (count > 0 && rating > 0) {
      reviewCountNum = count;
      ratingNum = rating;
    }
  }

  const hasGenuineRating = ratingNum > 0 && reviewCountNum > 0;

  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    image: images,
    description: product.description || product.title,
    sku: product.sku || product.id,
    brand: {
      '@type': 'Brand',
      name: siteName,
    },
    offers: {
      '@type': 'Offer',
      url: canonicalUrl,
      priceCurrency: 'BDT',
      price: product.price,
      priceValidUntil: '2027-12-31',
      itemCondition: 'https://schema.org/NewCondition',
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: siteName,
      },
    },
  };

  if (categoryName) {
    schema.category = categoryName;
  }

  // Include aggregateRating ONLY if genuine data is present
  if (hasGenuineRating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Math.min(5, Math.max(1, ratingNum)).toFixed(1),
      reviewCount: reviewCountNum,
      bestRating: '5',
      worstRating: '1',
    };
  }

  return schema;
}

/**
 * Generates a clean dynamic XML Sitemap string from real products and categories
 */
export function generateSitemapXml(
  categories: Category[],
  products: Product[],
  lastModDate: string = new Date().toISOString().split('T')[0]
): string {
  const xmlEscape = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const seenUrls = new Set<string>();
  const urls: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }> = [];

  const addUrl = (loc: string, lastmod: string, changefreq: string, priority: string) => {
    if (!seenUrls.has(loc)) {
      seenUrls.add(loc);
      urls.push({ loc, lastmod, changefreq, priority });
    }
  };

  // Homepage
  addUrl(`${SITE_DOMAIN}/`, lastModDate, 'daily', '1.0');

  // Category Pages (only active, valid categories)
  for (const cat of categories) {
    if (!cat || !cat.id) continue;
    const slug = (cat.slug || cat.id).trim();
    if (!slug) continue;
    addUrl(`${SITE_DOMAIN}/category/${encodeURIComponent(slug)}`, lastModDate, 'daily', '0.8');
  }

  // Active Product Pages (strictly exclude inactive or deleted products)
  for (const prod of products) {
    if (!prod || !prod.id) continue;
    if ((prod as any).status === 'inactive' || (prod as any).isDeleted) continue;

    let prodDate = lastModDate;
    if (prod.createdAt) {
      try {
        prodDate = new Date(prod.createdAt).toISOString().split('T')[0];
      } catch {}
    }

    // Sitemap strictly prefers persisted product.slug (Fix #1)
    const persistedSlug = typeof prod.slug === 'string' && prod.slug.trim() ? prod.slug.trim() : '';
    const prodSlugOrId = persistedSlug || (prod.title ? generateProductSlug(prod.title) : '') || prod.id;
    addUrl(
      `${SITE_DOMAIN}/product/${encodeURIComponent(prodSlugOrId)}`,
      prodDate,
      'weekly',
      prod.featured ? '0.9' : '0.7'
    );
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const entry of urls) {
    xml += '  <url>\n';
    xml += `    <loc>${xmlEscape(entry.loc)}</loc>\n`;
    xml += `    <lastmod>${entry.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${entry.changefreq}</changefreq>\n`;
    xml += `    <priority>${entry.priority}</priority>\n`;
    xml += '  </url>\n';
  }

  xml += '</urlset>';
  return xml;
}

/**
 * Standard Robots.txt content adhering to technical SEO guidelines
 * Protects private areas from indexing while keeping public catalog crawlable
 */
export const ROBOTS_TXT_CONTENT = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /account
Disallow: /cart
Disallow: /checkout
Disallow: /dashboard
Disallow: /api

Sitemap: ${SITE_DOMAIN}/sitemap.xml
`;

/**
 * Generates an SEO-compliant 404 HTML response for crawlers and direct visitors
 * Includes noindex, proper semantic H1, and links back to active catalog
 */
export function generate404Html(
  title: string = 'Product Not Found',
  message: string = 'The requested product or page is no longer available or the link is invalid.',
  siteName: string = DEFAULT_SITE_NAME
): string {
  const safeTitle = escapeHtmlAttr(title);
  const safeMessage = escapeHtmlAttr(message);
  const safeSiteName = escapeHtmlAttr(siteName);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>404 - ${safeTitle} | ${safeSiteName}</title>
    <meta name="description" content="${safeMessage} Browse our active collections across Bangladesh at ${safeSiteName}." />
    <meta name="robots" content="noindex, follow" />
    <link rel="canonical" href="${SITE_DOMAIN}/" />
    <link rel="icon" type="image/jpeg" href="${DEFAULT_FALLBACK_IMAGE}" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      body { margin: 0; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; background-color: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; box-sizing: border-box; }
      .card { max-width: 540px; width: 100%; background: #ffffff; border-radius: 24px; padding: 40px 32px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; text-align: center; }
      .badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; font-size: 13px; font-weight: 800; background: #fee2e2; color: #dc2626; margin-bottom: 16px; letter-spacing: 0.05em; }
      h1 { font-family: 'Outfit', sans-serif; font-size: 28px; font-weight: 800; color: #0f172a; margin: 0 0 12px; }
      p { font-size: 15px; line-height: 1.6; color: #64748b; margin: 0 0 28px; }
      .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 24px; border-radius: 14px; font-size: 14px; font-weight: 700; text-decoration: none; transition: all 0.2s; cursor: pointer; }
      .btn-primary { background: #e11d48; color: #ffffff; box-shadow: 0 10px 15px -3px rgba(225, 29, 72, 0.3); }
      .btn-primary:hover { background: #be123c; transform: translateY(-1px); }
      .btn-secondary { background: #f1f5f9; color: #334155; margin-left: 12px; }
      .btn-secondary:hover { background: #e2e8f0; }
    </style>
  </head>
  <body>
    <div class="card">
      <span class="badge">HTTP 404 NOT FOUND</span>
      <h1>${safeTitle}</h1>
      <p>${safeMessage}</p>
      <div>
        <a href="/" class="btn btn-primary">Return to Homepage</a>
        <a href="https://wa.me/8801518739561?text=Hello%2C+I+could+not+find+a+product+on+Rongodhonu+Trade" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">WhatsApp Support</a>
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtmlAttr(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Safely serializes an object to JSON for direct injection inside an HTML <script> block.
 * Replaces '<' with '\u003c' and '>' with '\u003e' to prevent HTML script breakout / XSS.
 */
export function safeJsonLdStringify(data: any): string {
  return JSON.stringify(data, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

/**
 * Injects dynamic product SEO tags, canonical URL, OpenGraph, Twitter Cards, Schema.org,
 * and semantic crawler-fallback body HTML into initial HTML response.
 */
export function injectProductSEOIntoHtml(
  html: string,
  product: Product,
  categoryName?: string,
  siteName: string = DEFAULT_SITE_NAME
): string {
  const meta = getProductSEOMetadata(product, siteName);
  const schema = generateProductSchema(product, categoryName, siteName);
  const schemaScript = `<script type="application/ld+json" id="schema-product">${safeJsonLdStringify(schema)}</script>`;

  let modified = html;

  // Replace Title
  modified = modified.replace(/<title>.*?<\/title>/i, `<title>${escapeHtmlAttr(meta.title)}</title>`);

  // Replace Description
  modified = modified.replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/i, `<meta name="description" content="${escapeHtmlAttr(meta.description)}" />`);

  // Replace Canonical
  if (/<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i.test(modified)) {
    modified = modified.replace(/<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i, `<link rel="canonical" href="${escapeHtmlAttr(meta.canonicalUrl)}" />`);
  } else if (modified.includes('</head>')) {
    modified = modified.replace('</head>', `  <link rel="canonical" href="${escapeHtmlAttr(meta.canonicalUrl)}" />\n</head>`);
  }

  // Ensure index, follow for active products
  modified = modified.replace(/<meta\s+name="robots"\s+content=".*?"\s*\/?>/i, `<meta name="robots" content="index, follow" />`);

  // Replace OpenGraph
  modified = modified.replace(/<meta\s+property="og:site_name"\s+content=".*?"\s*\/?>/i, `<meta property="og:site_name" content="${escapeHtmlAttr(siteName)}" />`);
  modified = modified.replace(/<meta\s+property="og:type"\s+content=".*?"\s*\/?>/i, `<meta property="og:type" content="product" />`);
  modified = modified.replace(/<meta\s+property="og:title"\s+content=".*?"\s*\/?>/i, `<meta property="og:title" content="${escapeHtmlAttr(meta.title)}" />`);
  modified = modified.replace(/<meta\s+property="og:description"\s+content=".*?"\s*\/?>/i, `<meta property="og:description" content="${escapeHtmlAttr(meta.description)}" />`);
  modified = modified.replace(/<meta\s+property="og:url"\s+content=".*?"\s*\/?>/i, `<meta property="og:url" content="${escapeHtmlAttr(meta.canonicalUrl)}" />`);
  if (meta.ogImage) {
    modified = modified.replace(/<meta\s+property="og:image"\s+content=".*?"\s*\/?>/i, `<meta property="og:image" content="${escapeHtmlAttr(meta.ogImage)}" />`);
  }

  // Replace Twitter
  modified = modified.replace(/<meta\s+name="twitter:card"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:card" content="summary_large_image" />`);
  modified = modified.replace(/<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:title" content="${escapeHtmlAttr(meta.title)}" />`);
  modified = modified.replace(/<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:description" content="${escapeHtmlAttr(meta.description)}" />`);
  if (meta.ogImage) {
    modified = modified.replace(/<meta\s+name="twitter:image"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:image" content="${escapeHtmlAttr(meta.ogImage)}" />`);
  }

  // Inject Product Schema right before </head>
  if (!modified.includes('id="schema-product"')) {
    modified = modified.replace('</head>', `  ${schemaScript}\n</head>`);
  }

  // Crawler & SEO Fallback HTML:
  // Render semantic HTML inside <div id="root"> and <noscript> so crawlers that do not
  // execute client-side JavaScript receive meaningful product title, price, description, images, and availability.
  // When client JavaScript runs, React's createRoot automatically renders the interactive application.
  const productCrawlerHtml = `
  <main class="ssr-crawler-fallback" style="padding: 24px; max-width: 900px; margin: 0 auto; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <nav style="font-size: 14px; margin-bottom: 16px; color: #64748b;">
      <a href="/" style="color: #e11d48; text-decoration: underline; text-underline-offset: 3px;">Home</a> &gt;
      ${categoryName && product.categoryId ? `<a href="/category/${escapeHtmlAttr(categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}" style="color: #e11d48; text-decoration: underline; text-underline-offset: 3px;">${escapeHtmlAttr(categoryName)}</a> &gt; ` : categoryName ? `<span>${escapeHtmlAttr(categoryName)}</span> &gt; ` : ''}
      <span>${escapeHtmlAttr(product.title)}</span>
    </nav>
    <article>
      <h1 style="font-size: 28px; font-weight: 800; color: #0f172a; margin-bottom: 12px;">${escapeHtmlAttr(product.title)}</h1>
      <div style="font-size: 24px; font-weight: 800; color: #e11d48; margin-bottom: 12px;">৳${product.price.toLocaleString()} BDT</div>
      <div style="font-size: 14px; color: #475569; margin-bottom: 16px;">
        <span><strong>Availability:</strong> ${product.stock > 0 ? 'In Stock' : 'Out of Stock'}</span>
        ${categoryName ? ` | <span><strong>Category:</strong> ${escapeHtmlAttr(categoryName)}</span>` : ''}
        <span> | <strong>Brand:</strong> ${escapeHtmlAttr(siteName)}</span>
        ${product.sku ? ` | <span><strong>SKU:</strong> ${escapeHtmlAttr(product.sku)}</span>` : ''}
      </div>
      ${meta.ogImage ? `<div style="margin: 20px 0;"><img src="${escapeHtmlAttr(meta.ogImage)}" alt="${escapeHtmlAttr(product.title)}" style="max-width: 450px; width: 100%; border-radius: 12px; border: 1px solid #e2e8f0;" /></div>` : ''}
      <div style="font-size: 16px; line-height: 1.7; color: #334155; margin-top: 16px; white-space: pre-line;">${escapeHtmlAttr(product.description || '')}</div>
    </article>
  </main>`;

  const productNoscriptHtml = `
  <noscript>
    <div style="padding: 24px; max-width: 900px; margin: 0 auto; font-family: sans-serif;">
      <h1>${escapeHtmlAttr(product.title)}</h1>
      <p><strong>Price:</strong> ৳${product.price.toLocaleString()} BDT</p>
      <p><strong>Availability:</strong> ${product.stock > 0 ? 'In Stock' : 'Out of Stock'}</p>
      ${categoryName ? `<p><strong>Category:</strong> ${escapeHtmlAttr(categoryName)}</p>` : ''}
      <p><strong>Brand:</strong> ${escapeHtmlAttr(siteName)}</p>
      ${meta.ogImage ? `<p><img src="${escapeHtmlAttr(meta.ogImage)}" alt="${escapeHtmlAttr(product.title)}" style="max-width: 400px; width: 100%;" /></p>` : ''}
      <p>${escapeHtmlAttr(product.description || '')}</p>
    </div>
  </noscript>`;

  if (modified.includes('<div id="root"></div>')) {
    modified = modified.replace('<div id="root"></div>', `<div id="root">${productCrawlerHtml}</div>\n${productNoscriptHtml}`);
  }

  return modified;
}

/**
 * Injects dynamic category SEO tags, canonical URL, Breadcrumbs Schema, Collection Schema,
 * and semantic crawler-fallback body HTML into initial HTML response.
 */
export function injectCategorySEOIntoHtml(
  html: string,
  category: Category,
  siteName: string = DEFAULT_SITE_NAME
): string {
  const catSeo = getCategorySEOData(category, siteName);
  const canonicalUrl = `${SITE_DOMAIN}/category/${encodeURIComponent(category.slug || category.id)}`;
  const breadcrumbs = [
    { name: 'Home', url: `${SITE_DOMAIN}/` },
    { name: category.name, url: canonicalUrl },
  ];
  const breadcrumbsSchema = generateBreadcrumbSchema(breadcrumbs);
  const breadcrumbsScript = `<script type="application/ld+json" id="schema-breadcrumbs">${safeJsonLdStringify(breadcrumbsSchema)}</script>`;

  const categoryCollectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: catSeo.h1 || category.name,
    description: catSeo.description,
    url: canonicalUrl,
    breadcrumb: breadcrumbsSchema,
  };
  const categoryCollectionScript = `<script type="application/ld+json" id="schema-category-collection">${safeJsonLdStringify(categoryCollectionSchema)}</script>`;

  let modified = html;

  // Replace Title
  modified = modified.replace(/<title>.*?<\/title>/i, `<title>${escapeHtmlAttr(catSeo.title)}</title>`);

  // Replace Description
  modified = modified.replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/i, `<meta name="description" content="${escapeHtmlAttr(catSeo.description)}" />`);

  // Replace Canonical
  if (/<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i.test(modified)) {
    modified = modified.replace(/<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i, `<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />`);
  } else if (modified.includes('</head>')) {
    modified = modified.replace('</head>', `  <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />\n</head>`);
  }

  // Ensure index, follow
  modified = modified.replace(/<meta\s+name="robots"\s+content=".*?"\s*\/?>/i, `<meta name="robots" content="index, follow" />`);

  // Replace OpenGraph
  modified = modified.replace(/<meta\s+property="og:site_name"\s+content=".*?"\s*\/?>/i, `<meta property="og:site_name" content="${escapeHtmlAttr(siteName)}" />`);
  modified = modified.replace(/<meta\s+property="og:type"\s+content=".*?"\s*\/?>/i, `<meta property="og:type" content="website" />`);
  modified = modified.replace(/<meta\s+property="og:title"\s+content=".*?"\s*\/?>/i, `<meta property="og:title" content="${escapeHtmlAttr(catSeo.title)}" />`);
  modified = modified.replace(/<meta\s+property="og:description"\s+content=".*?"\s*\/?>/i, `<meta property="og:description" content="${escapeHtmlAttr(catSeo.description)}" />`);
  modified = modified.replace(/<meta\s+property="og:url"\s+content=".*?"\s*\/?>/i, `<meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />`);

  // Replace Twitter
  modified = modified.replace(/<meta\s+name="twitter:card"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:card" content="summary_large_image" />`);
  modified = modified.replace(/<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:title" content="${escapeHtmlAttr(catSeo.title)}" />`);
  modified = modified.replace(/<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:description" content="${escapeHtmlAttr(catSeo.description)}" />`);

  // Inject Breadcrumbs Schema
  if (!modified.includes('id="schema-breadcrumbs"')) {
    modified = modified.replace('</head>', `  ${breadcrumbsScript}\n  ${categoryCollectionScript}\n</head>`);
  }

  // Crawler & SEO Fallback HTML for Category Page
  const categoryCrawlerHtml = `
  <main class="ssr-crawler-fallback" style="padding: 24px; max-width: 900px; margin: 0 auto; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <nav style="font-size: 14px; margin-bottom: 16px; color: #64748b;">
      <a href="/" style="color: #e11d48; text-decoration: underline; text-underline-offset: 3px;">Home</a> &gt;
      <span>${escapeHtmlAttr(category.name)}</span>
    </nav>
    <article>
      <h1 style="font-size: 28px; font-weight: 800; color: #0f172a; margin-bottom: 12px;">${escapeHtmlAttr(category.name)}</h1>
      <p style="font-size: 16px; line-height: 1.7; color: #334155; margin-bottom: 20px;">${escapeHtmlAttr(category.description || '')}</p>
    </article>
  </main>`;

  const categoryNoscriptHtml = `
  <noscript>
    <div style="padding: 24px; max-width: 900px; margin: 0 auto; font-family: sans-serif;">
      <nav><a href="/" style="color: #e11d48; text-decoration: underline; text-underline-offset: 3px;">Home</a> &gt; ${escapeHtmlAttr(category.name)}</nav>
      <h1>${escapeHtmlAttr(category.name)}</h1>
      <p>${escapeHtmlAttr(category.description || '')}</p>
    </div>
  </noscript>`;

  if (modified.includes('<div id="root"></div>')) {
    modified = modified.replace('<div id="root"></div>', `<div id="root">${categoryCrawlerHtml}</div>\n${categoryNoscriptHtml}`);
  }

  return modified;
}

/**
 * Helper to update document head tags in Client-Side React SPA without duplicates
 */
export function applyClientSEO(meta: SEOMetadata, settings?: StoreSettings) {
  if (typeof document === 'undefined') return;

  const siteName = settings?.siteName || DEFAULT_SITE_NAME;

  // 1. Update Title
  document.title = meta.title;

  // Helper to get or create tag
  const setMetaTag = (attribute: string, attributeValue: string, content: string) => {
    let el = document.querySelector(`meta[${attribute}="${attributeValue}"]`) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attribute, attributeValue);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  // 2. Meta Description
  setMetaTag('name', 'description', meta.description);

  // 3. Robots meta (ensure private/error states get noindex while valid pages get index, follow)
  if (meta.noIndex) {
    setMetaTag('name', 'robots', 'noindex, follow');
  } else {
    setMetaTag('name', 'robots', 'index, follow');
  }

  // Remove obsolete/forbidden meta keywords if present anywhere
  const existingKeywords = document.querySelector('meta[name="keywords"]');
  if (existingKeywords) {
    existingKeywords.remove();
  }

  // 4. Canonical URL
  let canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonicalEl) {
    canonicalEl = document.createElement('link');
    canonicalEl.setAttribute('rel', 'canonical');
    document.head.appendChild(canonicalEl);
  }
  canonicalEl.setAttribute('href', meta.canonicalUrl);

  // 5. OpenGraph Tags
  setMetaTag('property', 'og:title', meta.title);
  setMetaTag('property', 'og:description', meta.description);
  setMetaTag('property', 'og:url', meta.canonicalUrl);
  setMetaTag('property', 'og:type', meta.ogType || 'website');
  setMetaTag('property', 'og:site_name', siteName);
  if (meta.ogImage) {
    setMetaTag('property', 'og:image', meta.ogImage);
  }

  // 6. Twitter / X Cards
  setMetaTag('name', 'twitter:card', 'summary_large_image');
  setMetaTag('name', 'twitter:title', meta.title);
  setMetaTag('name', 'twitter:description', meta.description);
  if (meta.ogImage) {
    setMetaTag('name', 'twitter:image', meta.ogImage);
  }

  // 7. Inject / Update Schema.org JSON-LD scripts
  const injectSchemaScript = (id: string, schemaObj: any) => {
    let script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = id;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(schemaObj, null, 2);
  };

  // Organization Schema (always present)
  injectSchemaScript('schema-organization', generateOrganizationSchema(settings));

  // WebSite Search Schema (on homepage/general)
  injectSchemaScript('schema-website', generateWebSiteSchema(siteName));

  // Breadcrumbs Schema
  if (meta.breadcrumbs && meta.breadcrumbs.length > 0) {
    injectSchemaScript('schema-breadcrumbs', generateBreadcrumbSchema(meta.breadcrumbs));
  } else {
    const existingBc = document.getElementById('schema-breadcrumbs');
    if (existingBc) existingBc.remove();
  }

  // Product Schema (strictly when on a product view)
  if (meta.product) {
    const categoryName = meta.category?.name;
    injectSchemaScript('schema-product', generateProductSchema(meta.product, categoryName, siteName, meta.reviews));
  } else {
    const existingProdSchema = document.getElementById('schema-product');
    if (existingProdSchema) existingProdSchema.remove();
  }
}
