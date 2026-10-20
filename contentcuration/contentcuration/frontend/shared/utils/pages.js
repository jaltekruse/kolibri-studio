import { ContentKindsNames } from 'shared/leUtils/ContentKinds';

/**
 * The extra_fields key holding a page's Markdown. A document with it is a page, written
 * in Studio's editor rather than uploaded. Matches PAGE_MARKDOWN in
 * contentcuration/constants/contentnode.py.
 */
export const PAGE_MARKDOWN = 'page_markdown';

/**
 * @param {Object} node A content node
 * @returns {boolean} Whether the node is a page
 */
export function isPage(node) {
  return (
    node?.kind === ContentKindsNames.DOCUMENT &&
    typeof node.extra_fields?.[PAGE_MARKDOWN] === 'string'
  );
}

/**
 * @param {Object} node A page
 * @returns {boolean} Whether the page has nothing in it yet
 */
export function pageIsEmpty(node) {
  return !node.extra_fields[PAGE_MARKDOWN].trim();
}
