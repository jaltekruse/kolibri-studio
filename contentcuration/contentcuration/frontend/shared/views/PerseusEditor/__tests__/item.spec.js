import { blankPerseusRawData, perseusItemFromRawData, rawDataFromPerseusItem } from '../item';

const CHECKSUM = 'a'.repeat(32);
const STORED = `![A graph](\${☣ CONTENTSTORAGE}/${CHECKSUM}.png)`;
const SHOWN = `![A graph](/content/storage/a/a/${CHECKSUM}.png)`;
const GRAPHIE = 'web+graphie:${☣ CONTENTSTORAGE}/' + 'b'.repeat(40);

function rawData(content) {
  return JSON.stringify({ question: { content, images: {}, widgets: {} }, hints: [] });
}

describe('Perseus items in raw_data', () => {
  it('shows stored images from Studio', () => {
    expect(perseusItemFromRawData(rawData(STORED)).question.content).toBe(SHOWN);
  });

  it('stores images shown from Studio, and so uploaded in the editor, by checksum', () => {
    const item = perseusItemFromRawData(rawData(STORED));

    expect(rawDataFromPerseusItem(item)).toBe(rawData(STORED));
  });

  it('keeps graphie images as they are', () => {
    const item = perseusItemFromRawData(rawData(GRAPHIE));

    expect(item.question.content).toBe(GRAPHIE);
    expect(rawDataFromPerseusItem(item)).toBe(rawData(GRAPHIE));
  });

  it('keeps images from elsewhere as they are', () => {
    const content = '![A graph](https://example.com/content/storage/a/a/x.png)';

    expect(rawDataFromPerseusItem(perseusItemFromRawData(rawData(content)))).toBe(rawData(content));
  });

  it('starts a new question empty', () => {
    const item = JSON.parse(blankPerseusRawData());

    expect(item.question).toEqual({ content: '', images: {}, widgets: {} });
    expect(item.hints).toEqual([]);
  });
});
