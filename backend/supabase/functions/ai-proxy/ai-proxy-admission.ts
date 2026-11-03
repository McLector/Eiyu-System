export type ExecutionTicket = { requestId: string; executionId: string; epoch: number };
export type ExecutionDenial = 'processing' | 'age' | 'mailbox' | 'quota' | 'unavailable';
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function parseExecutionTicket(value: unknown, expected: Pick<ExecutionTicket, 'requestId' | 'executionId'>): ExecutionTicket | null {
  if (!record(value) || value.allowed !== true || value.attemptNumber !== 1 || value.contractVersion !== 1
    || !Number.isSafeInteger(value.epoch) || (value.epoch as number) < 1
    || value.executionId !== expected.executionId || value.requestId !== expected.requestId
    || !expected.executionId || !expected.requestId) return null;
  return {...expected, epoch: value.epoch as number};
}
export function executionDenial(error: unknown): ExecutionDenial {
  if (!record(error)) return 'unavailable';
  switch (error.code) {
    case 'EP001': case 'EP002': return 'processing';
    case 'EA001': return 'age';
    case 'EM001': return 'mailbox';
    case 'EQ001': return 'quota';
    default: return 'unavailable';
  }
}
