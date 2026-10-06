import { useState, type InputHTMLAttributes } from 'react';

import { EyeIcon, EyeOffIcon } from '../Icons';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Names the toggle: "Show {toggleLabel}" / "Hide {toggleLabel}". */
  toggleLabel?: string;
};

/** A password field with an eye button that reveals what was typed. Visibility is local, so it always starts hidden. */
export function PasswordInput({ toggleLabel = 'password', className, ...rest }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <div className="password-field">
      <input {...rest} className={['field', className].filter(Boolean).join(' ')} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        className="password-toggle"
        aria-label={`${shown ? 'Hide' : 'Show'} ${toggleLabel}`}
        aria-pressed={shown}
        onClick={() => setShown(value => !value)}>
        {shown ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </div>
  );
}
