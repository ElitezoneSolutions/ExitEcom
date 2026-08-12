import { ChevronDown } from "lucide-react";
import type { SelectOption } from "@/lib/profileOptions";

// Shared form controls for the business-profile screens (onboarding and
// /profile). They lived in onboarding.tsx first; /profile needs the same
// dropdowns, and two copies would drift in styling and behaviour.

export function Input({
  label,
  value,
  onChange,
  type = "text",
  prefix,
  placeholder,
  min,
  required = true,
  disabled,
  id,
}: {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
  prefix?: string;
  placeholder?: string;
  min?: number;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      {label && (
        <span className="label-caps" style={{ fontSize: 10 }}>
          {label}
        </span>
      )}
      <div
        className={`${label ? "mt-2 " : ""}flex items-center w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3.5 focus-within:border-[var(--accent)] ${disabled ? "opacity-50" : ""}`}
      >
        {prefix && (
          <span className="text-sm text-[var(--text-muted)] mr-1.5 select-none">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type={type}
          required={required}
          disabled={disabled}
          min={min}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full !border-0 !bg-transparent !px-0 !py-2.5 !shadow-none text-sm focus:outline-none text-[var(--text-primary)]"
        />
      </div>
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  required = true,
  disabled,
  hint,
  id,
}: {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  id?: string;
}) {
  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o, disabled: false } : o,
  );
  return (
    <label className="block" htmlFor={id}>
      {label && (
        <span className="label-caps" style={{ fontSize: 10 }}>
          {label}
        </span>
      )}
      <div className={`relative ${label ? "mt-2" : ""}`}>
        <select
          id={id}
          value={value}
          required={required}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none !bg-transparent border border-[var(--border-warm)] rounded-md pl-3.5 pr-10 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)] disabled:opacity-50"
        >
          {/* Always present so a blank/unset value renders as the prompt rather
              than silently showing the first option as if it were chosen. */}
          <option value="" disabled className="bg-[var(--bg-primary)]">
            {placeholder ?? "Select an option"}
          </option>
          {normalized.map((o) => (
            <option
              key={o.value}
              value={o.value}
              disabled={o.disabled}
              className="bg-[var(--bg-primary)]"
            >
              {o.label ?? o.value}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
      </div>
      {hint && (
        <span className="block mt-1.5 text-xs text-[var(--text-muted)]">
          {hint}
        </span>
      )}
    </label>
  );
}
