import {act,screen,userEvent,waitFor} from '@testing-library/react-native';
import {renderWithTheme,TestThemeProvider} from '../ui/test-theme';
import {MailboxVerification} from '../status/mailbox-verification';
const mockStatus=jest.fn(),mockSend=jest.fn(),mockVerify=jest.fn();

it('keeps passive export status separate from explicit completion across refreshes', async () => {
 const done=jest.fn();
 mockStatus.mockResolvedValue({userId:'owner',version:1,verified:true});
 const view=await renderWithTheme(<MailboxVerification userId="owner" purpose="account-export" onVerified={done}/>);
 await screen.findByRole('button',{name:'Send verification email'});
 expect(done).not.toHaveBeenCalled();
 mockStatus.mockResolvedValue({userId:'owner',version:2,verified:true});
 await view.rerender(<TestThemeProvider><MailboxVerification userId="owner" purpose="account-export" refreshRevision={1} onVerified={done}/></TestThemeProvider>);
 await waitFor(()=>expect(mockStatus).toHaveBeenCalledTimes(2));
 expect(done).not.toHaveBeenCalled();
 await userEvent.setup().press(screen.getByRole('button',{name:'Check verification status'}));
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
});
it('preserves passive weekly-debrief completion',async()=>{
 const done=jest.fn();mockStatus.mockResolvedValue({userId:'owner',version:1,verified:true});
 await renderWithTheme(<MailboxVerification userId="owner" onVerified={done}/>);
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
});
it.each(['send','verify'] as const)('preserves explicit export %s completion',async action=>{
 const done=jest.fn(),user=userEvent.setup();
 await renderWithTheme(<MailboxVerification userId="owner" purpose="account-export" onVerified={done}/>);
 const send=await screen.findByRole('button',{name:'Send verification email'});
 if(action==='send')mockStatus.mockResolvedValue({userId:'owner',version:1,verified:true});
 await user.press(send);
 if(action==='verify'){
  await user.type(await screen.findByLabelText('Verification code'),'12345678');
  await user.press(screen.getByRole('button',{name:'Verify code'}));
 }
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
});
it('explains export proof without implying AI consent or a debrief age restriction',async()=>{
 await renderWithTheme(<MailboxVerification userId="owner" purpose="account-export" onVerified={()=>{}}/>);
 expect(screen.getByText(/verify your email to download your account data/i)).toBeOnTheScreen();
 expect(screen.queryByText(/weekly debrief/i)).not.toBeOnTheScreen();
 await screen.findByRole('button',{name:'Send verification email'});
});
jest.mock('@eiyu/shared',()=>({...jest.requireActual('@eiyu/shared'),fetchMailboxStatus:(...args:unknown[])=>mockStatus(...args),sendMailboxCode:(...args:unknown[])=>mockSend(...args),verifyMailboxCode:(...args:unknown[])=>mockVerify(...args)}));
beforeEach(()=>{jest.clearAllMocks();mockStatus.mockResolvedValue({userId:'owner',version:1,verified:false});mockSend.mockResolvedValue({challengeId:'challenge',retryAfter:60});mockVerify.mockResolvedValue({userId:'owner',version:1,verified:true});});
it('sends then verifies a typed code without changing the quest session',async()=>{
 const user=userEvent.setup(),done=jest.fn();await renderWithTheme(<MailboxVerification userId="owner" onVerified={done}/>);
 await user.press(await screen.findByRole('button',{name:'Send verification email'}));
 await user.type(await screen.findByLabelText('Verification code'),'12345678');await user.press(screen.getByRole('button',{name:'Verify code'}));
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));expect(mockVerify).toHaveBeenCalledWith('challenge','12345678',{userId:'owner',version:1,verified:false});
});
it('wrong code leaves the draft editable and resend disabled during cooldown',async()=>{
 const user=userEvent.setup(),done=jest.fn();mockVerify.mockRejectedValue(new Error('That code could not be verified.'));
 await renderWithTheme(<MailboxVerification userId="owner" onVerified={done}/>);
 await user.press(await screen.findByRole('button',{name:'Send verification email'}));await user.type(await screen.findByLabelText('Verification code'),'12345678');await user.press(screen.getByRole('button',{name:'Verify code'}));
 expect(await screen.findByRole('alert')).toHaveTextContent(/That code/);expect(screen.getByLabelText('Verification code').props.value).toBe('12345678');
 expect(screen.getByRole('button',{name:/Resend in/})).toBeDisabled();expect(done).not.toHaveBeenCalled();
});

