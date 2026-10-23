import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import PreviewPage from 'shared/views/PerseusEditor/perseus/PreviewPage';
import { initPerseus, withPerseusContext } from 'shared/views/PerseusEditor/perseus/dependencies';

initPerseus();
createRoot(document.getElementById('perseus-preview')).render(
  withPerseusContext(createElement(PreviewPage)),
);
