"use client";

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Check } from 'lucide-react';

// ─── Country Data ────────────────────────────────────────────────────────────
// subscriberDigits = exact number of digits the subscriber number must have
// (i.e. the part AFTER the dial code)

export interface CountryOption {
  code: string;   // ISO 3166-1 alpha-2
  name: string;
  flag: string;
  dialCode: string;
  subscriberDigits: number;
}

// Pinned at top: UAE, India. Rest sorted alphabetically.
export const COUNTRIES: CountryOption[] = [
  // ── Pinned ─────────────────────────────────────────────────────────────────
  { code: 'AE', name: 'UAE',          flag: '🇦🇪', dialCode: '+971', subscriberDigits: 9  },
  { code: 'IN', name: 'India',        flag: '🇮🇳', dialCode: '+91',  subscriberDigits: 10 },
  // ── Rest (alpha) ────────────────────────────────────────────────────────────
  { code: 'BH', name: 'Bahrain',      flag: '🇧🇭', dialCode: '+973', subscriberDigits: 8  },
  { code: 'EG', name: 'Egypt',        flag: '🇪🇬', dialCode: '+20',  subscriberDigits: 10 },
  { code: 'JO', name: 'Jordan',       flag: '🇯🇴', dialCode: '+962', subscriberDigits: 9  },
  { code: 'KW', name: 'Kuwait',       flag: '🇰🇼', dialCode: '+965', subscriberDigits: 8  },
  { code: 'OM', name: 'Oman',         flag: '🇴🇲', dialCode: '+968', subscriberDigits: 8  },
  { code: 'PK', name: 'Pakistan',     flag: '🇵🇰', dialCode: '+92',  subscriberDigits: 10 },
  { code: 'QA', name: 'Qatar',        flag: '🇶🇦', dialCode: '+974', subscriberDigits: 8  },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', dialCode: '+966', subscriberDigits: 9  },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', dialCode: '+44', subscriberDigits: 10 },
  { code: 'US', name: 'USA / Canada', flag: '🇺🇸', dialCode: '+1',  subscriberDigits: 10 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse an E.164-like stored value back into country + subscriber number. */
function parseStoredValue(value: string): { country: CountryOption; subscriber: string } {
  const defaultCountry = COUNTRIES[0]; // UAE
  if (!value) return { country: defaultCountry, subscriber: '' };

  // Try longest dial code first to avoid +1 matching +966 etc.
  const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const c of sorted) {
    if (value.startsWith(c.dialCode)) {
      return { country: c, subscriber: value.slice(c.dialCode.length) };
    }
  }
  return { country: defaultCountry, subscriber: value };
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface PhoneInputProps {
  value: string;                        // full E.164 string, e.g. "+971501234567"
  onChange: (value: string) => void;    // called with full E.164 string
  label?: string;
  required?: boolean;
  error?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  label,
  required,
  error,
  placeholder,
  className,
  disabled,
}: PhoneInputProps) {
  const { country: initialCountry, subscriber: initialSubscriber } = parseStoredValue(value);

  const [country, setCountry] = React.useState<CountryOption>(initialCountry);
  const [subscriber, setSubscriber] = React.useState(initialSubscriber);
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Sync external value changes (e.g. form reset or edit-dialog re-open)
  React.useEffect(() => {
    const { country: c, subscriber: s } = parseStoredValue(value);
    setCountry(c);
    setSubscriber(s);
  }, [value]);

  // Close dropdown on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredCountries = search
    ? COUNTRIES.filter(
        c =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.dialCode.includes(search)
      )
    : COUNTRIES;

  const handleCountrySelect = (c: CountryOption) => {
    setCountry(c);
    setSubscriber('');
    onChange(c.dialCode);
    setOpen(false);
    setSearch('');
  };

  const handleSubscriberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip anything that is not a digit
    const digits = e.target.value.replace(/\D/g, '');
    // Clamp to max allowed digits
    const clamped = digits.slice(0, country.subscriberDigits);
    setSubscriber(clamped);
    onChange(clamped ? `${country.dialCode}${clamped}` : country.dialCode);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowedKeys = [
      'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight',
      'Tab', 'Home', 'End',
    ];
    if (allowedKeys.includes(e.key)) return;
    // Block anything that is not a digit
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const isLengthError =
    subscriber.length > 0 && subscriber.length !== country.subscriberDigits;
  const isComplete = subscriber.length === country.subscriberDigits;

  const combinedError = error ?? (isLengthError
    ? `${country.name} numbers must be exactly ${country.subscriberDigits} digits`
    : undefined);

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="block text-sm font-medium mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div
        className={cn(
          'flex h-10 w-full rounded-md border bg-surface text-sm transition-colors',
          combinedError
            ? 'border-red-400 ring-1 ring-red-400'
            : isComplete
            ? 'border-emerald-400 ring-1 ring-emerald-400'
            : 'border-slate-300 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {/* ── Country Picker ── */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(v => !v)}
            className={cn(
              'flex items-center gap-1.5 h-full pl-3 pr-2 rounded-l-md border-r border-slate-300 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700 focus:outline-none whitespace-nowrap',
              disabled && 'pointer-events-none'
            )}
          >
            <span className="text-base leading-none">{country.flag}</span>
            <span className="text-slate-600 text-xs">{country.dialCode}</span>
            <ChevronDown className={cn('w-3 h-3 text-slate-400 transition-transform', open && 'rotate-180')} />
          </button>

          {open && (
            <div className="absolute top-full left-0 z-50 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
              {/* Search */}
              <div className="p-2 border-b border-slate-100">
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search country..."
                  className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Country List */}
              <ul className="max-h-52 overflow-y-auto py-1">
                {filteredCountries.length === 0 && (
                  <li className="px-3 py-2 text-sm text-slate-400 italic">No results</li>
                )}
                {filteredCountries.map((c, idx) => {
                  // Divider after the 2 pinned entries when not searching
                  const showDivider = !search && idx === 2;
                  return (
                    <React.Fragment key={c.code}>
                      {showDivider && <li className="border-t border-slate-100 my-1" />}
                      <li>
                        <button
                          type="button"
                          onClick={() => handleCountrySelect(c)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 transition-colors text-left"
                        >
                          <span className="text-base w-6 shrink-0">{c.flag}</span>
                          <span className="flex-1 text-slate-700">{c.name}</span>
                          <span className="text-slate-400 text-xs">{c.dialCode}</span>
                          {c.code === country.code && (
                            <Check className="w-4 h-4 text-brand-600 shrink-0" />
                          )}
                        </button>
                      </li>
                    </React.Fragment>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* ── Number Input ── */}
        <div className="flex-1 flex items-center relative">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={disabled}
            value={subscriber}
            onChange={handleSubscriberChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? `${country.subscriberDigits} digits`}
            className="w-full h-full px-3 bg-transparent focus:outline-none placeholder:text-slate-400 text-sm disabled:cursor-not-allowed"
          />
          {/* Digit counter */}
          <span
            className={cn(
              'absolute right-3 text-xs font-mono tabular-nums pointer-events-none',
              isLengthError
                ? 'text-red-400'
                : isComplete
                ? 'text-emerald-500'
                : 'text-slate-300'
            )}
          >
            {subscriber.length}/{country.subscriberDigits}
          </span>
        </div>
      </div>

      {/* Error / hint */}
      {combinedError && (
        <p className="mt-1 text-xs text-red-500">{combinedError}</p>
      )}
    </div>
  );
}
