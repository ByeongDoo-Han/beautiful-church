'use client';
import { Check } from 'lucide-react';

export function ChoiceButtons({ label, ariaLabel = label, value, options, onChange, disabled = false, className = '' }: {
  label: string; ariaLabel?: string; value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void; disabled?: boolean; className?: string;
}) {
  const selected = options.findIndex(option => option.value === value);
  return <fieldset className={`choice-buttons ${className}`} aria-label={ariaLabel} disabled={disabled}>
    <legend>{label}</legend>
    <div className="choice-buttons-options">
      {options.map((option, index) => <button key={option.value} type="button" disabled={disabled}
        aria-pressed={option.value === value} tabIndex={index === Math.max(0, selected) ? 0 : -1}
        title={option.label} onClick={() => { if (option.value !== value) onChange(option.value); }}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
            : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + options.length) % options.length;
          event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
          if (options[next].value !== value) onChange(options[next].value);
        }}><Check size={14} aria-hidden="true" /><span>{option.label}</span></button>)}
    </div>
  </fieldset>;
}
