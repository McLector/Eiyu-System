import {screen,userEvent} from '@testing-library/react-native';
import {renderWithTheme} from '../ui/test-theme';
import {OwnerExportError} from '@eiyu/shared';
import {OwnerExport} from '../eiyu/owner-export';
const mockBegin=jest.fn(),mockSave=jest.fn();
jest.mock('@eiyu/shared',()=>({...jest.requireActual('@eiyu/shared'),
 beginOwnerExport:(...args:unknown[])=>mockBegin(...args),
 fetchMailboxStatus:async()=>({userId:'owner',version:1,verified:true})
}));
jest.mock('@/lib/save-owner-export',()=>({saveOwnerExport:(...args:unknown[])=>mockSave(...args)}));
beforeEach(()=>{
 jest.clearAllMocks();
 mockBegin.mockReset().mockResolvedValue({document:{},current:()=>true,confirm:jest.fn(),dispose:jest.fn()});
 mockSave.mockReset().mockResolvedValue('saved');
});

it.each(['prepare','save'] as const)('retains %s refusal until an explicit mailbox check, without automatic export retry',async stage=>{
 const user=userEvent.setup();
 if(stage==='prepare') mockBegin.mockRejectedValue(new OwnerExportError('verification'));
 else mockSave.mockRejectedValue(new OwnerExportError('verification'));
 await renderWithTheme(<OwnerExport userId="owner"/>);
 await user.press(screen.getByRole('button',{name:'Prepare data download'}));
 if(stage==='save')await user.press(await screen.findByRole('button',{name:'Choose folder and save'}));
 await screen.findByRole('button',{name:'Send verification email'});
 expect(screen.getByRole('alert')).toHaveTextContent(/verification/i);
 expect(screen.queryByText(/Email checked/)).toBeNull();
 expect(mockBegin).toHaveBeenCalledTimes(1);
 expect(mockSave).toHaveBeenCalledTimes(stage==='save'?1:0);
 await user.press(screen.getByRole('button',{name:'Check verification status'}));
 await screen.findByText('Email checked. Prepare a new download when ready.');
 expect(screen.queryByRole('alert')).toBeNull();
 expect(mockBegin).toHaveBeenCalledTimes(1);
 expect(mockSave).toHaveBeenCalledTimes(stage==='save'?1:0);
});
