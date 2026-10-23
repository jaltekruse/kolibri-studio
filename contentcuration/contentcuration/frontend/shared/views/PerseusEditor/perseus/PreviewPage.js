/**
 * The page Khan Academy's editor shows its previews in. The editor frames it,
 * puts what to show in its own window.iframeDataStore, and posts the frame its id,
 * so the page has to be on Studio's own origin to read it. Adapted from Perseus's
 * ExercisePreviewPage and PreviewRenderer (MIT License, https://github.com/Khan/perseus).
 */
import { createElement, useContext, useEffect, useRef, useState } from 'react';
import { KeypadContext, StatefulKeypadContextProvider } from '@khanacademy/keypad-context';
import { MobileKeypad } from '@khanacademy/math-input';
import { Renderer, ServerItemRenderer, usePerseusI18n } from '@khanacademy/perseus';
import { pushContextStack } from '@khanacademy/perseus-linter';
import { dependencies } from './dependencies';

// Space for the editor's lint markers, beside the content
const LINT_GUTTER_WIDTH = 36;

// The editor sizes the frame to the content, plus this
const BOTTOM_MARGIN = 30;

function PreviewContent({ content, isMobile }) {
  const { strings } = usePerseusI18n();
  const { keypadElement } = useContext(KeypadContext);
  const { data } = content;
  const apiOptions = { ...data.apiOptions, isMobile };

  if (content.type === 'question') {
    return createElement(ServerItemRenderer, {
      item: data.item,
      apiOptions,
      keypadElement,
      linterContext: pushContextStack(data.linterContext, 'question'),
      hintsVisible: data.initialHintsVisible,
      reviewMode: data.reviewMode,
      problemNum: data.problemNum,
      dependencies,
    });
  }
  if (content.type === 'hint') {
    return createElement(Renderer, {
      strings,
      content: data.hint.content,
      widgets: data.hint.widgets,
      images: data.hint.images,
      apiOptions,
      keypadElement,
      linterContext: pushContextStack(data.linterContext, 'hint'),
    });
  }
  return null;
}

function Keypad() {
  const { setKeypadActive, setKeypadElement } = useContext(KeypadContext);
  return createElement(MobileKeypad, {
    onAnalyticsEvent: async () => {},
    onDismiss: () => setKeypadActive(false),
    onElementMounted: setKeypadElement,
  });
}

export default function PreviewPage() {
  const frame = window.frameElement;
  const frameId = frame && frame.dataset.id;
  const isMobile = Boolean(frame && frame.dataset.mobile === 'true');
  const hasLintGutter = Boolean(frame && frame.dataset.lintGutter === 'true');
  const [content, setContent] = useState(null);
  const container = useRef(null);

  useEffect(() => {
    if (!frameId) {
      return;
    }
    function receive(event) {
      if (event.origin !== window.location.origin || String(event.data) !== frameId) {
        return;
      }
      const data = window.parent.iframeDataStore && window.parent.iframeDataStore[frameId];
      if (data) {
        setContent(data);
      }
    }
    window.addEventListener('message', receive);
    window.parent.postMessage(frameId, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, [frameId]);

  useEffect(() => {
    if (!frameId || !container.current) {
      return;
    }
    const element = container.current;
    function reportHeight() {
      window.parent.postMessage(
        { id: frameId, height: element.scrollHeight + BOTTOM_MARGIN },
        window.location.origin,
      );
    }
    reportHeight();
    // Also catches widgets that change size without resizing the container
    const interval = setInterval(reportHeight, 500);
    const observer = new ResizeObserver(reportHeight);
    observer.observe(element);
    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [frameId, content]);

  return createElement(
    'div',
    { ref: container },
    content &&
      createElement(
        StatefulKeypadContextProvider,
        null,
        createElement(
          'div',
          {
            className: `framework-perseus${isMobile ? ' perseus-mobile' : ''}`,
            style: {
              padding: '16px',
              marginRight: hasLintGutter ? `${LINT_GUTTER_WIDTH}px` : 0,
              containerType: 'inline-size',
              containerName: 'perseus-root',
            },
          },
          createElement(PreviewContent, { content, isMobile }),
          createElement(Keypad),
        ),
      ),
  );
}
