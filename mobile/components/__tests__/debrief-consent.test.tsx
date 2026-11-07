import {act, screen, userEvent, waitFor} from '@testing-library/react-native';
import type {ProcessingAccess} from '@eiyu/shared';
import {renderWithTheme, TestThemeProvider} from '../ui/test-theme';
import {DebriefConsent} from '../status/debrief-consent';

const mockSave = jest.fn();
const mockRead = jest.fn();
const mockMailbox = jest.fn();
jest.mock('@eiyu/shared', () => ({...jest.requireActual('@eiyu/shared'),
  setProcessingConsent: (...args: unknown[]) => mockSave(...args),
  fetchProcessingAccess: () => mockRead(),
  fetchMailboxStatus: () => mockMailbox()}));

const off: ProcessingAccess = {contractVersion: 1, userId: 'owner-a', ageVersion: 1,
  consentVersion: 1, authorityVersion: 0, mailboxVersion: 1, ageEligible: false,
  ageConsent: false, aiConsent: false, canReadDebrief: false, canGenerateDebrief: false,
  authorityState: 'not-required'};
const afterAge: ProcessingAccess = {...off, ageConsent: true, ageEligible: true, ageVersion: 2};
const afterAi: ProcessingAccess = {...afterAge, aiConsent: true, canReadDebrief: true, canGenerateDebrief: true, consentVersion: 2};
const stale = () => Object.assign(new Error('Processing access changed. Refresh your choices.'), {code: 'EP002'});

