export class UncertainSaveError extends Error {
  constructor() { super('The save result is uncertain. Check the saved record before retrying. Your inputs and uploaded media have been retained.'); this.name = 'UncertainSaveError'; }
}
export function isConfirmedFailure(error: unknown) {
  const code = (error as { code?: string })?.code;
  return !!code && (/^[0-9A-Z]{5}$/.test(code) || code.startsWith('PGRST'));
}
