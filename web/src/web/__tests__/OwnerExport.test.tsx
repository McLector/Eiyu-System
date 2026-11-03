// @vitest-environment jsdom
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({begin:vi.fn(),save:vi.fn()}));
vi.mock('@eiyu/shared',async importOriginal=>({...await importOriginal<typeof import('@eiyu/shared')>(),beginOwnerExport:api.begin}));
vi.mock('../../lib/save-owner-export',()=>({saveOwnerExport:api.save}));
vi.mock('../MailboxVerification',()=>({default:({onVerified}:{onVerified:()=>void})=><button onClick={onVerified}>Finish email check</button>}));
import {OwnerExportError} from '@eiyu/shared';
import OwnerExport from '../OwnerExport';
function operation(){return {document:{},current:vi.fn(()=>true),confirm:vi.fn(),dispose:vi.fn()};}
beforeEach(()=>{api.begin.mockReset().mockResolvedValue(operation());api.save.mockReset().mockResolvedValue('started');});
afterEach(cleanup);
it('shows the adopted contact for assisted export and manually reviewed deletion',()=>{
 render(<OwnerExport userId="owner-a"/>);expect(screen.getByRole('link',{name:'privacy@eiyusystem.app'})).toHaveAttribute('href','mailto:privacy@eiyusystem.app');
});
it('mounts with no request or automatic download and explains local pending work',()=>{
 render(<OwnerExport userId="owner-a"/>);expect(api.begin).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'Prepare data download'})).toBeEnabled();expect(screen.getByText(/pending offline actions/i)).toBeInTheDocument();
});
it('requires explicit preparation and a separate save action',async()=>{
 const op=operation();api.begin.mockResolvedValue(op);const user=userEvent.setup();render(<OwnerExport userId="owner-a"/>);
 await user.click(screen.getByRole('button',{name:'Prepare data download'}));await user.click(await screen.findByRole('button',{name:'Download JSON'}));
 await waitFor(()=>expect(api.save).toHaveBeenCalledWith(op));expect(await screen.findByText(/download started/i)).toBeInTheDocument();expect(op.dispose).toHaveBeenCalledTimes(1);
});
it('refuses duplicate preparation while a request is pending',async()=>{
 let resolve!:(value:ReturnType<typeof operation>)=>void;api.begin.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const user=userEvent.setup();render(<OwnerExport userId="owner-a"/>);await user.dblClick(screen.getByRole('button',{name:'Prepare data download'}));
 expect(api.begin).toHaveBeenCalledTimes(1);await act(async()=>resolve(operation()));
});
it('unmount aborts pending work and disposes a late operation',async()=>{
 let resolve!:(value:ReturnType<typeof operation>)=>void;api.begin.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const user=userEvent.setup(),view=render(<OwnerExport userId="owner-a"/>);await user.click(screen.getByRole('button',{name:'Prepare data download'}));
 const signal=api.begin.mock.calls[0][1].signal as AbortSignal;view.unmount();expect(signal.aborted).toBe(true);
 const late=operation();await act(async()=>resolve(late));expect(late.dispose).toHaveBeenCalledTimes(1);expect(api.save).not.toHaveBeenCalled();
});
it('owner changes discard held work across A→B→A',async()=>{
 let resolve!:(value:ReturnType<typeof operation>)=>void;api.begin.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const user=userEvent.setup(),view=render(<OwnerExport userId="owner-a"/>);await user.click(screen.getByRole('button',{name:'Prepare data download'}));
 view.rerender(<OwnerExport userId="owner-b"/>);view.rerender(<OwnerExport userId="owner-a"/>);
 const late=operation();await act(async()=>resolve(late));expect(late.dispose).toHaveBeenCalledTimes(1);expect(screen.queryByRole('button',{name:'Download JSON'})).not.toBeInTheDocument();
});
it('verification completion never automatically repeats the data request',async()=>{
 api.begin.mockRejectedValue(new OwnerExportError('verification'));const user=userEvent.setup();render(<OwnerExport userId="owner-a"/>);
 await user.click(screen.getByRole('button',{name:'Prepare data download'}));await user.click(await screen.findByRole('button',{name:'Finish email check'}));
 expect(api.begin).toHaveBeenCalledTimes(1);expect(api.save).not.toHaveBeenCalled();
});
it('save failure shows fixed copy and disposes the prepared document',async()=>{
 const op=operation();api.begin.mockResolvedValue(op);api.save.mockRejectedValue(new Error('PRIVATE_SYNTHETIC_SAVE_ERROR'));
 const user=userEvent.setup();render(<OwnerExport userId="owner-a"/>);await user.click(screen.getByRole('button',{name:'Prepare data download'}));
 await user.click(await screen.findByRole('button',{name:'Download JSON'}));expect((await screen.findByRole('alert')).textContent).not.toContain('PRIVATE_SYNTHETIC_SAVE_ERROR');expect(op.dispose).toHaveBeenCalledTimes(1);
});
