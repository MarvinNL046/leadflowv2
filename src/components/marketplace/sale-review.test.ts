// @vitest-environment jsdom
import {createElement} from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {SaleReview} from './sale-review';
import type {Id} from '../../../convex/_generated/dataModel';
const save=vi.hoisted(()=>vi.fn());vi.mock('convex/react',()=>({useMutation:()=>save}));
beforeEach(()=>{save.mockReset().mockResolvedValue(null);});afterEach(cleanup);
const props={leadId:'synthetic' as Id<'marketplaceLeads'>,action:'pause' as const,revision:0,latest:null};
test('pause requires a reason and explicit submit; cancel saves nothing',async()=>{
  const {container}=render(createElement(SaleReview,props));
  fireEvent.click(screen.getByRole('button',{name:'Tijdelijk uit verkoop'}));
  fireEvent.submit(container.querySelector('form')!);expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Annuleren'}));expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Tijdelijk uit verkoop'}));
  fireEvent.change(screen.getByLabelText('Reden voor deze verkoopwijziging'),{target:{value:'Actualiteit controleren.'}});
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(()=>expect(save).toHaveBeenCalledWith({leadId:props.leadId,action:'pause',expectedRevision:0,note:'Actualiteit controleren.',confirmedCurrent:false}));
});
test('resume requires explicit current-need confirmation',async()=>{
  const {container}=render(createElement(SaleReview,{...props,action:'resume',revision:1}));
  fireEvent.click(screen.getByRole('button',{name:'Na controle opnieuw aanbieden'}));
  fireEvent.change(screen.getByLabelText('Reden voor deze verkoopwijziging'),{target:{value:'Aanvraag is nog actueel.'}});
  fireEvent.submit(container.querySelector('form')!);expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({action:'resume',expectedRevision:1,confirmedCurrent:true})));
});
