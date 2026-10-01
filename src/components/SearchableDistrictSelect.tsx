import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, MapPin } from 'lucide-react';
import { ALL_BANGLADESH_LOCATIONS, BangladeshLocation } from '../data/bangladeshAreas';

interface SearchableDistrictSelectProps {
  id?: string;
  value: string;
  onChange: (val: string, location?: BangladeshLocation) => void;
  hasError?: boolean;
  placeholder?: string;
}

export const SearchableDistrictSelect: React.FC<SearchableDistrictSelectProps> = ({
  id = 'customer-district-select',
  value,
  onChange,
  hasError = false,
  placeholder = 'Select City',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Filter locations based on query (case-insensitive search on district, upazila, or combined name)
  const filteredLocations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      return ALL_BANGLADESH_LOCATIONS;
    }
    return ALL_BANGLADESH_LOCATIONS.filter((loc) =>
      loc.displayName.toLowerCase().includes(q) ||
      loc.district.toLowerCase().includes(q) ||
      loc.upazila.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Reset highlight index when query changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (location: BangladeshLocation) => {
    onChange(location.displayName, location);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredLocations.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredLocations[highlightedIndex]) {
        handleSelect(filteredLocations[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full text-left">
      {/* Hidden input to maintain native form/id accessibility */}
      <input type="hidden" id={id} name="district" value={value} />

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 flex items-center justify-between gap-2 transition-all cursor-pointer ${
          hasError
            ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/20'
            : 'border-slate-300 focus:ring-rose-500 hover:border-slate-400'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-1.5 truncate">
          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          {value ? (
            <span className="truncate text-slate-800 font-semibold">{value}</span>
          ) : (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0 text-slate-400">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="p-0.5 hover:text-slate-600 rounded cursor-pointer"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-rose-500' : ''}`}
          />
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/80 sticky top-0 z-10">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type district or thana (e.g. Bagerhat, Gulshan)..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 px-1">
              <span>{filteredLocations.length} locations found</span>
              <span>Use ↑↓ arrows to navigate</span>
            </div>
          </div>

          {/* Results List */}
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-60 overflow-y-auto divide-y divide-slate-50 py-1 text-xs"
          >
            {filteredLocations.length > 0 ? (
              filteredLocations.map((loc, idx) => {
                const isSelected = value === loc.displayName;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <li
                    key={loc.displayName}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(loc)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-rose-50 text-rose-700 font-semibold'
                        : isHighlighted
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="truncate">
                        <strong className="text-slate-900">{loc.district}</strong>
                        <span className="text-slate-400 mx-1">-</span>
                        <span className="text-slate-600">{loc.upazila}</span>
                      </span>
                    </div>

                    {isSelected && (
                      <div className="shrink-0 ml-2">
                        <Check className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      </div>
                    )}
                  </li>
                );
              })
            ) : (
              <li className="px-4 py-6 text-center text-xs text-slate-500">
                <MapPin className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                No matching district or upazila found for &quot;{searchQuery}&quot;
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
