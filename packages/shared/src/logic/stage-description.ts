export const STAGE_DESCRIPTION_MAX_LENGTH = 2000;

export function isStageDescriptionWithinLimit(value?: string | null): boolean {
  return Array.from(value?.trim() ?? '').length <= STAGE_DESCRIPTION_MAX_LENGTH;
}

export function normalizeStageDescription(value?: string | null): string | null {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;
  if (!isStageDescriptionWithinLimit(normalized)) {
    throw new Error(`Stage descriptions must be ${STAGE_DESCRIPTION_MAX_LENGTH} characters or fewer.`);
  }
  return normalized;
}
