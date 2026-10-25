import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverviewSection, RevenueSection, TodaySection, UsersSection } from '@/pages/admin/home/sections';
import { LineChart } from '@/pages/admin/home/charts';
import { adminDashboard } from './fixtures/admin-dashboard';

vi.unmock('react-router-dom');
afterEach(() => cleanup());
const card = (label: string) => screen.getByText(label, { exact: true }).closest('article') as HTMLElement;
const incomplete = () => {
  const data = adminDashboard(7);
  data.revenue.unknownUsdPayments = 2;
  data.revenue.recent[0].usd = null;
  data.kpis.find(item => item.kind === 'usd')!.previous = 50;
  return data;
};

describe('admin money evidence presentation', () => {
  it('shows the known subtotal while withholding an incomplete revenue comparison, sparkline and chart', () => {
    render(<MemoryRouter><OverviewSection data={incomplete()} /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('2 payment record(s)');
    const revenue = card('Recorded USD subtotal');
    expect(revenue).toHaveTextContent('$107.00');
    expect(revenue).not.toHaveTextContent(/vs previous|114%/);
    expect(revenue.querySelector('svg')).toBeNull();
    const revenueChart = screen.getByRole('heading', { name: 'Recorded USD per day' }).closest('section') as HTMLElement;
    expect(within(revenueChart).queryByRole('img')).not.toBeInTheDocument();
    expect(revenueChart).toHaveTextContent(/Chart unavailable.*incomplete/i);
    expect(card('New accounts')).toHaveTextContent('▲ 50%');
    expect(screen.getByRole('img', { name: /^New accounts per day:/ })).toBeInTheDocument();
  });

  it('withholds only the incomplete USD comparison on Today, keeping measured account comparisons', () => {
    render(<MemoryRouter><TodaySection data={incomplete()} /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent(/USD totals are incomplete/);
    const revenue = card('Recorded USD subtotal');
    expect(revenue).toHaveTextContent('$29.00');
    expect(revenue).not.toHaveTextContent(/yesterday|new|%/);
    expect(card('New accounts')).toHaveTextContent(/yesterday/);
    expect(card('New accounts')).toHaveTextContent('▲ 50%');
  });

  it('keeps paid counts and original-currency evidence while refusing an incomplete average order value', () => {
    const data = incomplete();
    render(<MemoryRouter><RevenueSection data={data} /></MemoryRouter>);
    expect(card('Avg order')).toHaveTextContent('Unknown');
    expect(card('Avg order')).not.toHaveTextContent('$26.75');
    expect(card('Recorded USD (all time)')).toHaveTextContent(/\$107\.00.*known net amounts only/);
    expect(card('Paying customers')).toHaveTextContent('3');
    expect(screen.getByText('₹2,499.00')).toBeInTheDocument();
    const payment = screen.getByRole('link', { name: 'payer@work.org' }).closest('tr') as HTMLElement;
    expect(within(payment).getByText('—', { exact: true })).toBeInTheDocument();
    expect(within(payment).getByText('$29.00', { exact: true })).toBeInTheDocument();
  });

  it('retains revenue comparisons, motion-free sparklines, the chart and the correct average when all amounts are known', () => {
    const data = adminDashboard(7);
    const view = render(<MemoryRouter><OverviewSection data={data} /></MemoryRouter>);
    expect(screen.queryByText(/USD totals are incomplete/)).not.toBeInTheDocument();
    expect(card('Recorded USD subtotal')).toHaveTextContent(/vs previous 7 days/);
    expect(card('Recorded USD subtotal').querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('img', { name: /^Recorded USD per day:/ })).toBeInTheDocument();
    view.rerender(<MemoryRouter><RevenueSection data={data} /></MemoryRouter>);
    expect(card('Avg order')).toHaveTextContent('$26.75');
  });

  it('keeps a historical payer with unknown USD in the paying-only filter even without a current plan', async () => {
    const data = incomplete();
    data.users[0] = { ...data.users[0], emailDisplay: 'historical-payer@example.org', paidUsd: 0, plan: null, hasPaid: true };
    data.users.push({ ...data.users[1], id: '00000000-0000-4000-8000-000000000013', emailDisplay: 'unpaid-plan@example.org', plan: 'Starter', hasPaid: false });
    render(<MemoryRouter><UsersSection data={data} /></MemoryRouter>);
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Paying customers only' }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('historical-payer@example.org')).toBeInTheDocument();
    expect(within(table).queryByText('free@mail.com')).not.toBeInTheDocument();
    expect(within(table).queryByText('unpaid-plan@example.org')).not.toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByRole('columnheader', { name: /Known USD/ })).toBeInTheDocument();
  });
});

describe('admin chart range changes', () => {
  it('drops an out-of-range hover after points shrink, then accepts a hover on the new range', () => {
    const view = render(<LineChart label="Accounts" points={[{ label: 'Oct 1', value: 10 }, { label: 'Oct 2', value: 20 }, { label: 'Oct 3', value: 70 }]} />);
    const oldTargets = screen.getByRole('img').querySelectorAll('rect');
    fireEvent.mouseEnter(oldTargets[2]);
    expect(view.container.querySelector('.vh-chart-tip')).toHaveTextContent('Oct 370');
    expect(() => view.rerender(<LineChart label="Accounts" points={[{ label: 'Oct 25', value: 7 }]} />)).not.toThrow();
    expect(view.container.querySelector('.vh-chart-tip')).toBeNull();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Accounts: Oct 25 7');
    fireEvent.mouseEnter(screen.getByRole('img').querySelector('rect')!);
    expect(view.container.querySelector('.vh-chart-tip')).toHaveTextContent('Oct 257');
  });

  it('handles hovered chart replacement with empty data and later restores a valid plotted range', () => {
    const view = render(<LineChart label="Accounts" points={[{ label: 'Oct 1', value: 1 }, { label: 'Oct 2', value: 2 }]} />);
    fireEvent.mouseEnter(screen.getByRole('img').querySelectorAll('rect')[1]);
    view.rerender(<LineChart label="Accounts" points={[]} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing recorded in this range yet.')).toBeInTheDocument();
    expect(() => view.rerender(<LineChart label="Accounts" points={[{ label: 'Oct 25', value: 3 }]} />)).not.toThrow();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Accounts: Oct 25 3');
  });
});