it.each(['status', 'send', 'verify'] as const)('ignores an old account’s pending %s response after switching accounts', async stage => {
 const user = userEvent.setup(), oldDone = jest.fn(), newDone = jest.fn();
 let finish!: (value: unknown) => void;
 const pending = new Promise(resolve => { finish = resolve; });
 if (stage === 'status') mockStatus.mockReturnValueOnce(pending);
 if (stage === 'send') mockSend.mockReturnValueOnce(pending);
 if (stage === 'verify') mockVerify.mockReturnValueOnce(pending);
 const view = await renderWithTheme(<MailboxVerification userId="owner" onVerified={oldDone}/>);
 if (stage !== 'status') {
  await user.press(await screen.findByRole('button', {name: 'Send verification email'}));
  if (stage === 'verify') {
   await user.type(await screen.findByLabelText('Verification code'), '12345678');
   await user.press(screen.getByRole('button', {name: 'Verify code'}));
   expect(mockVerify).toHaveBeenCalledTimes(1);
  } else expect(mockSend).toHaveBeenCalledTimes(1);
 }
 mockStatus.mockResolvedValue({userId: 'other', version: 2, verified: false});
 await view.rerender(<TestThemeProvider><MailboxVerification userId="other" onVerified={newDone}/></TestThemeProvider>);
 await screen.findByRole('button', {name: 'Send verification email'});
 await act(async () => { finish(stage === 'send' ? {challengeId: 'old-challenge', retryAfter: 60} : {userId: 'owner', version: 1, verified: true}); });
 expect(screen.queryByLabelText('Verification code')).toBeNull();
 expect(screen.getByRole('button', {name: 'Send verification email'})).toBeEnabled();
 expect(oldDone).not.toHaveBeenCalled(); expect(newDone).not.toHaveBeenCalled();
});

it('retries a failed delivery inline without losing the mailbox gate', async () => {
 mockSend.mockRejectedValueOnce(new Error('Email verification is temporarily unavailable.'));
 const user = userEvent.setup(), done = jest.fn();
 await renderWithTheme(<MailboxVerification userId="owner" onVerified={done}/>);
 await user.press(await screen.findByRole('button', {name: 'Send verification email'}));
 expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/);
 await user.press(screen.getByRole('button', {name: 'Send verification email'}));
 expect(await screen.findByLabelText('Verification code')).toBeEnabled();
 expect(screen.queryByRole('alert')).toBeNull();
 expect(mockSend).toHaveBeenCalledTimes(2); expect(done).not.toHaveBeenCalled();
});

// Bug 2 (live, web; same pattern here): a passive refresh must not discard a code request still in flight.
const SENT = {challengeId: 'challenge', retryAfter: 60};
async function startSend() {
 const user = userEvent.setup(); let finish!: (value: typeof SENT) => void;
 mockSend.mockReturnValueOnce(new Promise<typeof SENT>(resolve => { finish = resolve; }));
 const view = await renderWithTheme(<MailboxVerification userId="owner" onVerified={jest.fn()}/>);
 await user.press(await screen.findByRole('button', {name: 'Send verification email'}));
 await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
 return {view, finish: () => act(async () => { finish(SENT); })};
}
const refreshed = (n: number) => <TestThemeProvider><MailboxVerification userId="owner" refreshRevision={n} onVerified={jest.fn()}/></TestThemeProvider>;
it('keeps the code box when a passive refresh lands while the send is in flight', async () => {
 const {view, finish} = await startSend();
 await view.rerender(refreshed(1));
 await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(3));
 await finish();
 expect(await screen.findByLabelText('Verification code')).toBeEnabled();
 expect(screen.getByRole('button', {name: /Resend in/})).toBeDisabled();
 expect(screen.queryByRole('alert')).toBeNull();
});
it('stays busy through a passive refresh so a second send cannot start', async () => {
 const {view, finish} = await startSend();
 await view.rerender(refreshed(1));
 await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(3));
 expect(screen.getByRole('button', {name: 'Send verification email'})).toBeDisabled();
 expect(mockSend).toHaveBeenCalledTimes(1);
 await finish();
 await screen.findByLabelText('Verification code');
});
it('drops an in-flight send when the refresh shows the mailbox changed underneath it', async () => {
 const {view, finish} = await startSend();
 mockStatus.mockResolvedValue({userId: 'owner', version: 2, verified: false});
 await view.rerender(refreshed(1));
 await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(3));
 await finish();
 expect(screen.queryByLabelText('Verification code')).toBeNull();
});
