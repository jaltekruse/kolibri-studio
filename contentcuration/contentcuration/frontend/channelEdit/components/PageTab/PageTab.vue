<template>

  <div class="page-tab">
    <p
      v-if="isEmpty"
      class="empty-message"
      role="status"
    >
      <KIcon
        icon="error"
        :color="$themeTokens.error"
      />
      <span>{{ emptyPageMessage$() }}</span>
    </p>
    <p class="hint">{{ pageHint$() }}</p>
    <TipTapEditor
      :value="markdown"
      mode="edit"
      minHeight="400px"
      :imageProcessor="EditorImageProcessor"
      :autofocus="isEmpty"
      @ready="followEditor"
      @update="saveMarkdown"
    />
  </div>

</template>


<script>

  import { computed, ref, toRefs } from 'vue';
  import useStore from 'shared/composables/useStore';
  import { createTranslator } from 'shared/i18n';
  import { PAGE_MARKDOWN, pageIsEmpty } from 'shared/utils/pages';
  import TipTapEditor from 'shared/views/TipTapEditor/TipTapEditor/TipTapEditor';
  import EditorImageProcessor from 'shared/views/TipTapEditor/TipTapEditor/services/imageService';

  const strings = createTranslator('PageTabStrings', {
    pageHint: {
      message:
        'Write the page learners will read. Use the toolbar to add headings, lists, images and formulas.',
      context: 'Help text above the editor for the content of a page resource',
    },
    emptyPageMessage: {
      message: 'This page is empty. Add some content to publish it.',
      context: 'Shown above the editor while a page resource has no content',
    },
  });

  /**
   * Edits the content of a page: a document written in Studio rather than uploaded.
   * The content is kept as Markdown, saved whenever the editor loses focus.
   */
  export default {
    name: 'PageTab',
    components: {
      TipTapEditor,
    },
    setup(props) {
      const { nodeId } = toRefs(props);
      const store = useStore();

      const node = computed(() => store.getters['contentNode/getContentNode'](nodeId.value));
      const markdown = computed(() => node.value.extra_fields[PAGE_MARKDOWN]);

      // The editor saves only when it loses focus, so while it is open its own content
      // says whether the page is empty.
      const editorIsEmpty = ref(null);
      const isEmpty = computed(() => editorIsEmpty.value ?? pageIsEmpty(node.value));

      function followEditor(editor) {
        const update = () => {
          editorIsEmpty.value = editor.isEmpty;
        };
        update();
        editor.on('update', update);
      }

      function saveMarkdown(value) {
        store.dispatch('contentNode/updateContentNode', {
          id: nodeId.value,
          extra_fields: { [PAGE_MARKDOWN]: value },
          checkComplete: true,
        });
      }

      const { emptyPageMessage$, pageHint$ } = strings;

      return {
        EditorImageProcessor,
        isEmpty,
        markdown,
        followEditor,
        saveMarkdown,
        emptyPageMessage$,
        pageHint$,
      };
    },
    props: {
      nodeId: {
        type: String,
        required: true,
      },
    },
  };

</script>


<style lang="scss" scoped>

  .page-tab {
    max-width: 1000px;
    margin: 0 auto;
  }

  .empty-message {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .hint {
    margin-bottom: 16px;
  }

</style>
