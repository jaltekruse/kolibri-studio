<template>

  <div class="perseus-editor">
    <KCircularLoader
      v-if="loading"
      :delay="true"
    />
    <p
      v-if="errorMessage"
      class="error"
      :style="{ color: $themeTokens.error }"
      role="alert"
      data-testid="perseusEditorError"
    >
      {{ errorMessage }}
    </p>
    <div
      ref="root"
      data-testid="perseusRoot"
    ></div>
  </div>

</template>


<script>

  import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import debounce from 'lodash/debounce';
  import { perseusItemFromRawData, rawDataFromPerseusItem } from './item';
  import { perseusEditorStrings } from './perseusEditorStrings';
  import urls from 'shared/urls';
  import EditorImageProcessor from 'shared/views/TipTapEditor/TipTapEditor/services/imageService';

  /**
   * Edits, or shows, a question written with Khan Academy's question editor,
   * Perseus. Perseus is a React app, loaded when the first such question is shown.
   */
  export default {
    name: 'PerseusEditor',

    setup(props, { emit }) {
      const { unreadableQuestion$, imageUploadFailed$ } = perseusEditorStrings;

      const root = ref(null);
      const loading = ref(true);
      const errorMessage = ref('');

      let perseus = null;
      let shown = null;
      let unmounted = false;
      // The item as last loaded or edited, and how many times it has been replaced
      let item = null;
      let revision = 0;
      let lastRawData = props.rawData;

      function imageUploader(file, callback) {
        errorMessage.value = '';
        EditorImageProcessor.processFile(file).then(
          ({ src }) => callback(src),
          error => {
            errorMessage.value = imageUploadFailed$({ error: error.message });
          },
        );
      }

      // What this editor saved, until it comes back as the rawData prop
      let saved = [];

      // The editor reports every keystroke; save once typing pauses
      const save = debounce(() => {
        saved.push(lastRawData);
        emit('update:rawData', lastRawData);
      }, 500);

      function onChange(editedItem) {
        item = editedItem;
        lastRawData = rawDataFromPerseusItem(editedItem);
        save();
      }

      function showProps() {
        return {
          mode: props.mode,
          revision,
          item,
          itemId: props.itemId,
          showAnswers: props.showAnswers,
          previewURL: urls.perseus_preview(),
          imageUploader,
          onChange,
        };
      }

      function loadItem(rawData) {
        try {
          item = perseus.migratePerseusItem(perseusItemFromRawData(rawData));
          errorMessage.value = '';
        } catch (error) {
          item = null;
          errorMessage.value = unreadableQuestion$();
        }
        revision += 1;
      }

      function show() {
        if (!item) {
          if (shown) {
            shown.unmount();
            shown = null;
          }
          return;
        }
        if (shown) {
          shown.update(showProps());
        } else {
          shown = perseus.mountPerseusItem(root.value, showProps());
        }
      }

      onMounted(async () => {
        perseus = await import(/* webpackChunkName: "perseusEditor" */ './perseus');
        if (unmounted) {
          return;
        }
        loading.value = false;
        loadItem(props.rawData);
        show();
      });

      // A change from elsewhere, such as another editor of the channel, replaces the item;
      // this editor's own saves, which can come back after more edits, don't
      watch(
        () => props.rawData,
        rawData => {
          const savedIndex = saved.indexOf(rawData);
          if (savedIndex !== -1) {
            saved = saved.slice(savedIndex + 1);
            return;
          }
          if (!perseus || rawData === lastRawData) {
            return;
          }
          save.cancel();
          lastRawData = rawData;
          loadItem(rawData);
          show();
        },
      );

      watch([() => props.mode, () => props.showAnswers], () => {
        save.flush();
        if (perseus) {
          show();
        }
      });

      onBeforeUnmount(() => {
        save.flush();
        unmounted = true;
        if (shown) {
          shown.unmount();
        }
      });

      return {
        root,
        loading,
        errorMessage,
      };
    },

    props: {
      /** The assessment item's raw_data: the Perseus item's JSON */
      rawData: {
        type: String,
        required: true,
      },
      /** The assessment item's id */
      itemId: {
        type: String,
        required: true,
      },
      /** 'edit' to edit the question, 'view' to show it */
      mode: {
        type: String,
        default: 'view',
      },
      /** When shown, whether to show its answers and hints */
      showAnswers: {
        type: Boolean,
        default: false,
      },
    },

    emits: ['update:rawData'],
  };

</script>


<style lang="scss" scoped>

  .error {
    margin: 0;
  }

  /*
    Khan Academy's editor fixes its style warnings toggle to the bottom of the window,
    over Studio's own buttons. Keep it in the editor's toolbar, beside the viewport sizes.
  */
  .perseus-editor /deep/ .framework-perseus > div:first-child > button {
    position: static !important;
    margin-left: 16px;
  }

</style>
