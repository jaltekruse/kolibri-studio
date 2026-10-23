import { createTranslator } from 'shared/i18n';

export const perseusEditorStrings = createTranslator('PerseusEditorStrings', {
  khanAcademyQuestion: {
    message: 'Khan Academy question',
    context:
      'The kind of a question written with Khan Academy\'s question editor (Perseus), e.g. "Question 1 of 3 — Khan Academy question"',
  },
  newKhanAcademyQuestion: {
    message: 'New Khan Academy question',
    context: "Button that adds a question written with Khan Academy's question editor (Perseus)",
  },
  unreadableQuestion: {
    message: 'This question could not be opened',
    context: 'Shown instead of a Khan Academy question whose data could not be read',
  },
  imageUploadFailed: {
    message: 'The image could not be added: {error}',
    context: 'Shown when an image added to a Khan Academy question fails to upload',
  },
});
