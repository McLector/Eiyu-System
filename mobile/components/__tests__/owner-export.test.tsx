import {act,screen,userEvent,waitFor} from '@testing-library/react-native';
import {renderWithTheme,TestThemeProvider} from '../ui/test-theme';
import {OwnerExportError} from '@eiyu/shared';
import {OwnerExport} from '../eiyu/owner-export';
const mockBegin=jest.fn(),mockSave=jest.fn();
jest.mock('@eiyu/shared',()=>({...jest.requireActual('@eiyu/shared'),beginOwnerExport:(...args:unknown[])=>mockBegin(...args)}));
jest.mock('@/lib/save-owner-export',()=>({...jest.requireActual('@/lib/save-owner-export'),saveOwnerExport:(...args:unknown[])=>mockSave(...args)}));
jest.mock('../status/mailbox-verification',()=>({MailboxVerification:({onVerified}:{onVerified:()=>void})=>{
 const {Text,Pressable}=jest.requireActual('react-native');return <Pressable role="button" onPress={onVerified}><Text>Finish email check</Text></Pressable>;
}}));
function operation(){return {document:{},current:jest.fn(()=>true),confirm:jest.fn(),dispose:jest.fn()};}
beforeEach(()=>{jest.clearAllMocks();mockBegin.mockResolvedValue(operation());mockSave.mockResolvedValue('saved');});
it('shows the adopted contact for assisted export and manually reviewed deletion',async()=>{
 await renderWithTheme(<OwnerExport userId="owner-a"/>);expect(screen.getByText(/privacy@eiyusystem.app/)).toBeOnTheScreen();
});
it('mounts without preparing or saving and preserves pending-action context',async()=>{
 await renderWithTheme(<OwnerExport userId="owner-a"/>);expect(mockBegin).not.toHaveBeenCalled();expect(mockSave).not.toHaveBeenCalled();expect(screen.getByText(/pending offline actions/i)).toBeOnTheScreen();
});
it('requires a second explicit action to choose a folder and save',async()=>{
 const op=operation();mockBegin.mockResolvedValue(op);const user=userEvent.setup();await renderWithTheme(<OwnerExport userId="owner-a"/>);
 await user.press(screen.getByRole('button',{name:'Prepare data download'}));await user.press(await screen.findByRole('button',{name:'Choose folder and save'}));
 await waitFor(()=>expect(mockSave).toHaveBeenCalledWith(op));expect(await screen.findByText('Export saved.')).toBeOnTheScreen();expect(op.dispose).toHaveBeenCalledTimes(1);
});
it('unmount aborts a pending preparation and disposes a late result',async()=>{
 let resolve!:(value:ReturnType<typeof operation>)=>void;mockBegin.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const user=userEvent.setup();await renderWithTheme(<OwnerExport userId="owner-a"/>);await user.press(screen.getByRole('button',{name:'Prepare data download'}));
 const signal=mockBegin.mock.calls[0][1].signal as AbortSignal;await screen.unmount();expect(signal.aborted).toBe(true);
 const late=operation();await act(async()=>resolve(late));expect(late.dispose).toHaveBeenCalledTimes(1);expect(mockSave).not.toHaveBeenCalled();
});
it('changing owners never accepts a held old preparation',async()=>{
 let resolve!:(value:ReturnType<typeof operation>)=>void;mockBegin.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const user=userEvent.setup();await renderWithTheme(<OwnerExport userId="owner-a"/>);await user.press(screen.getByRole('button',{name:'Prepare data download'}));
 await screen.rerender(<TestThemeProvider><OwnerExport userId="owner-b"/></TestThemeProvider>);
 const late=operation();await act(async()=>resolve(late));expect(late.dispose).toHaveBeenCalledTimes(1);expect(screen.queryByRole('button',{name:'Choose folder and save'})).not.toBeOnTheScreen();
});
it('verification callback requires a new explicit request',async()=>{
 mockBegin.mockRejectedValue(new OwnerExportError('verification'));const user=userEvent.setup();await renderWithTheme(<OwnerExport userId="owner-a"/>);
 await user.press(screen.getByRole('button',{name:'Prepare data download'}));await user.press(await screen.findByRole('button',{name:'Finish email check'}));expect(mockBegin).toHaveBeenCalledTimes(1);expect(mockSave).not.toHaveBeenCalled();
});
it('picker cancellation is not reported as a successful saved file',async()=>{
 mockSave.mockResolvedValue('cancelled');const user=userEvent.setup();await renderWithTheme(<OwnerExport userId="owner-a"/>);
 await user.press(screen.getByRole('button',{name:'Prepare data download'}));await user.press(await screen.findByRole('button',{name:'Choose folder and save'}));
 expect(await screen.findByText('Save canceled.')).toBeOnTheScreen();expect(screen.queryByText('Export saved.')).not.toBeOnTheScreen();
});
it('unrecognized save failure never exposes its original message',async()=>{
 const op=operation();mockBegin.mockResolvedValue(op);mockSave.mockRejectedValue(new Error('PRIVATE_SYNTHETIC_FAILURE'));
 const user=userEvent.setup();await renderWithTheme(<OwnerExport userId="owner-a"/>);
 await user.press(screen.getByRole('button',{name:'Prepare data download'}));await user.press(await screen.findByRole('button',{name:'Choose folder and save'}));
 expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE_SYNTHETIC_FAILURE');expect(op.dispose).toHaveBeenCalledTimes(1);
});
