import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';

vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
  const url=String(input);
  if(url.includes('/overview/today'))return new Response(JSON.stringify({data:{todayItems:[],pendingTasks:[],activeProjects:[],recentScripts:[],financeMonth:{incomeMinor:0,expenseMinor:0}}}),{headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({data:[]}),{headers:{'content-type':'application/json'}});
}));

describe('web shell',()=>{
  it('shows the fixed workspace navigation and warm overview',async()=>{
    const view=render(<App initialEntries={['/']} />);
    for(const label of ['今日','记账','稿件','日历','项目'])expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getAllByText('小单').length).toBeGreaterThan(0);
    expect(await screen.findByText('把今天过清楚')).toBeInTheDocument();
    expect(await screen.findByText('今天没有被塞满')).toBeInTheDocument();
    view.unmount();
  });
});
