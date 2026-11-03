// @vitest-environment jsdom
import {act,render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({fetchMailboxStatus:vi.fn(),sendMailboxCode:vi.fn(),verifyMailboxCode:vi.fn()}));
vi.mock('@eiyu/shared',()=>({...api,MAILBOX_MESSAGE:'Verify your email to access your weekly debrief.',formatError:(e:Error)=>e.message}));
import MailboxVerification from '../MailboxVerification';
afterEach(cleanup);

it('keeps passive export status separate from explicit completion across refreshes', async () => {
 const done=vi.fn();
 api.fetchMailboxStatus.mockResolvedValue({userId:'owner',version:1,verified:true});
 const view=render(<MailboxVerification userId="owner" purpose="account-export" onVerified={done}/>);
 await screen.findByRole('button',{name:'Send verification email'});
 expect(done).not.toHaveBeenCalled();
 api.fetchMailboxStatus.mockResolvedValue({userId:'owner',version:2,verified:true});
 view.rerender(<MailboxVerification userId="owner" purpose="account-export" refreshRevision={1} onVerified={done}/>);
 await waitFor(()=>expect(api.fetchMailboxStatus).toHaveBeenCalledTimes(2));
 expect(done).not.toHaveBeenCalled();
 await userEvent.setup().click(screen.getByRole('button',{name:'Check verification status'}));
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
});
it('preserves passive weekly-debrief completion',async()=>{
 const done=vi.fn();api.fetchMailboxStatus.mockResolvedValue({userId:'owner',version:1,verified:true});
 render(<MailboxVerification userId="owner" onVerified={done}/>);
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
});
it.each(['send','verify'] as const)('preserves explicit export %s completion',async action=>{
 const done=vi.fn(),user=userEvent.setup();
 render(<MailboxVerification userId="owner" purpose="account-export" onVerified={done}/>);
 const send=await screen.findByRole('button',{name:'Send verification email'});
 if(action==='send')api.fetchMailboxStatus.mockResolvedValue({userId:'owner',version:1,verified:true});
 await user.click(send);
 if(action==='verify'){
  await user.type(await screen.findByLabelText('Verification code'),'12345678');
  await user.click(screen.getByRole('button',{name:'Verify code'}));
 }
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
});
it('explains export proof without implying AI consent or a debrief age restriction',async()=>{
 render(<MailboxVerification userId="owner" purpose="account-export" onVerified={()=>{}}/>);
 expect(screen.getByText(/verify your email to download your account data/i)).toBeInTheDocument();
 expect(screen.queryByText(/weekly debrief/i)).not.toBeInTheDocument();
 await screen.findByRole('button',{name:'Send verification email'});
});
beforeEach(()=>{vi.clearAllMocks();api.fetchMailboxStatus.mockResolvedValue({userId:'owner',version:1,verified:false});api.sendMailboxCode.mockResolvedValue({challengeId:'challenge',retryAfter:60});api.verifyMailboxCode.mockResolvedValue({userId:'owner',version:1,verified:true});});
it('sends to current account without an email field and verifies code before retrying debrief',async()=>{
 const user=userEvent.setup(),done=vi.fn();render(<MailboxVerification userId="owner" onVerified={done}/>);
 await user.click(await screen.findByRole('button',{name:'Send verification email'}));
 await user.type(await screen.findByLabelText('Verification code'),'12345678');
 await user.click(screen.getByRole('button',{name:'Verify code'}));
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
 expect(api.sendMailboxCode).toHaveBeenCalledWith();expect(api.verifyMailboxCode).toHaveBeenCalledWith('challenge','12345678',{userId:'owner',version:1,verified:false});
 expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
});
it('preserves wrong-code draft, explains failure and enforces resend cooldown',async()=>{
 api.verifyMailboxCode.mockRejectedValue(new Error('That code could not be verified.'));
 const user=userEvent.setup(),done=vi.fn();render(<MailboxVerification userId="owner" onVerified={done}/>);
 await user.click(await screen.findByRole('button',{name:'Send verification email'}));
 await user.type(await screen.findByLabelText('Verification code'),'12345678');await user.click(screen.getByRole('button',{name:'Verify code'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('That code');expect(screen.getByLabelText('Verification code')).toHaveValue('12345678');
 expect(screen.getByRole('button',{name:/Resend in/})).toBeDisabled();expect(done).not.toHaveBeenCalled();
});
it('a fresh status check can unlock proof without resend; another owner cannot',async()=>{
 const user=userEvent.setup(),done=vi.fn();render(<MailboxVerification userId="owner" onVerified={done}/>);
 await screen.findByRole('button',{name:'Send verification email'});
 api.fetchMailboxStatus.mockResolvedValue({userId:'other',version:1,verified:true});await user.click(screen.getByRole('button',{name:'Check verification status'}));
 await screen.findByRole('alert');expect(done).not.toHaveBeenCalled();
 api.fetchMailboxStatus.mockResolvedValue({userId:'owner',version:1,verified:true});await user.click(screen.getByRole('button',{name:'Check verification status'}));
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
});

it.each(['status', 'send', 'verify'] as const)('ignores an old account’s pending %s response after switching accounts', async stage => {
 const user = userEvent.setup(), oldDone = vi.fn(), newDone = vi.fn();
 let finish!: (value: unknown) => void;
 const pending = new Promise(resolve => { finish = resolve; });
 if (stage === 'status') api.fetchMailboxStatus.mockReturnValueOnce(pending);
 if (stage === 'send') api.sendMailboxCode.mockReturnValueOnce(pending);
 if (stage === 'verify') api.verifyMailboxCode.mockReturnValueOnce(pending);
 const view = render(<MailboxVerification userId="owner" onVerified={oldDone}/>);
 if (stage !== 'status') {
  await user.click(await screen.findByRole('button', {name: 'Send verification email'}));
  if (stage === 'verify') {
   await user.type(await screen.findByLabelText('Verification code'), '12345678');
   await user.click(screen.getByRole('button', {name: 'Verify code'}));
   expect(api.verifyMailboxCode).toHaveBeenCalledTimes(1);
  } else expect(api.sendMailboxCode).toHaveBeenCalledTimes(1);
 }
 api.fetchMailboxStatus.mockResolvedValue({userId: 'other', version: 2, verified: false});
 view.rerender(<MailboxVerification userId="other" onVerified={newDone}/>);
 await screen.findByRole('button', {name: 'Send verification email'});
 await act(async () => { finish(stage === 'send' ? {challengeId: 'old-challenge', retryAfter: 60} : {userId: 'owner', version: 1, verified: true}); });
 expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
 expect(screen.getByRole('button', {name: 'Send verification email'})).toBeEnabled();
 expect(oldDone).not.toHaveBeenCalled(); expect(newDone).not.toHaveBeenCalled();
});

it('retries a failed delivery inline without losing the mailbox gate', async () => {
 api.sendMailboxCode.mockRejectedValueOnce(new Error('Email verification is temporarily unavailable.'));
 const user = userEvent.setup(), done = vi.fn();
 render(<MailboxVerification userId="owner" onVerified={done}/>);
 await user.click(await screen.findByRole('button', {name: 'Send verification email'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
 await user.click(screen.getByRole('button', {name: 'Send verification email'}));
 expect(await screen.findByLabelText('Verification code')).toBeEnabled();
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 expect(api.sendMailboxCode).toHaveBeenCalledTimes(2); expect(done).not.toHaveBeenCalled();
});
