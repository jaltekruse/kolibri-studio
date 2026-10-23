import { act } from 'react-dom/test-utils';
import { screen } from '@testing-library/vue';
import { mountPerseusItem, migratePerseusItem } from '../perseus';

// Khan Academy's editor itself, in jsdom
function editItem(content) {
  const item = migratePerseusItem({
    question: { content, images: {}, widgets: {} },
    answerArea: {},
    hints: [],
  });
  const element = document.createElement('div');
  document.body.appendChild(element);
  const onChange = jest.fn();
  let shown;
  act(() => {
    shown = mountPerseusItem(element, {
      mode: 'edit',
      revision: 1,
      item,
      itemId: 'item-1',
      showAnswers: false,
      previewURL: '/perseus-preview/',
      imageUploader: jest.fn(),
      onChange,
    });
  });
  return { shown, onChange };
}

describe('Perseus editor', () => {
  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('gives a widget typed into the question the settings its editor needs', () => {
    const { shown } = editItem('What is 2 + 3? [[☃ numeric-input 1]]');

    // After rendering, the editor updates its preview from every widget's settings,
    // which throws for a widget that has none
    expect(() => act(() => jest.runOnlyPendingTimers())).not.toThrow();
    expect(screen.getByPlaceholderText('answer')).toBeInTheDocument();
    act(() => shown.unmount());
  });
});
