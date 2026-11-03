import {act, screen, userEvent, waitFor} from '@testing-library/react-native';
import {DELIVERED_REMINDER_NOTICE, TRACKER_PURPOSE_NOTICES, type TrackerAccess} from '@eiyu/shared';
import {renderWithTheme, TestThemeProvider} from '../ui/test-theme';
import {TrackerConsent} from '../status/tracker-consent';
import {noGrant, trackerAccess} from '../../test-support/tracker-fixtures';

const mockSave = jest.fn();
const mockKind = jest.fn();
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  setTrackerConsent: (...args: unknown[]) => mockSave(...args),
  trackerErrorKind: (error: unknown) => mockKind(error),
}));

const custom = TRACKER_PURPOSE_NOTICES['custom-tracker'];
const fitness = TRACKER_PURPOSE_NOTICES['fitness-tracking'];
beforeEach(() => { mockSave.mockReset(); mockKind.mockReset().mockReturnValue(null); });

const granted = (access: TrackerAccess, purpose: 'custom-tracker' | 'fitness-tracking'): TrackerAccess => ({
  ...access, revision: {...access.revision, consentVersion: access.revision.consentVersion + 1},
  ...(purpose === 'custom-tracker' ? {customConsent: true, canWriteCustom: true} : {fitnessConsent: true, canWriteFitness: true}),
});

