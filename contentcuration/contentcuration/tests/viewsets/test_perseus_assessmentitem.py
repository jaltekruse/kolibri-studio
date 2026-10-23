import json
import uuid

from le_utils.constants import content_kinds
from le_utils.constants import exercises

from contentcuration import models
from contentcuration.tests import testdata
from contentcuration.tests.base import StudioAPITestCase
from contentcuration.tests.viewsets.base import generate_create_event
from contentcuration.tests.viewsets.base import generate_update_event
from contentcuration.tests.viewsets.base import SyncTestMixin
from contentcuration.viewsets.sync.constants import ASSESSMENTITEM

IMAGE_PREFIX = "${}/".format(exercises.CONTENT_STORAGE_PLACEHOLDER)


def perseus_raw_data(content, image_checksums=()):
    images = " ".join(
        f"![A picture]({IMAGE_PREFIX}{checksum}.jpg)" for checksum in image_checksums
    )
    return json.dumps(
        {
            "question": {
                "content": f"{content} {images} [[☃ numeric-input 1]]",
                "images": {},
                "widgets": {
                    "numeric-input 1": {
                        "type": "numeric-input",
                        "options": {
                            "answers": [{"value": 4, "status": "correct"}],
                        },
                    }
                },
            },
            "answerArea": {"calculator": False},
            "hints": [],
            "itemDataVersion": {"major": 0, "minor": 1},
        },
        # As the editor writes it, and publishing reads it
        ensure_ascii=False,
    )


class PerseusAssessmentItemSyncTestCase(SyncTestMixin, StudioAPITestCase):
    def setUp(self):
        super().setUp()
        self.channel = testdata.channel()
        self.user = testdata.user()
        self.channel.editors.add(self.user)
        self.client.force_authenticate(user=self.user)
        self.exercise = (
            self.channel.main_tree.get_descendants()
            .filter(kind_id=content_kinds.EXERCISE)
            .first()
        )

    def image(self, color="red"):
        return testdata.fileobj_exercise_image(color=color, uploaded_by=self.user)

    def create_item(self, raw_data):
        assessment_id = uuid.uuid4().hex
        response = self.sync_changes(
            [
                generate_create_event(
                    [self.exercise.id, assessment_id],
                    ASSESSMENTITEM,
                    {
                        "assessment_id": assessment_id,
                        "contentnode": self.exercise.id,
                        "type": exercises.PERSEUS_QUESTION,
                        "raw_data": raw_data,
                    },
                    channel_id=self.channel.id,
                )
            ]
        )
        self.assertEqual(response.status_code, 200, response.content)
        return models.AssessmentItem.objects.get(assessment_id=assessment_id)

    def edit_item(self, item, raw_data):
        return self.sync_changes(
            [
                generate_update_event(
                    [self.exercise.id, item.assessment_id],
                    ASSESSMENTITEM,
                    {"raw_data": raw_data},
                    channel_id=self.channel.id,
                )
            ]
        )

    def file_checksums(self, item):
        return set(item.files.values_list("checksum", flat=True))

    def test_attaches_the_images_a_new_question_shows(self):
        image = self.image()

        item = self.create_item(perseus_raw_data("What is 2 + 2?", [image.checksum]))

        self.assertEqual(self.file_checksums(item), {image.checksum})

    def test_editing_attaches_new_images_and_detaches_removed_ones(self):
        kept, removed, added = (
            self.image("red"),
            self.image("blue"),
            self.image("green"),
        )
        item = self.create_item(
            perseus_raw_data("What is 2 + 2?", [kept.checksum, removed.checksum])
        )

        response = self.edit_item(
            item, perseus_raw_data("What is 2 + 2?", [kept.checksum, added.checksum])
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.file_checksums(item), {kept.checksum, added.checksum})

    def test_editing_keeps_graphie_files(self):
        item = self.create_item(perseus_raw_data("What is 2 + 2?"))
        graphie = testdata.fileobj_exercise_graphie(uploaded_by=self.user)
        graphie.assessment_item = item
        graphie.save()

        self.edit_item(item, perseus_raw_data("What is 3 + 1?"))

        self.assertEqual(self.file_checksums(item), {graphie.checksum})

    def test_rejects_raw_data_that_is_not_a_perseus_item(self):
        original = perseus_raw_data("What is 2 + 2?")
        item = self.create_item(original)

        response = self.edit_item(item, "What is 2 + 2?")

        self.assertTrue(response.json()["errors"][0]["errors"]["raw_data"])
        item.refresh_from_db()
        self.assertEqual(item.raw_data, original)
