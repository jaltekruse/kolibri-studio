/**
 * A Perseus question is kept in an assessment item's raw_data as the JSON of a
 * Perseus item. Its images are at ${☣ CONTENTSTORAGE}/<checksum>.<ext>, as in
 * Studio's other questions, and the editor shows them from Studio's storage.
 */
import { storageUrl } from 'shared/vuex/file/utils';

const PLACEHOLDER = '${☣ CONTENTSTORAGE}';

const PLACEHOLDER_IMAGE = /\$\{☣ CONTENTSTORAGE\}\/([a-f0-9]{32})\.([0-9a-z]+)/g;

const STORAGE_IMAGE = /\/content\/storage\/[a-f0-9]\/[a-f0-9]\/([a-f0-9]{32})\.([0-9a-z]+)/g;

/**
 * The Perseus item in an assessment item's raw_data, with its images where
 * Studio serves them.
 * @param {string} rawData - The assessment item's raw_data
 * @returns {object} The Perseus item
 * @throws {SyntaxError} When raw_data is not JSON
 */
export function perseusItemFromRawData(rawData) {
  return JSON.parse(
    rawData.replace(PLACEHOLDER_IMAGE, (match, checksum, extension) =>
      storageUrl(checksum, extension),
    ),
  );
}

/**
 * The raw_data that keeps a Perseus item, with its images where publishing
 * finds them.
 * @param {object} item - The Perseus item
 * @returns {string} The assessment item's raw_data
 */
export function rawDataFromPerseusItem(item) {
  return JSON.stringify(item).replace(
    STORAGE_IMAGE,
    (match, checksum, extension) => `${PLACEHOLDER}/${checksum}.${extension}`,
  );
}

/**
 * The raw_data of a new, empty Perseus question.
 * @returns {string} The assessment item's raw_data
 */
export function blankPerseusRawData() {
  return rawDataFromPerseusItem({
    question: { content: '', images: {}, widgets: {} },
    answerArea: {
      calculator: false,
      chi2Table: false,
      periodicTable: false,
      tTable: false,
      zTable: false,
    },
    hints: [],
    itemDataVersion: { major: 0, minor: 1 },
  });
}
