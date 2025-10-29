import * as React from 'react';

export interface CheckboxProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  'data-testid'?: string;
}

/**
 * Checkbox Component
 *
 * A simple checkbox component for forms and settings.
 */
export function Checkbox({
  id,
  checked,
  onCheckedChange,
  disabled = false,
  'data-testid': dataTestId,
}: CheckboxProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCheckedChange(e.target.checked);
  };

  return (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={handleChange}
      disabled={disabled}
      data-testid={dataTestId}
      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
