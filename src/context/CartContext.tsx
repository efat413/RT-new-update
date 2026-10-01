import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { CartItem, Product } from '../types';
import { STORAGE_KEYS } from './storageKeys';
import { trackSocialEvent } from '../utils/pixelTracking';

export interface CartContextType {
  cart: CartItem[];
  cartCount: number;
  cartSubtotal: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  addToCart: (
    product: Product,
    quantity?: number,
    selectedSize?: string,
    selectedColor?: string,
    openDrawer?: boolean
  ) => void;
  updateCartQuantity: (
    productId: string,
    quantity: number,
    selectedSize?: string,
    selectedColor?: string
  ) => void;
  removeFromCart: (
    productId: string,
    selectedSize?: string,
    selectedColor?: string
  ) => void;
  clearCart: () => void;
  quickBuy: (
    product: Product,
    selectedSize?: string,
    selectedColor?: string
  ) => void;
}

export const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CART);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

  // Sync cart to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
    } catch (e) {
      console.error('Failed to save cart to localStorage', e);
    }
  }, [cart]);

  const cartCount = useMemo(() => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  }, [cart]);

  const cartSubtotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.product.price * item.quantity, 0);
  }, [cart]);

  const addToCart = useCallback((
    product: Product,
    quantity: number = 1,
    selectedSize?: string,
    selectedColor?: string,
    openDrawer: boolean = false
  ) => {
    setCart((prev) => {
      const existing = prev.find(
        (item) =>
          item.product.id === product.id &&
          item.selectedSize === selectedSize &&
          item.selectedColor === selectedColor
      );
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id &&
          item.selectedSize === selectedSize &&
          item.selectedColor === selectedColor
            ? { ...item, quantity: Math.min(product.stock, item.quantity + quantity) }
            : item
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: Math.min(product.stock, quantity),
          selectedSize,
          selectedColor,
        },
      ];
    });

    // Track AddToCart event to Meta, TikTok, and GTM
    try {
      trackSocialEvent('AddToCart', {
        content_name: product.title,
        content_ids: [product.id],
        content_type: 'product',
        value: product.price * quantity,
        currency: 'BDT',
        quantity,
      });
    } catch {}

    if (openDrawer) {
      setIsCartOpen(true);
    }
  }, []);

  const updateCartQuantity = useCallback((
    productId: string,
    quantity: number,
    selectedSize?: string,
    selectedColor?: string
  ) => {
    if (quantity <= 0) {
      setCart((prev) =>
        prev.filter((item) => {
          if (item.product.id !== productId) return true;
          if (selectedSize !== undefined && item.selectedSize !== selectedSize) return true;
          if (selectedColor !== undefined && item.selectedColor !== selectedColor) return true;
          return false;
        })
      );
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        const matches =
          item.product.id === productId &&
          (selectedSize === undefined || item.selectedSize === selectedSize) &&
          (selectedColor === undefined || item.selectedColor === selectedColor);
        if (matches) {
          return { ...item, quantity: Math.min(item.product.stock, quantity) };
        }
        return item;
      })
    );
  }, []);

  const removeFromCart = useCallback((
    productId: string,
    selectedSize?: string,
    selectedColor?: string
  ) => {
    setCart((prev) =>
      prev.filter((item) => {
        if (item.product.id !== productId) return true;
        if (selectedSize !== undefined && item.selectedSize !== selectedSize) return true;
        if (selectedColor !== undefined && item.selectedColor !== selectedColor) return true;
        return false;
      })
    );
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const quickBuy = useCallback((
    product: Product,
    selectedSize?: string,
    selectedColor?: string
  ) => {
    addToCart(product, 1, selectedSize, selectedColor, true);
    setIsCartOpen(true);
  }, [addToCart]);

  const value = useMemo<CartContextType>(() => ({
    cart,
    cartCount,
    cartSubtotal,
    isCartOpen,
    setIsCartOpen,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    quickBuy,
  }), [
    cart,
    cartCount,
    cartSubtotal,
    isCartOpen,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    quickBuy,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
