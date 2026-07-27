import { type ButtonHTMLAttributes, forwardRef } from 'react';
import * as actionButtonStyles from './ActionButton.module.css';

const { default: styles } = actionButtonStyles;

type ActionButtonVariant = 'primary' | 'secondary';

export interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ActionButtonVariant;
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { className, variant, ...props },
  ref
) {
  const hookClassName = variant === 'primary' ? 'finalize-button' : 'secondary-button';
  const variantClassName = variant === 'primary' ? styles.primary : styles.secondary;

  return (
    <button
      className={[styles.button, variantClassName, hookClassName, className].filter(Boolean).join(' ')}
      ref={ref}
      {...props}
    />
  );
});
