export const NOTIFICATIONS_NEED_PERMISSION = 'Eiyu needs permission to send notifications. Tap Retry to allow it.';
export const NOTIFICATIONS_REFUSED = 'Eiyu does not have permission to send notifications on this phone. Allow it in phone settings, or turn reminders off in Settings.';

/** The reminder failure that the phone's own settings can fix (the system holds the permission). */
export const isReminderPermissionWarning = (warning: string) => /permission/i.test(warning);
