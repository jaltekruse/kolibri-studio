import { fireEvent, render, screen, within } from '@testing-library/vue';
import PageTab from '../PageTab';
import { ContentKindsNames } from 'shared/leUtils/ContentKinds';
import { PAGE_MARKDOWN } from 'shared/utils/pages';

jest.mock('shared/views/TipTapEditor/TipTapEditor/TipTapEditor');

const PAGE_ID = 'page-id';

function renderTab(markdown) {
  const updateContentNode = jest.fn();
  const store = {
    modules: {
      contentNode: {
        namespaced: true,
        getters: {
          getContentNode: () => id => ({
            id,
            kind: ContentKindsNames.DOCUMENT,
            extra_fields: { [PAGE_MARKDOWN]: markdown },
          }),
        },
        actions: { updateContentNode },
      },
    },
  };
  const { container } = render(PageTab, { store, routes: [], props: { nodeId: PAGE_ID } });
  return { container, updateContentNode };
}

describe('PageTab', () => {
  it('saves what is written as the page content', async () => {
    const { container, updateContentNode } = renderTab('# Solving equations');

    await fireEvent.update(within(container).getByRole('textbox'), '# Solving inequalities');

    expect(updateContentNode).toHaveBeenCalledWith(expect.anything(), {
      id: PAGE_ID,
      extra_fields: { [PAGE_MARKDOWN]: '# Solving inequalities' },
      checkComplete: true,
    });
  });

  it('says when the page is empty', () => {
    renderTab('');

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('says nothing about a page with content', () => {
    renderTab('# Solving equations');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
