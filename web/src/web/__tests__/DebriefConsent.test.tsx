// @vitest-environment jsdom
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {ProcessingAccess} from '@eiyu/shared';

const shared = vi.hoisted(() => ({save: vi.fn(), read: vi.fn(), mailbox: vi.fn()}));
vi.mock('@eiyu/shared', async importOriginal => ({...await importOriginal<typeof import('@eiyu/shared')>(),
  setProcessingConsent: (...args: unknown[]) => shared.save(...args),
  fetchProcessingAccess: () => shared.read(),
  fetchMailboxStatus: () => shared.mailbox()}));
import {DebriefConsent} from '../DebriefConsent';

afterEach(cleanup);

const off: ProcessingAccess = {contractVersion: 1, userId: 'owner-a', ageVersion: 1,
  consentVersion: 1, authorityVersion: 0, mailboxVersion: 1, ageEligible: false,
  ageConsent: false, aiConsent: false, canReadDebrief: false, canGenerateDebrief: false,
  authorityState: 'not-required'};
const afterAge: ProcessingAccess = {...off, ageConsent: true, ageEligible: true, ageVersion: 2};
const afterAi: ProcessingAccess = {...afterAge, aiConsent: true, canReadDebrief: true, canGenerateDebrief: true, consentVersion: 2};
const adultOnly = afterAge;
const stale = () => Object.assign(new Error('Processing access changed. Refresh your choices.'), {code: 'EP002'});

