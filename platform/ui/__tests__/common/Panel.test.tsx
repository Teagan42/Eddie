import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Panel } from '../../src/common/Panel';

describe('Panel', () => {
  it('renders heading, description, and actions', () => {
    render(
      <Panel title="Example" description="An example panel" actions={<button type="button">Action</button>}>
        <p>Panel content</p>
      </Panel>,
    );

    expect(screen.getByRole('heading', { name: 'Example' })).toBeInTheDocument();
    expect(screen.getByText('An example panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    expect(screen.getByText('Panel content')).toBeInTheDocument();
  });

  it('omits the description section when not provided', () => {
    render(
      <Panel title="Example">
        <p>Panel content</p>
      </Panel>,
    );

    expect(screen.queryByText('An example panel')).not.toBeInTheDocument();
  });
});
