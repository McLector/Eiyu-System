import {validateBirthday} from './validation';
import {AGE_NOTICE_VERSION} from './legal-content';

/** Signup admission only: Profile corrections still accept valid under12 declarations. */
export function validateSignupBirthday(birthday: string, today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())): string | null {
  const error = validateBirthday(birthday, today);
  if (error) return error;
  const cutoffYear = Number(today.slice(0, 4)) - 12;
  const cutoff = `${String(cutoffYear).padStart(4, '0')}${today.slice(4)}`;
  return cutoffYear < 1 || birthday > cutoff ? 'New Eiyu accounts are for ages 12 and above.' : null;
}

/** No metadata is created for missing permission or a rejected declaration. */
export function initialBirthdayMetadata(birthday: string, granted: boolean, today?: string) {
  if (granted !== true) throw new Error('Review the birthday notice and give specific permission before signup.');
  const error = validateSignupBirthday(birthday, today);
  if (error) throw new Error(error);
  return {birth_date: birthday, processing_consent: {age_screening: {granted: true, notice_version: AGE_NOTICE_VERSION}}};
}
