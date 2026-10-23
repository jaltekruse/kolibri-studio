/**
 * What Perseus needs from the app it runs in, for the editor and its previews.
 */
import '@khanacademy/wonder-blocks-tokens/styles.css';
import '@khanacademy/perseus/styles.css';
import '@khanacademy/math-input/styles.css';
import { createElement } from 'react';
import * as perseus from '@khanacademy/perseus';
// The linter's resolver doesn't read package.json exports, which these subpaths are
// eslint-disable-next-line import/no-unresolved
import { mockStrings as perseusStrings } from '@khanacademy/perseus/strings';
import { MathInputI18nContextProvider } from '@khanacademy/math-input';
// eslint-disable-next-line import/no-unresolved
import { mockStrings as mathInputStrings } from '@khanacademy/math-input/strings';
import { RenderStateRoot } from '@khanacademy/wonder-blocks-core';
import TeX from './TeX';

// Studio has none of Khan Academy's analytics, videos or URL rewriting
export const dependencies = {
  analytics: { onAnalyticsEvent: async () => {} },
  generateUrl: ({ url }) => url,
  useVideo: () => ({ status: 'success', data: { video: null } }),
};

/* eslint-disable no-console */
const log = {
  log: (message, extra) => console.log(message, extra),
  error: (message, kind, extra) => console.error(message, kind, extra),
};
/* eslint-enable no-console */

let initialized = false;

/**
 * Give Perseus the dependencies it reads globally. Called before rendering anything.
 */
export function initPerseus() {
  if (initialized) {
    return;
  }
  perseus.Dependencies.setDependencies({
    JIPT: { useJIPT: false },
    TeX,
    isDevServer: process.env.NODE_ENV !== 'production',
    // Perseus loads localized data for other locales; Studio edits in English
    kaLocale: 'en',
    // Still read by some widgets for their own assets
    staticUrl: url => url,
    Log: log,
  });
  perseus.init();
  initialized = true;
}

/**
 * Wrap a Perseus element in the contexts Perseus reads.
 * @param {object} element - A React element
 * @returns {object} The wrapped React element
 */
export function withPerseusContext(element) {
  return createElement(RenderStateRoot, {
    children: createElement(perseus.DependenciesContext.Provider, {
      value: dependencies,
      children: createElement(perseus.PerseusI18nContextProvider, {
        locale: 'en',
        strings: perseusStrings,
        children: createElement(MathInputI18nContextProvider, {
          locale: 'en',
          strings: mathInputStrings,
          children: element,
        }),
      }),
    }),
  });
}