const ADULT = {name: /I'm 18 or older/i};
const AI = {name: /Groq/};
const TURN_ON = {name: 'Turn on'};
const wrap = (node: React.ReactElement) => <TestThemeProvider>{node}</TestThemeProvider>;

beforeEach(() => {
  mockSave.mockReset().mockImplementation(async (purpose: string) => purpose === 'age-screening' ? afterAge : afterAi);
  mockRead.mockReset().mockResolvedValue(afterAge);
  mockMailbox.mockReset().mockResolvedValue({userId: 'owner-a', version: 1, verified: true, challenge: null});
});

/** Ticks both boxes and waits for the verified-email check, so Turn on is the next thing on screen. */
async function tickBoth(user: ReturnType<typeof userEvent.setup>) {
  await user.press(screen.getByRole('checkbox', ADULT));
  await user.press(screen.getByRole('checkbox', AI));
}

describe('the Turn on AI weekly review card', () => {
  it('shows the heading and two unticked boxes, one for 18+ and one for the AI agreement naming Groq', async () => {
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off}/>);
    expect(screen.getByText('Turn on AI weekly review')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', ADULT)).not.toBeChecked();
    expect(screen.getByRole('checkbox', AI)).not.toBeChecked();
    expect(screen.getAllByText(/Groq/).length).toBeGreaterThan(0);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('hides Turn on until both boxes are ticked and the email is verified', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off}/>);
    expect(screen.queryByRole('button', TURN_ON)).toBeNull();
    await user.press(screen.getByRole('checkbox', ADULT));
    expect(screen.queryByRole('button', TURN_ON)).toBeNull();
    await user.press(screen.getByRole('checkbox', AI));
    expect(await screen.findByRole('button', TURN_ON)).toBeEnabled();
  });

  it('keeps Turn on hidden when only the adult box is ticked', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off}/>);
    await user.press(screen.getByRole('checkbox', ADULT));
    await waitFor(() => expect(mockMailbox).toHaveBeenCalled());
    expect(screen.getByRole('checkbox', AI)).not.toBeChecked();
    expect(screen.queryByRole('button', TURN_ON)).toBeNull();
  });

  it('keeps Turn on hidden when only the AI box is ticked', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off}/>);
    await user.press(screen.getByRole('checkbox', AI));
    await waitFor(() => expect(mockMailbox).toHaveBeenCalled());
    expect(screen.queryByRole('button', TURN_ON)).toBeNull();
  });

  it('saves the 18+ box first and the AI agreement second, using the access the first save returned', async () => {
    const changed = jest.fn(), user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await tickBoth(user);
    await user.press(await screen.findByRole('button', TURN_ON));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(afterAi));
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave).toHaveBeenNthCalledWith(1, 'age-screening', true, '2026-11-08-adult-v1', off);
    expect(mockSave).toHaveBeenNthCalledWith(2, 'weekly-debrief', true, '2026-11-08-weekly-debrief-v2', afterAge);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('stops before the second save when the first one fails', async () => {
    mockSave.mockRejectedValueOnce(new Error('Synthetic offline'));
    const changed = jest.fn(), user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await tickBoth(user);
    await user.press(await screen.findByRole('button', TURN_ON));
    expect(await screen.findByText('Synthetic offline')).toBeOnTheScreen();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
  });

  it('keeps the saved 18+ answer when the second save fails, so only the AI box remains', async () => {
    mockSave.mockReset().mockResolvedValueOnce(afterAge).mockRejectedValueOnce(new Error('Synthetic offline'));
    const changed = jest.fn(), user = userEvent.setup();
    const view = await renderWithTheme(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await tickBoth(user);
    await user.press(await screen.findByRole('button', TURN_ON));
    expect(await screen.findByText('Synthetic offline')).toBeOnTheScreen();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith(afterAge);
    await view.rerender(wrap(<DebriefConsent userId="owner-a" access={afterAge} onChanged={changed}/>));
    expect(screen.queryByRole('checkbox', ADULT)).toBeNull();
    expect(screen.getByRole('checkbox', AI)).toBeChecked();
    expect(screen.getByText('Synthetic offline')).toBeOnTheScreen();
  });

  it('shows the refresh message and re-reads access when a save is stale (EP002)', async () => {
    mockSave.mockRejectedValueOnce(stale());
    const changed = jest.fn(), user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await tickBoth(user);
    await user.press(await screen.findByRole('button', TURN_ON));
    expect(await screen.findByText('Processing access changed. Refresh your choices.')).toBeOnTheScreen();
    await waitFor(() => expect(changed).toHaveBeenCalledWith(afterAge));
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('recognizes a stale save reported as a plain object, the way Supabase reports it', async () => {
    mockSave.mockRejectedValueOnce({message: 'Processing access changed. Refresh your choices.', code: 'EP002'});
    const changed = jest.fn(), user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await tickBoth(user);
    await user.press(await screen.findByRole('button', TURN_ON));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(afterAge));
    expect(screen.getByText(/Refresh your choices/)).toBeOnTheScreen();
  });

  it('keeps the refresh message when re-reading access also fails', async () => {
    mockSave.mockRejectedValueOnce(stale());
    mockRead.mockRejectedValue(new Error('offline'));
    const changed = jest.fn(), user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await tickBoth(user);
    await user.press(await screen.findByRole('button', TURN_ON));
    await waitFor(() => expect(mockRead).toHaveBeenCalled());
    expect(screen.getByText(/Refresh your choices/)).toBeOnTheScreen();
    expect(changed).not.toHaveBeenCalled();
  });

  it('does not use a re-read that belongs to another account', async () => {
    mockSave.mockRejectedValueOnce(stale());
    mockRead.mockResolvedValue({...afterAge, userId: 'owner-b'});
    const changed = jest.fn(), user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await tickBoth(user);
    await user.press(await screen.findByRole('button', TURN_ON));
    await waitFor(() => expect(mockRead).toHaveBeenCalled());
    expect(changed).not.toHaveBeenCalled();
  });

  it('shows only the AI box when the 18+ box was already given, and makes a single save', async () => {
    const changed = jest.fn(), user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={afterAge} onChanged={changed}/>);
    expect(screen.queryByRole('checkbox', ADULT)).toBeNull();
    await user.press(screen.getByRole('checkbox', AI));
    await user.press(await screen.findByRole('button', TURN_ON));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(afterAi));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith('weekly-debrief', true, '2026-11-08-weekly-debrief-v2', afterAge);
  });

  it('has no birthday, teen, or review-request wording', async () => {
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off}/>);
    expect(screen.queryByText(/birthday/i)).toBeNull();
    expect(screen.queryByText(/teen/i)).toBeNull();
    expect(screen.queryByText(/needs review/i)).toBeNull();
    expect(screen.queryByText(/request(ed)? (a )?review|review request/i)).toBeNull();
    expect(screen.queryByLabelText(/guardian|upload document|selfie|birthday/i)).toBeNull();
  });

  it('shows one email verification box, and no Turn on, while the email is unverified', async () => {
    mockMailbox.mockResolvedValue({userId: 'owner-a', version: 1, verified: false, challenge: null});
    const user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off}/>);
    await tickBoth(user);
    expect(await screen.findAllByRole('button', {name: 'Send verification email'})).toHaveLength(1);
    expect(screen.queryByRole('button', TURN_ON)).toBeNull();
  });

  it('offers Turn on once the email has been verified from inside the card', async () => {
    mockMailbox.mockResolvedValue({userId: 'owner-a', version: 1, verified: false, challenge: null});
    const user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off}/>);
    await tickBoth(user);
    await screen.findByRole('button', {name: 'Send verification email'});
    mockMailbox.mockResolvedValue({userId: 'owner-a', version: 1, verified: true, challenge: null});
    await user.press(screen.getByRole('button', {name: 'Check verification status'}));
    expect(await screen.findByRole('button', TURN_ON)).toBeEnabled();
  });

  it('shows nothing when both boxes are already on, and a fresh unticked card after AI is turned off', async () => {
    const user = userEvent.setup();
    const view = await renderWithTheme(<DebriefConsent userId="owner-a" access={off}/>);
    await tickBoth(user);
    await view.rerender(wrap(<DebriefConsent userId="owner-a" access={afterAi}/>));
    expect(screen.queryByText('Turn on AI weekly review')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await view.rerender(wrap(<DebriefConsent userId="owner-a" access={{...afterAi, aiConsent: false, canGenerateDebrief: false, consentVersion: 3}}/>));
    expect(screen.getByText('Turn on AI weekly review')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', AI)).not.toBeChecked();
    expect(screen.queryByRole('button', TURN_ON)).toBeNull();
  });

  it('shows two unticked boxes again when both permissions are withdrawn', async () => {
    const user = userEvent.setup();
    const view = await renderWithTheme(<DebriefConsent userId="owner-a" access={off}/>);
    await tickBoth(user);
    await view.rerender(wrap(<DebriefConsent userId="owner-a" access={afterAi}/>));
    await view.rerender(wrap(<DebriefConsent userId="owner-a" access={{...off, consentVersion: 4}}/>));
    expect(screen.getByRole('checkbox', ADULT)).not.toBeChecked();
    expect(screen.getByRole('checkbox', AI)).not.toBeChecked();
  });

  it('does not forward A consent after switching to B', async () => {
    let release!: (value: ProcessingAccess) => void;
    mockSave.mockReset().mockReturnValueOnce(new Promise(resolve => {release = resolve;}));
    const changed = jest.fn(), user = userEvent.setup();
    const view = await renderWithTheme(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await tickBoth(user);
    await user.press(await screen.findByRole('button', TURN_ON));
    await view.rerender(wrap(<DebriefConsent userId="owner-b" access={{...off, userId: 'owner-b'}} onChanged={changed}/>));
    await act(async () => {release(afterAge);});
    expect(changed).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', ADULT)).not.toBeChecked();
  });

  it('finishes the AI save even if the card is replaced between the two saves', async () => {
    let release!: (value: ProcessingAccess) => void;
    mockSave.mockReset()
      .mockReturnValueOnce(new Promise(resolve => {release = resolve;}))
      .mockResolvedValueOnce(afterAi);
    const user = userEvent.setup();
    const view = await renderWithTheme(<DebriefConsent userId="owner-a" access={off}/>);
    await tickBoth(user);
    await user.press(await screen.findByRole('button', TURN_ON));
    await view.unmount();
    await act(async () => {release(afterAge);});
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
    expect(mockSave).toHaveBeenNthCalledWith(2, 'weekly-debrief', true, '2026-11-08-weekly-debrief-v2', afterAge);
  });

  it('does not run a second Turn on while one is saving', async () => {
    let release!: (value: ProcessingAccess) => void;
    mockSave.mockReset().mockReturnValueOnce(new Promise(resolve => {release = resolve;})).mockResolvedValue(afterAi);
    const user = userEvent.setup();
    await renderWithTheme(<DebriefConsent userId="owner-a" access={off}/>);
    await tickBoth(user);
    const button = await screen.findByRole('button', TURN_ON);
    await user.press(button); await user.press(button);
    expect(screen.getByText(/Saving/)).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', ADULT)).toBeDisabled();
    expect(mockSave).toHaveBeenCalledTimes(1);
    await act(async () => {release(afterAge);});
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
  });

  it('does not expose an active consent control for a mismatched account', async () => {
    await renderWithTheme(<DebriefConsent userId="owner-b" access={off}/>);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
