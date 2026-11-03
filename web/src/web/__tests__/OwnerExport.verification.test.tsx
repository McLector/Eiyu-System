// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({begin:vi.fn(),save:vi.fn()}));
vi.mock('@eiyu/shared',async importOriginal=>({...await importOriginal<typeof import('@eiyu/shared')>(),
 beginOwnerExport:api.begin,fetchMailboxStatus:async()=>({userId:'owner',version:1,verified:true})
}));
vi.mock('../../lib/save-owner-export',()=>({saveOwnerExport:api.save}));
import {OwnerExportError} from '@eiyu/shared';
import OwnerExport from '../OwnerExport';
afterEach(cleanup);
beforeEach(()=>{
 vi.clearAllMocks();
 api.begin.mockReset().mockResolvedValue({document:{},current:()=>true,confirm:vi.fn(),dispose:vi.fn()});
 api.save.mockReset().mockResolvedValue('started');
});

it.each(['prepare','save'] as const)('retains %s refusal until an explicit mailbox check, without automatic export retry',async stage=>{
 const user=userEvent.setup();
 if(stage==='prepare') api.begin.mockRejectedValue(new OwnerExportError('verification'));
 else api.save.mockRejectedValue(new OwnerExportError('verification'));
 render(<OwnerExport userId="owner"/>);
 await user.click(screen.getByRole('button',{name:'Prepare data download'}));
 if(stage==='save')await user.click(await screen.findByRole('button',{name:'Download JSON'}));
 await screen.findByRole('button',{name:'Send verification email'});
 expect(screen.getByRole('alert')).toHaveTextContent(/verification/i);
 expect(screen.queryByText(/Email checked/)).toBeNull();
 expect(api.begin).toHaveBeenCalledTimes(1);
 expect(api.save).toHaveBeenCalledTimes(stage==='save'?1:0);
 await user.click(screen.getByRole('button',{name:'Check verification status'}));
 await screen.findByText('Email checked. Prepare a new download when ready.');
 expect(screen.queryByRole('alert')).toBeNull();
 expect(api.begin).toHaveBeenCalledTimes(1);
 expect(api.save).toHaveBeenCalledTimes(stage==='save'?1:0);
});
