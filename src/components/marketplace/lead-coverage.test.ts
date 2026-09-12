// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,test} from 'vitest';
import {LeadCoverage} from './lead-coverage';
import {createElement} from 'react';
afterEach(cleanup);
test('unknown service gives an actionable explanation',()=>{
  render(createElement(LeadCoverage,{coverage:{status:'uncovered',matchingBuyers:0,complete:true,reasons:['unknown_service']}}));
  expect(screen.getByText('Geen passende actieve afnemer')).toBeTruthy();
  expect(screen.getByText('Type werk ontbreekt; eerst vaststellen')).toBeTruthy();
});
test('partial coverage count is explicitly a minimum',()=>{
  render(createElement(LeadCoverage,{coverage:{status:'covered',matchingBuyers:1,complete:false,reasons:[]}}));
  expect(screen.getByText('Minimaal 1 passende actieve afnemer')).toBeTruthy();
});
test('incomplete zero and unavailable leads do not get a no-buyer warning',()=>{
  const {rerender}=render(createElement(LeadCoverage,{coverage:{status:'unknown',matchingBuyers:0,complete:false,reasons:[]}}));
  expect(screen.queryByText('Geen passende actieve afnemer')).toBeNull();
  rerender(createElement(LeadCoverage,{coverage:{status:'unavailable',matchingBuyers:0,complete:true,reasons:[]}}));
  expect(screen.getByText('Afnemerdekking: niet beschikbaar voor nieuwe kopers.')).toBeTruthy();
});
