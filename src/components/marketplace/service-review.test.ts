// @vitest-environment jsdom
import {createElement} from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {ServiceReview} from './service-review';
import type {Id} from '../../../convex/_generated/dataModel';
const save=vi.hoisted(()=>vi.fn());
vi.mock('convex/react',()=>({useMutation:()=>save}));
beforeEach(()=>{save.mockReset().mockResolvedValue(null);});afterEach(cleanup);
const props={leadId:'synthetic' as Id<'marketplaceLeads'>,current:null,revision:0,canEdit:true,latest:null};
test('review requires a note and explicit save; cancel sends nothing',async()=>{
  const {container}=render(createElement(ServiceReview,props));
  fireEvent.click(screen.getByRole('button',{name:'Type werk controleren'}));
  fireEvent.change(screen.getByLabelText('Type werk'),{target:{value:'install'}});
  expect(save).not.toHaveBeenCalled();
  fireEvent.submit(container.querySelector('form')!);
  expect(screen.getByRole('alert')).toBeTruthy();expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Toelichting op de controle'),{target:{value:'Volgens omschrijving installatie.'}});
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(()=>expect(save).toHaveBeenCalledWith({leadId:props.leadId,serviceType:'install',expectedServiceType:null,expectedRevision:0,note:'Volgens omschrijving installatie.'}));
});
test('cancel and purchased lead do not expose a save action',()=>{
  const {rerender}=render(createElement(ServiceReview,props));
  fireEvent.click(screen.getByRole('button',{name:'Type werk controleren'}));
  fireEvent.click(screen.getByRole('button',{name:'Annuleren'}));
  expect(save).not.toHaveBeenCalled();
  rerender(createElement(ServiceReview,{...props,canEdit:false}));
  expect(screen.queryByRole('button',{name:'Type werk controleren'})).toBeNull();
});
test('failed saving preserves entered review for correction',async()=>{
  save.mockRejectedValue(new Error('offline'));
  const {container}=render(createElement(ServiceReview,props));
  fireEvent.click(screen.getByRole('button',{name:'Type werk controleren'}));
  fireEvent.change(screen.getByLabelText('Toelichting op de controle'),{target:{value:'Nog onbekend na controle.'}});
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());
  expect((screen.getByLabelText('Toelichting op de controle') as HTMLTextAreaElement).value).toBe('Nog onbekend na controle.');
});
test('live updates do not silently replace the revision being reviewed',async()=>{
  const {container,rerender}=render(createElement(ServiceReview,props));
  fireEvent.click(screen.getByRole('button',{name:'Type werk controleren'}));
  fireEvent.change(screen.getByLabelText('Type werk'),{target:{value:'install'}});
  fireEvent.change(screen.getByLabelText('Toelichting op de controle'),{target:{value:'Mijn controle van het type werk.'}});
  rerender(createElement(ServiceReview,{...props,current:'repair',revision:1}));
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({expectedServiceType:null,expectedRevision:0,serviceType:'install'})));
});