const adultBox = () => screen.getByRole('checkbox', {name: /I'm 18 or older/i});
const aiBox = () => screen.getByRole('checkbox', {name: /Groq/});
const turnOn = () => screen.queryByRole('button', {name: 'Turn on'});

beforeEach(() => {
  shared.save.mockReset().mockImplementation(async (purpose: string) => purpose === 'age-screening' ? afterAge : afterAi);
  shared.read.mockReset().mockResolvedValue(adultOnly);
  shared.mailbox.mockReset().mockResolvedValue({userId: 'owner-a', version: 1, verified: true});
});

describe('the Turn on AI weekly review card', () => {
  it('shows the heading and two unticked boxes, one for 18+ and one for the AI agreement naming Groq', async () => {
    render(<DebriefConsent userId="owner-a" access={off}/>);
    expect(screen.getByRole('heading', {name: 'Turn on AI weekly review'})).toBeInTheDocument();
    expect(adultBox()).not.toBeChecked();
    expect(aiBox()).not.toBeChecked();
    expect(screen.getAllByText(/Groq/).length).toBeGreaterThan(0);
    expect(shared.save).not.toHaveBeenCalled();
  });

  it('hides Turn on until both boxes are ticked and the email is verified', async () => {
    const user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={off}/>);
    expect(turnOn()).not.toBeInTheDocument();
    await user.click(adultBox());
    expect(turnOn()).not.toBeInTheDocument();
    await user.click(aiBox());
    expect(await screen.findByRole('button', {name: 'Turn on'})).toBeEnabled();
  });

  it('keeps Turn on hidden when only the adult box is ticked, and says the AI box is still needed', async () => {
    const user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={off}/>);
    await user.click(adultBox());
    await screen.findByRole('checkbox', {name: /Groq/});
    await waitFor(() => expect(shared.mailbox).toHaveBeenCalled());
    expect(aiBox()).not.toBeChecked();
    expect(turnOn()).not.toBeInTheDocument();
  });

  it('keeps Turn on hidden when only the AI box is ticked', async () => {
    const user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={off}/>);
    await user.click(aiBox());
    await waitFor(() => expect(shared.mailbox).toHaveBeenCalled());
    expect(turnOn()).not.toBeInTheDocument();
  });

  it('saves the 18+ box first and the AI agreement second, using the access the first save returned', async () => {
    const changed = vi.fn(), user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await user.click(adultBox()); await user.click(aiBox());
    await user.click(await screen.findByRole('button', {name: 'Turn on'}));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(afterAi));
    expect(shared.save).toHaveBeenCalledTimes(2);
    expect(shared.save).toHaveBeenNthCalledWith(1, 'age-screening', true, '2026-11-08-adult-v1', off);
    expect(shared.save).toHaveBeenNthCalledWith(2, 'weekly-debrief', true, '2026-11-08-weekly-debrief-v2', afterAge);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('stops before the second save when the first one fails', async () => {
    shared.save.mockRejectedValueOnce(new Error('Synthetic offline'));
    const changed = vi.fn(), user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await user.click(adultBox()); await user.click(aiBox());
    await user.click(await screen.findByRole('button', {name: 'Turn on'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic offline');
    expect(shared.save).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
  });

  it('keeps the saved 18+ answer when the second save fails, so only the AI box remains', async () => {
    shared.save.mockReset().mockResolvedValueOnce(afterAge).mockRejectedValueOnce(new Error('Synthetic offline'));
    const changed = vi.fn(), user = userEvent.setup();
    const view = render(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await user.click(adultBox()); await user.click(aiBox());
    await user.click(await screen.findByRole('button', {name: 'Turn on'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic offline');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith(afterAge);
    view.rerender(<DebriefConsent userId="owner-a" access={afterAge} onChanged={changed}/>);
    expect(screen.queryByRole('checkbox', {name: /I'm 18 or older/i})).not.toBeInTheDocument();
    expect(aiBox()).toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent('Synthetic offline');
  });

  it('shows the refresh message and re-reads access when a save is stale (EP002)', async () => {
    shared.save.mockRejectedValueOnce(stale());
    shared.read.mockResolvedValue(adultOnly);
    const changed = vi.fn(), user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await user.click(adultBox()); await user.click(aiBox());
    await user.click(await screen.findByRole('button', {name: 'Turn on'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Processing access changed. Refresh your choices.');
    await waitFor(() => expect(changed).toHaveBeenCalledWith(adultOnly));
    expect(shared.read).toHaveBeenCalledTimes(1);
    expect(shared.save).toHaveBeenCalledTimes(1);
  });

  it('recognizes a stale save reported as a plain object, the way Supabase reports it', async () => {
    shared.save.mockRejectedValueOnce({message: 'Processing access changed. Refresh your choices.', code: 'EP002'});
    const changed = vi.fn(), user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await user.click(adultBox()); await user.click(aiBox());
    await user.click(await screen.findByRole('button', {name: 'Turn on'}));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(adultOnly));
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh your choices');
  });

  it('keeps the refresh message when re-reading access also fails', async () => {
    shared.save.mockRejectedValueOnce(stale());
    shared.read.mockRejectedValue(new Error('offline'));
    const changed = vi.fn(), user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await user.click(adultBox()); await user.click(aiBox());
    await user.click(await screen.findByRole('button', {name: 'Turn on'}));
    await waitFor(() => expect(shared.read).toHaveBeenCalled());
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh your choices');
    expect(changed).not.toHaveBeenCalled();
  });

  it('does not use a re-read that belongs to another account', async () => {
    shared.save.mockRejectedValueOnce(stale());
    shared.read.mockResolvedValue({...adultOnly, userId: 'owner-b'});
    const changed = vi.fn(), user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await user.click(adultBox()); await user.click(aiBox());
    await user.click(await screen.findByRole('button', {name: 'Turn on'}));
    await waitFor(() => expect(shared.read).toHaveBeenCalled());
    expect(changed).not.toHaveBeenCalled();
  });

  it('shows only the AI box when the 18+ box was already given, and makes a single save', async () => {
    const changed = vi.fn(), user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={adultOnly} onChanged={changed}/>);
    expect(screen.queryByRole('checkbox', {name: /I'm 18 or older/i})).not.toBeInTheDocument();
    await user.click(aiBox());
    await user.click(await screen.findByRole('button', {name: 'Turn on'}));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(afterAi));
    expect(shared.save).toHaveBeenCalledTimes(1);
    expect(shared.save).toHaveBeenCalledWith('weekly-debrief', true, '2026-11-08-weekly-debrief-v2', adultOnly);
  });

  it('has no birthday, teen, or review-request wording', () => {
    const {container} = render(<DebriefConsent userId="owner-a" access={off}/>);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/birthday/i);
    expect(text).not.toMatch(/teen/i);
    expect(text).not.toMatch(/needs review/i);
    expect(text).not.toMatch(/request(ed)? (a )?review|review request/i);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows one email verification box, and no Turn on, while the email is unverified', async () => {
    shared.mailbox.mockResolvedValue({userId: 'owner-a', version: 1, verified: false});
    const user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={off}/>);
    await user.click(adultBox()); await user.click(aiBox());
    expect(await screen.findAllByRole('button', {name: 'Send verification email'})).toHaveLength(1);
    expect(turnOn()).not.toBeInTheDocument();
  });

  it('offers Turn on once the email has been verified from inside the card', async () => {
    shared.mailbox.mockResolvedValue({userId: 'owner-a', version: 1, verified: false});
    const user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={off}/>);
    await user.click(adultBox()); await user.click(aiBox());
    await screen.findByRole('button', {name: 'Send verification email'});
    shared.mailbox.mockResolvedValue({userId: 'owner-a', version: 1, verified: true});
    await user.click(screen.getByRole('button', {name: 'Check verification status'}));
    expect(await screen.findByRole('button', {name: 'Turn on'})).toBeEnabled();
  });

  it('shows nothing when both boxes are already on, and a fresh unticked card after AI is turned off', async () => {
    const user = userEvent.setup();
    const view = render(<DebriefConsent userId="owner-a" access={off}/>);
    await user.click(adultBox()); await user.click(aiBox());
    view.rerender(<DebriefConsent userId="owner-a" access={afterAi}/>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    view.rerender(<DebriefConsent userId="owner-a" access={{...afterAi, aiConsent: false, canGenerateDebrief: false, consentVersion: 3}}/>);
    expect(screen.getByRole('heading', {name: 'Turn on AI weekly review'})).toBeInTheDocument();
    expect(aiBox()).not.toBeChecked();
    expect(turnOn()).not.toBeInTheDocument();
  });

  it('shows two unticked boxes again when both permissions are withdrawn', async () => {
    const user = userEvent.setup();
    const view = render(<DebriefConsent userId="owner-a" access={off}/>);
    await user.click(adultBox()); await user.click(aiBox());
    view.rerender(<DebriefConsent userId="owner-a" access={afterAi}/>);
    view.rerender(<DebriefConsent userId="owner-a" access={{...off, consentVersion: 4}}/>);
    expect(adultBox()).not.toBeChecked();
    expect(aiBox()).not.toBeChecked();
  });

  it('does not forward A consent after switching to B', async () => {
    let release!: (value: ProcessingAccess) => void;
    shared.save.mockReset().mockReturnValueOnce(new Promise(resolve => {release = resolve;}));
    const changed = vi.fn(), user = userEvent.setup();
    const view = render(<DebriefConsent userId="owner-a" access={off} onChanged={changed}/>);
    await user.click(adultBox()); await user.click(aiBox());
    await user.click(await screen.findByRole('button', {name: 'Turn on'}));
    view.rerender(<DebriefConsent userId="owner-b" access={{...off, userId: 'owner-b'}} onChanged={changed}/>);
    release(afterAge);
    await waitFor(() => expect(screen.getByRole('checkbox', {name: /I'm 18 or older/i})).toBeEnabled());
    expect(changed).not.toHaveBeenCalled();
    expect(shared.save).toHaveBeenCalledTimes(1);
  });

  it('finishes the AI save even if the card is replaced between the two saves', async () => {
    let release!: (value: ProcessingAccess) => void;
    shared.save.mockReset()
      .mockReturnValueOnce(new Promise(resolve => {release = resolve;}))
      .mockResolvedValueOnce(afterAi);
    const user = userEvent.setup();
    const view = render(<DebriefConsent userId="owner-a" access={off}/>);
    await user.click(adultBox()); await user.click(aiBox());
    await user.click(await screen.findByRole('button', {name: 'Turn on'}));
    view.unmount();
    release(afterAge);
    await waitFor(() => expect(shared.save).toHaveBeenCalledTimes(2));
    expect(shared.save).toHaveBeenNthCalledWith(2, 'weekly-debrief', true, '2026-11-08-weekly-debrief-v2', afterAge);
  });

  it('does not run a second Turn on while one is saving', async () => {
    let release!: (value: ProcessingAccess) => void;
    shared.save.mockReset().mockReturnValueOnce(new Promise(resolve => {release = resolve;})).mockResolvedValue(afterAi);
    const user = userEvent.setup();
    render(<DebriefConsent userId="owner-a" access={off}/>);
    await user.click(adultBox()); await user.click(aiBox());
    const button = await screen.findByRole('button', {name: 'Turn on'});
    await user.click(button); await user.click(button);
    expect(screen.getByRole('status')).toHaveTextContent(/Saving/);
    expect(adultBox()).toBeDisabled();
    expect(shared.save).toHaveBeenCalledTimes(1);
    release(afterAge);
    await waitFor(() => expect(shared.save).toHaveBeenCalledTimes(2));
  });

  it('rejects a mismatched account control', () => {
    render(<DebriefConsent userId="owner-b" access={off}/>);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(shared.save).not.toHaveBeenCalled();
  });
});
