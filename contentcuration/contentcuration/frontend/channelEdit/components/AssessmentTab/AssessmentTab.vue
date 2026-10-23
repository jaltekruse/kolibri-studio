<template>

  <div>
    <div
      v-if="invalidItemsCount"
      class="incomplete-banner"
      role="status"
      :style="bannerStyle"
    >
      <KIcon
        icon="error"
        :color="$themeTokens.error"
      />
      <span :style="{ color: $themeTokens.error }">
        {{ $tr('incompleteItemsCountMessage', { invalidItemsCount }) }}
      </span>
    </div>

    <QTIEditor
      :assessments="assessmentItems"
      :allowFreeResponse="allowFreeResponse"
      :language="language"
      :otherItemTypes="otherItemTypes"
      @update="applyUpdate"
    >
      <template #otherItem="{ item, mode, showAnswers, update }">
        <PerseusEditor
          :rawData="item.raw_data"
          :itemId="item.assessment_id"
          :mode="mode"
          :showAnswers="showAnswers"
          @update:rawData="update"
        />
      </template>
    </QTIEditor>
  </div>

</template>


<script>

  import useKResponsiveWindow from 'kolibri-design-system/lib/composables/useKResponsiveWindow';
  import { computed, toRefs } from 'vue';

  import useAssessmentItems from '../../composables/useAssessmentItems';
  import QTIEditor from 'shared/views/QTIEditor/index';
  import PerseusEditor from 'shared/views/PerseusEditor/index';
  import { blankPerseusRawData } from 'shared/views/PerseusEditor/item';
  import { perseusEditorStrings } from 'shared/views/PerseusEditor/perseusEditorStrings';
  import { AssessmentItemTypes } from 'shared/constants';

  export default {
    name: 'AssessmentTab',
    components: {
      QTIEditor,
      PerseusEditor,
    },
    setup(props) {
      const { nodeId } = toRefs(props);
      const { windowIsSmall } = useKResponsiveWindow();
      const { assessmentItems, invalidItemsCount, allowFreeResponse, language, applyUpdate } =
        useAssessmentItems(nodeId);

      const bannerStyle = computed(() =>
        windowIsSmall.value ? {} : { maxWidth: '1200px', margin: '0 auto' },
      );

      // Questions written with Khan Academy's question editor, Perseus
      const { khanAcademyQuestion$, newKhanAcademyQuestion$ } = perseusEditorStrings;
      const otherItemTypes = {
        [AssessmentItemTypes.PERSEUS_QUESTION]: {
          label: khanAcademyQuestion$(),
          newLabel: newKhanAcademyQuestion$(),
          newRawData: blankPerseusRawData,
        },
      };

      return {
        otherItemTypes,
        assessmentItems,
        invalidItemsCount,
        allowFreeResponse,
        language,
        applyUpdate,
        bannerStyle,
      };
    },
    props: {
      nodeId: {
        type: String,
        required: true,
      },
    },
    $trs: {
      incompleteItemsCountMessage:
        '{invalidItemsCount} incomplete {invalidItemsCount, plural, one {question} other {questions}}',
    },
  };

</script>


<style lang="scss" scoped>

  .incomplete-banner {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 16px 32px 0;
    font-weight: bold;
  }

</style>