describe('TrackerConsent in Profile', () => {
  it('shows an unchecked, purpose-specific choice and makes no call on mount', async () => {
    await renderWithTheme(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker"/>);
    expect(screen.getByRole('checkbox', {name: custom.label})).not.toBeChecked();
    expect(screen.getByText(custom.body)).toBeOnTheScreen();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('grants one purpose with its notice version and a copy of the captured revision', async () => {
    const access = noGrant(); const next = granted(access, 'fitness-tracking'); mockSave.mockResolvedValue(next);
    const changed = jest.fn(); const user = userEvent.setup();
    await renderWithTheme(<TrackerConsent userId="owner-a" access={access} purpose="fitness-tracking" onChanged={changed}/>);
    await user.press(screen.getByRole('checkbox', {name: fitness.label}));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(next));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith('fitness-tracking', true, fitness.version, access.revision);
    expect(mockSave.mock.calls[0][3]).not.toBe(access.revision);
  });

  it('keeps the two purposes independent', async () => {
    const access = trackerAccess({fitnessConsent: false, canWriteFitness: false});
    mockSave.mockResolvedValue(granted(access, 'fitness-tracking')); const user = userEvent.setup();
    await renderWithTheme(<><TrackerConsent userId="owner-a" access={access} purpose="custom-tracker"/>
      <TrackerConsent userId="owner-a" access={access} purpose="fitness-tracking"/></>);
    expect(screen.getByRole('checkbox', {name: custom.label})).toBeChecked();
    expect(screen.getByRole('checkbox', {name: fitness.label})).not.toBeChecked();
    await user.press(screen.getByRole('checkbox', {name: fitness.label}));
    expect(mockSave).toHaveBeenCalledWith('fitness-tracking', true, fitness.version, access.revision);
    expect(mockSave).not.toHaveBeenCalledWith('custom-tracker', expect.anything(), expect.anything(), expect.anything());
  });

  it('withdraws one purpose, even after authority was revoked', async () => {
    const access = trackerAccess({customAuthorityState: 'revoked', canWriteCustom: false});
    mockSave.mockResolvedValue({...access, customConsent: false}); const user = userEvent.setup();
    await renderWithTheme(<TrackerConsent userId="owner-a" access={access} purpose="custom-tracker"/>);
    const box = screen.getByRole('checkbox', {name: custom.label});
    expect(box).toBeEnabled();
    await user.press(box);
    expect(mockSave).toHaveBeenCalledWith('custom-tracker', false, custom.version, access.revision);
  });

  it.each([
    ['pending authority', {customAuthorityState: 'pending' as const}],
    ['revoked authority', {customAuthorityState: 'revoked' as const}],
    ['paused tracker writes', {canWriteBasic: false}],
  ])('does not grant while %s', async (_name, over) => {
    await renderWithTheme(<TrackerConsent userId="owner-a" access={{...noGrant(), ...over}} purpose="custom-tracker"/>);
    expect(screen.getByRole('checkbox', {name: custom.label})).toBeDisabled();
    expect(screen.getByText(/needs review|paused/i)).toBeOnTheScreen();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('does not show a failed save as accepted', async () => {
    mockSave.mockRejectedValue(new Error('Synthetic offline')); const changed = jest.fn(); const user = userEvent.setup();
    await renderWithTheme(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker" onChanged={changed}/>);
    await user.press(screen.getByRole('checkbox', {name: custom.label}));
    expect(await screen.findByText('Synthetic offline')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', {name: custom.label})).not.toBeChecked();
    expect(changed).not.toHaveBeenCalled();
  });

  it('on a stale revision keeps the old choice, asks for a refresh and does not retry', async () => {
    mockSave.mockRejectedValue(Object.assign(new Error('stale'), {code: 'ET003'})); mockKind.mockReturnValue('access-changed');
    const stale = jest.fn(); const changed = jest.fn(); const user = userEvent.setup();
    await renderWithTheme(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker" onChanged={changed} onStale={stale}/>);
    await user.press(screen.getByRole('checkbox', {name: custom.label}));
    expect(await screen.findByText(/changed/i)).toBeOnTheScreen();
    expect(stale).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
  });

  it('does not forward an A result after switching to B', async () => {
    let release!: (value: TrackerAccess) => void;
    mockSave.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const changed = jest.fn(); const user = userEvent.setup();
    await renderWithTheme(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker" onChanged={changed}/>);
    await user.press(screen.getByRole('checkbox', {name: custom.label}));
    await screen.rerender(<TestThemeProvider><TrackerConsent userId="owner-b" access={noGrant('owner-b')} purpose="custom-tracker" onChanged={changed}/></TestThemeProvider>);
    await act(async () => { release(granted(noGrant(), 'custom-tracker')); });
    await waitFor(() => expect(screen.getByRole('checkbox', {name: custom.label})).toBeEnabled());
    expect(changed).not.toHaveBeenCalled();
  });

  it('rejects a capability that belongs to another account', async () => {
    await renderWithTheme(<TrackerConsent userId="owner-b" access={noGrant()} purpose="custom-tracker"/>);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(/unavailable for this account/i)).toBeOnTheScreen();
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('TrackerConsent in an editor prompt', () => {
  it('asks before saving, and declining sends nothing', async () => {
    const decline = jest.fn(); const user = userEvent.setup();
    await renderWithTheme(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker" mode="prompt" onDecline={decline} declineLabel="Use basic tracking"/>);
    expect(screen.getByText(custom.body)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', {name: 'Use basic tracking'}));
    expect(decline).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('records a grant only after the explicit agree button', async () => {
    const access = noGrant(); const next = granted(access, 'custom-tracker'); mockSave.mockResolvedValue(next);
    const changed = jest.fn(); const user = userEvent.setup();
    await renderWithTheme(<TrackerConsent userId="owner-a" access={access} purpose="custom-tracker" mode="prompt" onChanged={changed} onDecline={jest.fn()} declineLabel="Use basic tracking"/>);
    expect(mockSave).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', {name: custom.label}));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(next));
    expect(mockSave).toHaveBeenCalledWith('custom-tracker', true, custom.version, access.revision);
  });
});

describe('TrackerConsent after withdrawing', () => {
  const withdrawn = (access: TrackerAccess): TrackerAccess => ({
    ...access, customConsent: false, canWriteCustom: false, fitnessConsent: false, canWriteFitness: false,
    revision: {...access.revision, consentVersion: access.revision.consentVersion + 1},
  });
  it('says reminders already delivered stay on the device once custom permission is withdrawn', async () => {
    const access = trackerAccess();
    mockSave.mockResolvedValue(withdrawn(access));
    const user = userEvent.setup();
    await renderWithTheme(<TrackerConsent userId="owner-a" access={access} purpose="custom-tracker"/>);
    expect(screen.queryByText(DELIVERED_REMINDER_NOTICE)).not.toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', {name: custom.label}));
    expect(await screen.findByText(DELIVERED_REMINDER_NOTICE)).toBeOnTheScreen();
  });
  it('does not say so when the withdrawal failed', async () => {
    mockSave.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    await renderWithTheme(<TrackerConsent userId="owner-a" access={trackerAccess()} purpose="custom-tracker"/>);
    await user.press(screen.getByRole('checkbox', {name: custom.label}));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('checkbox', {name: custom.label})).toBeEnabled());
    expect(screen.queryByText(DELIVERED_REMINDER_NOTICE)).not.toBeOnTheScreen();
  });
  it('does not say so for a grant, or for fitness, which has no reminders', async () => {
    const access = noGrant();
    mockSave.mockResolvedValue(granted(access, 'custom-tracker'));
    const user = userEvent.setup();
    await renderWithTheme(<TrackerConsent userId="owner-a" access={access} purpose="custom-tracker"/>);
    await user.press(screen.getByRole('checkbox', {name: custom.label}));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(screen.queryByText(DELIVERED_REMINDER_NOTICE)).not.toBeOnTheScreen();
    await act(async () => { await screen.unmount(); });
    const had = trackerAccess();
    mockSave.mockReset().mockResolvedValue(withdrawn(had));
    await renderWithTheme(<TrackerConsent userId="owner-a" access={had} purpose="fitness-tracking"/>);
    await user.press(screen.getByRole('checkbox', {name: fitness.label}));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(screen.queryByText(DELIVERED_REMINDER_NOTICE)).not.toBeOnTheScreen();
  });
});

describe('TrackerConsent age-appropriate text', () => {
  const cases = [['custom-tracker', custom], ['fitness-tracking', fitness]] as const;
  it.each(cases)('shows the shared 12-17 explanation for a teen (%s) and not the adult text', async (purpose, notice) => {
    await renderWithTheme(<TrackerConsent userId="owner-a" access={noGrant()} purpose={purpose} audience="teen"/>);
    expect(screen.getByText(notice.childBody)).toBeOnTheScreen();
    expect(screen.queryByText(notice.body)).not.toBeOnTheScreen();
  });
  it.each(cases)('shows the adult text for an adult (%s)', async (purpose, notice) => {
    await renderWithTheme(<TrackerConsent userId="owner-a" access={noGrant()} purpose={purpose} audience="adult"/>);
    expect(screen.getByText(notice.body)).toBeOnTheScreen();
    expect(screen.queryByText(notice.childBody)).not.toBeOnTheScreen();
  });
  it.each(cases)('shows the adult text when the age is unknown (%s)', async (purpose, notice) => {
    await renderWithTheme(<TrackerConsent userId="owner-a" access={noGrant()} purpose={purpose}/>);
    expect(screen.getByText(notice.body)).toBeOnTheScreen();
    expect(screen.queryByText(notice.childBody)).not.toBeOnTheScreen();
  });
  it('uses the teen text in the editor prompt too, and keeps the same notice version', async () => {
    const access = noGrant(); mockSave.mockResolvedValue(granted(access, 'custom-tracker')); const user = userEvent.setup();
    await renderWithTheme(<TrackerConsent userId="owner-a" access={access} purpose="custom-tracker" mode="prompt" audience="teen"/>);
    expect(screen.getByText(custom.childBody)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', {name: custom.label}));
    expect(mockSave).toHaveBeenCalledWith('custom-tracker', true, custom.version, access.revision);
  });
});
