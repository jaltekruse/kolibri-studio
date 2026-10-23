import { render, screen } from '@testing-library/vue';
import { nextTick } from 'vue';
import VueRouter from 'vue-router';
import PerseusEditor from '../index.vue';
import { mountPerseusItem } from '../perseus';
import { perseusEditorStrings } from '../perseusEditorStrings';
import EditorImageProcessor from 'shared/views/TipTapEditor/TipTapEditor/services/imageService';

// jest.mock is hoisted above the imports. Perseus, a React app, is the boundary: the
// mock records what it is asked to show, and its last mount stands in for the author
// using the editor.
jest.mock('../perseus', () => ({
  migratePerseusItem: jest.fn(item => item),
  mountPerseusItem: jest.fn((element, props) => {
    const shown = {
      props,
      update: jest.fn(newProps => (shown.props = newProps)),
      unmount: jest.fn(),
    };
    return shown;
  }),
}));
// Uploading goes to Studio's storage
jest.mock('shared/views/TipTapEditor/TipTapEditor/services/imageService', () => ({
  processFile: jest.fn(),
}));
jest.mock('shared/urls', () => ({ perseus_preview: () => '/perseus-preview/' }));

const CHECKSUM = 'a'.repeat(32);

function rawData(content) {
  return JSON.stringify({ question: { content, images: {}, widgets: {} }, hints: [] });
}

async function renderEditor(props) {
  const utils = render(PerseusEditor, {
    props: { rawData: rawData('What is 2 + 2?'), itemId: 'item-1', mode: 'edit', ...props },
    routes: new VueRouter(),
  });
  // Perseus loads with a dynamic import
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
  return utils;
}

function shown() {
  return mountPerseusItem.mock.results.at(-1).value.props;
}

describe('PerseusEditor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mountPerseusItem.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("opens the item in the editor, previewing on Studio's preview page", async () => {
    await renderEditor();

    expect(shown()).toMatchObject({
      mode: 'edit',
      itemId: 'item-1',
      previewURL: '/perseus-preview/',
      item: { question: { content: 'What is 2 + 2?' } },
    });
  });

  it('saves edits once typing pauses, with images stored by checksum', async () => {
    const { emitted } = await renderEditor();
    const edited = {
      question: { content: `![](/content/storage/a/a/${CHECKSUM}.png)`, images: {}, widgets: {} },
      hints: [],
    };

    shown().onChange(edited);
    expect(emitted()['update:rawData']).toBeUndefined();
    jest.advanceTimersByTime(500);

    expect(emitted()['update:rawData']).toEqual([
      [rawData(`![](\${☣ CONTENTSTORAGE}/${CHECKSUM}.png)`)],
    ]);
  });

  it('saves an unsaved edit when closed', async () => {
    const { emitted, updateProps } = await renderEditor();

    shown().onChange({ question: { content: 'What is 3 + 1?' }, hints: [] });
    await updateProps({ mode: 'view' });

    expect(emitted()['update:rawData']).toHaveLength(1);
    expect(shown().mode).toBe('view');
  });

  it('keeps editing when its own save comes back', async () => {
    const { emitted, updateProps } = await renderEditor();
    shown().onChange({ question: { content: 'What is 3 + 1?' }, hints: [] });
    jest.advanceTimersByTime(500);
    const revision = shown().revision;

    shown().onChange({ question: { content: 'What is 3 + 2?' }, hints: [] });
    await updateProps({ rawData: emitted()['update:rawData'][0][0] });

    expect(shown().revision).toBe(revision);
  });

  it('starts again from an item changed elsewhere', async () => {
    const { updateProps } = await renderEditor();
    const revision = shown().revision;

    await updateProps({ rawData: rawData('What is 5 + 5?') });

    expect(shown().revision).toBe(revision + 1);
    expect(shown().item.question.content).toBe('What is 5 + 5?');
  });

  it('uploads an image the author adds, and gives the editor its address', async () => {
    await renderEditor();
    const src = `/content/storage/a/a/${CHECKSUM}.png`;
    EditorImageProcessor.processFile.mockResolvedValue({ src });
    const callback = jest.fn();

    shown().imageUploader(new File([''], 'graph.png'), callback);
    await nextTick();

    expect(callback).toHaveBeenCalledWith(src);
  });

  it('says when an image could not be uploaded', async () => {
    await renderEditor();
    EditorImageProcessor.processFile.mockRejectedValue(new Error('Too big'));

    shown().imageUploader(new File([''], 'graph.png'), jest.fn());
    await nextTick();
    await nextTick();

    expect(screen.getByRole('alert')).toHaveTextContent(
      perseusEditorStrings.imageUploadFailed$({ error: 'Too big' }),
    );
  });

  it('says when the item could not be read', async () => {
    await renderEditor({ rawData: 'not a Perseus item' });

    expect(screen.getByRole('alert')).toHaveTextContent(perseusEditorStrings.unreadableQuestion$());
    expect(mountPerseusItem).not.toHaveBeenCalled();
  });
});
