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

function viewItem(question) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  let shown;
  act(() => {
    shown = mountPerseusItem(element, {
      mode: 'view',
      revision: 1,
      item: migratePerseusItem({ question, answerArea: {}, hints: [] }),
      itemId: 'item-1',
      showAnswers: false,
    });
  });
  return shown;
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

  describe('with a graphie imported with the question', () => {
    const LABELS = {
      range: [
        [0, 10],
        [0, 10],
      ],
      labels: [{ content: 'Label A', coordinates: [5, 5], typesetAsMath: false }],
    };

    const { Image } = window;

    beforeEach(() => {
      global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify(LABELS) }));
      // jsdom loads no images; these load as soon as they are given a source
      window.Image = class {
        set src(src) {
          Promise.resolve().then(() => this.onload?.());
        }
      };
    });

    afterEach(() => {
      delete global.fetch;
      window.Image = Image;
    });

    it('loads its picture and labels from Studio', async () => {
      const shown = viewItem({
        content: '[[☃ image 1]]',
        images: {},
        widgets: {
          'image 1': {
            type: 'image',
            options: {
              alt: 'A graph',
              backgroundImage: {
                url: 'web+graphie:${☣ CONTENTSTORAGE}/abc123',
                width: 300,
                height: 300,
              },
            },
          },
        },
      });
      for (let tick = 0; tick < 5; tick++) {
        await act(async () => {
          jest.runOnlyPendingTimers();
          await Promise.resolve();
        });
      }

      expect(global.fetch).toHaveBeenCalledWith('/perseus-graphie/abc123-data.json');
      expect(screen.getByRole('img', { name: 'A graph' })).toHaveAttribute(
        'src',
        '/perseus-graphie/abc123.svg',
      );
      expect(screen.getByText('Label A')).toBeInTheDocument();
      act(() => shown.unmount());
    });
  });
});
