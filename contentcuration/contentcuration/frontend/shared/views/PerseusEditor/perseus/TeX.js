/**
 * Perseus's math, rendered with Khan Academy's MathJax renderer, which knows the
 * macros, such as colors, its content uses. Adapted from Kolibri's Perseus viewer.
 */
import '@khanacademy/mathjax-renderer/src/css/mathjax.css';
import '@khanacademy/mathjax-renderer/src/css/safari-hacks.css';
import '@khanacademy/mathjax-renderer/src/css/selectable.css';
import { MathJaxRenderer } from '@khanacademy/mathjax-renderer';
import { createElement, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

// webpack.config.js copies MathJax's fonts here
const FONT_URL = '/static/mathjax/fonts';

// Roles that hide their descendants' meaning from screen readers, so math inside
// them needs a label. From WAI-ARIA 1.2, plus combobox, which screen readers
// treat the same way.
const PRESENTATIONAL_ROLES = [
  'button',
  'checkbox',
  'img',
  'menuitemcheckbox',
  'menuitemradio',
  'meter',
  'option',
  'progressbar',
  'radio',
  'scrollbar',
  'separator',
  'slider',
  'switch',
  'tab',
  'combobox',
];

const PRESENTATIONAL = PRESENTATIONAL_ROLES.map(role => `[role=${role}]`).join(',');

const renderer = new MathJaxRenderer({
  fontURL: FONT_URL,
  shouldFixUnicodeLayout: true,
  locale: 'en',
});

export default function TeX({ children: tex, onRender }) {
  const ref = useRef(null);
  const { domElement, addLabel } = useMemo(() => renderer.render(tex), [tex]);

  useLayoutEffect(() => {
    if (ref.current.closest(PRESENTATIONAL)) {
      // eslint-disable-next-line no-console
      addLabel().catch(console.error);
    }
    ref.current.replaceChildren(domElement);
  }, [addLabel, domElement]);

  useEffect(() => {
    renderer.updateStyles();
    if (onRender) {
      onRender();
    }
  }, [tex, onRender]);

  return createElement('span', { ref });
}
