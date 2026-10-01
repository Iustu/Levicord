import React, { useId } from 'react';
import './Input.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

/**
 * Accessible input wrapper: the label is programmatically associated with the
 * input via htmlFor/id. Uses React.useId() to generate a stable unique ID so
 * callers do not need to pass an explicit id.
 * (DMMT Cap.12 / WCAG 2.1 1.3.1 \u2014 clicking the label must focus the input;
 * screen readers must announce the label when the field is focused.)
 */
export const Input: React.FC<InputProps> = ({ label, error, className = '', id, ...props }) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={`input-wrapper ${className}`}>
      {label && <label className="input-label" htmlFor={inputId}>{label}</label>}
      <input id={inputId} className={`custom-input ${error ? 'input-error' : ''}`} {...props} />
      {error && <span className="error-message" role="alert">{error}</span>}
    </div>
  );
};
