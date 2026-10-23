/**
 * Renders a Perseus item with React, in a Vue component's element: Khan
 * Academy's editor to edit it, or Perseus's renderer to show it. Loaded only when
 * a Perseus question is shown, as Perseus is large.
 */
import '@khanacademy/perseus-editor/styles.css';
import { createElement, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ServerItemRenderer, Widgets } from '@khanacademy/perseus';
import { EditorPage } from '@khanacademy/perseus-editor';
import {
  CoreWidgetRegistry,
  isFailure,
  parseAndMigratePerseusItem,
} from '@khanacademy/perseus-core';
import { dependencies, initPerseus, withPerseusContext } from './dependencies';

const EDITED_PARTS = ['question', 'answerArea', 'hints'];

// A widget in a question's text, as [[☃ numeric-input 1]]
const WIDGET_PLACEHOLDER = /\[\[\u2603 (([a-z-]+) \d+)\]\]/g;

/**
 * The editor gives a widget its settings when it is added from the editor's menu, and
 * breaks on a widget typed into the text, which has none. Give those the settings the
 * menu would.
 * @param {object} renderer - A question or hint
 * @returns {object} The question or hint, with settings for each of its widgets
 */
function withTypedWidgets(renderer) {
  const widgets = { ...renderer.widgets };
  for (const [, id, type] of (renderer.content || '').matchAll(WIDGET_PLACEHOLDER)) {
    const editor = Widgets.getEditor(type);
    if (!widgets[id] && editor) {
      widgets[id] = {
        type,
        options: editor.initializeWidgetOptions?.({ selectedText: '' }) || editor.defaultProps,
        version: CoreWidgetRegistry.getCurrentVersion(type),
      };
    }
  }
  return { ...renderer, widgets };
}

function withAllTypedWidgets(item) {
  return {
    ...item,
    question: withTypedWidgets(item.question),
    hints: item.hints.map(withTypedWidgets),
  };
}

function ItemEditor({ item, itemId, previewURL, imageUploader, onChange }) {
  const [previewDevice, setPreviewDevice] = useState('desktop');
  // The editor reports each change to one part of the item, and shows what it is given
  const [edited, setEdited] = useState(() => withAllTypedWidgets(item));
  const latest = useRef(edited);

  function handleChange(changes) {
    const parts = Object.fromEntries(
      EDITED_PARTS.filter(part => changes[part] !== undefined).map(part => [part, changes[part]]),
    );
    latest.current = withAllTypedWidgets({ ...latest.current, ...parts });
    setEdited(latest.current);
    onChange(latest.current);
  }

  return createElement(EditorPage, {
    itemId,
    question: edited.question,
    answerArea: edited.answerArea,
    hints: edited.hints,
    apiOptions: { isMobile: false },
    dependencies,
    developerMode: false,
    jsonMode: false,
    imageUploader,
    previewURL,
    previewDevice,
    onPreviewDeviceChange: setPreviewDevice,
    onChange: handleChange,
  });
}

function ItemView({ item, showAnswers }) {
  return createElement(
    'div',
    { className: 'framework-perseus' },
    createElement(ServerItemRenderer, {
      item,
      problemNum: 0,
      reviewMode: showAnswers,
      showSolutions: showAnswers ? 'all' : 'none',
      hintsVisible: showAnswers ? item.hints.length : 0,
      apiOptions: { isMobile: false, readOnly: true },
      dependencies,
      keypadElement: null,
    }),
  );
}

/**
 * The item, migrated to the format this version of Perseus edits.
 * @param {object} item - A Perseus item, in any format Perseus has used
 * @returns {object} The migrated item
 * @throws {Error} When it is not a Perseus item
 */
export function migratePerseusItem(item) {
  const result = parseAndMigratePerseusItem(item);
  if (isFailure(result)) {
    throw new Error(result.detail.message);
  }
  return result.value;
}

/**
 * Show a Perseus item in an element.
 * @param {HTMLElement} element - Where to show it
 * @param {object} props - What to show
 * @param {string} props.mode - 'edit' to edit it, 'view' to show it
 * @param {object} props.item - The Perseus item, migrated
 * @param {number} props.revision - Changed when the item is replaced, rather than edited here
 * @param {string} props.itemId - Its assessment item's id
 * @param {boolean} props.showAnswers - In view mode, whether to show answers and hints
 * @param {string} props.previewURL - The page the editor previews the item in
 * @param {Function} props.imageUploader - Uploads an image the author adds
 * @param {Function} props.onChange - Called with the item after each edit
 * @returns {{update: Function, unmount: Function}} Re-renders with new props, or removes it
 */
export function mountPerseusItem(element, props) {
  initPerseus();
  const root = createRoot(element);
  function render({ mode, revision, ...rest }) {
    // Keyed so the editor starts again from the item when reopened, or when the
    // item is replaced
    root.render(
      withPerseusContext(
        createElement(mode === 'edit' ? ItemEditor : ItemView, {
          key: `${mode}-${revision}`,
          ...rest,
        }),
      ),
    );
  }
  render(props);
  return {
    update: render,
    unmount: () => root.unmount(),
  };
}
