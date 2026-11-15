import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  SPAN_COLUMNS,
  SPAN_TO_EXISTING_SIZE,
  STATE_META,
  WidgetShell,
  type WidgetState,
} from '@/design/widget-shell/WidgetShell';
import { DonutBody } from '@/design/widget-shell/ExampleBodies';
import { MOCK_REVIEW_COUNTS } from '@/design/widget-shell/mock-data';
import DesignPreviewPage from '@/app/design-preview/page';

const STATES = Object.keys(STATE_META) as WidgetState[];

describe('WidgetShell (design mock)', () => {
  it('maps spans onto the 12-column grid and the existing WidgetSize contract', () => {
    expect(SPAN_COLUMNS).toEqual({ compact: 3, standard: 6, wide: 9, full: 12 });
    expect(SPAN_TO_EXISTING_SIZE).toEqual({
      compact: 'small',
      standard: 'medium',
      wide: 'large',
      full: 'full',
    });
  });

  it.each(STATES)('renders the %s state with a text label and a named region', (state) => {
    render(
      <WidgetShell id="t" title="Test widget" state={state} provenance="mocked" source="Test source">
        <p>body content</p>
      </WidgetShell>,
    );
    const section = screen.getByRole('region', { name: 'Test widget' });
    expect(
      within(section).getAllByText(STATE_META[state].label, { exact: false }).length,
    ).toBeGreaterThan(0);
    expect(within(section).getByText(/Source: Test source/)).toBeInTheDocument();
    expect(within(section).getByText('Mock data')).toBeInTheDocument();

    const showsContent = state === 'ready' || state === 'stale' || state === 'partial';
    expect(screen.queryByText('body content') !== null).toBe(showsContent);
    expect(section.getAttribute('aria-busy') === 'true').toBe(state === 'loading');
    expect(screen.queryByRole('status') !== null).toBe(state === 'stale' || state === 'partial');
  });

  it('never presents mock actions as working controls', () => {
    render(
      <WidgetShell id="a" title="Action widget" provenance="mocked" source="s" actionLabel="Open queue">
        <p>x</p>
      </WidgetShell>,
    );
    const button = screen.getByRole('button', { name: 'Open queue' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('gives the donut a text alternative with counts and denominator', () => {
    render(<DonutBody />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toContain(`${MOCK_REVIEW_COUNTS.denominator} items`);
    for (const p of MOCK_REVIEW_COUNTS.parts) {
      expect(img.getAttribute('aria-label')).toContain(`${p.label} ${p.count}`);
    }
    expect(screen.getByText('Show data table')).toBeInTheDocument();
    const total = MOCK_REVIEW_COUNTS.parts.reduce((n, p) => n + p.count, 0);
    expect(total).toBe(MOCK_REVIEW_COUNTS.denominator);
  });
});

describe('Design preview page', () => {
  it('discloses that it is a mock and lists every page in the matrix', () => {
    render(<DesignPreviewPage />);
    expect(screen.getByRole('note')).toHaveTextContent(/Design mock for review/);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Pages, primary actions/ });
    for (const page of ['Compare notes', 'Snapshot review', 'Review suggestions', 'Evaluations', 'Session activity', 'Models & data']) {
      expect(within(table).getByRole('rowheader', { name: page })).toBeInTheDocument();
    }
    const buttons = Array.from(document.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button).toBeDisabled();
    }
  });
});
