import json
import os

from le_utils.constants import completion_criteria
from le_utils.constants import exercises
from le_utils.constants import format_presets

from .base import StudioTestCase
from .testdata import fileobj_exercise_graphie
from .testdata import fileobj_exercise_image
from .testdata import node as create_node
from .testdata import user
from contentcuration.models import AssessmentItem
from contentcuration.utils.import_tools import import_topic
from contentcuration.utils.publish import create_content_database
from contentcuration.utils.publish import set_channel_icon_encoding

MASTERY = {
    "model": completion_criteria.MASTERY,
    "threshold": {"mastery_model": exercises.M_OF_N, "m": 3, "n": 4},
}


class ImportTopicTestCase(StudioTestCase):
    """Copies a topic out of a channel database made by publishing."""

    def setUp(self):
        self.setUpBase()
        self.editor = user(email="editor@example.com")
        self.topic = create_node(
            {"kind_id": "topic", "title": "Systems of equations"},
            parent=self.channel.main_tree,
        )
        self.video = create_node(
            {"kind_id": "video", "title": "Solving systems", "sort_order": 1},
            parent=self.topic,
        )
        self.exercise = create_node(
            {
                "kind_id": "exercise",
                "title": "Solve a system",
                "sort_order": 2,
                "extra_fields": {
                    "randomize": True,
                    "options": {"completion_criteria": MASTERY},
                },
            },
            parent=self.topic,
        )
        self.question = self._add_perseus_question()
        for node in (self.video, self.exercise):
            node.copyright_holder = "Khan Academy"
            node.save()
        # Ids as stored, not as the test data made them
        for node in (self.topic, self.video, self.exercise):
            node.refresh_from_db()

    def _add_perseus_question(self):
        image = fileobj_exercise_image()
        graphie = fileobj_exercise_graphie(original_filename="graph1")
        question = AssessmentItem.objects.create(
            contentnode=self.exercise,
            type=exercises.PERSEUS_QUESTION,
            raw_data=json.dumps(
                {
                    "question": {
                        "content": "![](web+graphie:${0}/graph1) ![](${0}/{1})".format(
                            exercises.CONTENT_STORAGE_PLACEHOLDER, image.filename()
                        ),
                        "widgets": {},
                    },
                    "hints": [],
                },
                ensure_ascii=False,
            ),
        )
        for file in (image, graphie):
            file.assessment_item = question
            file.save()
        return question

    def _import(self):
        self.channel.language_id = "en"
        set_channel_icon_encoding(self.channel)
        database = create_content_database(self.channel, True, self.user.id, True)
        self.addCleanup(os.remove, database)
        return import_topic(
            self.channel.id, self.topic.node_id, self.editor.email, database=database
        )

    def _copy_of(self, channel, source):
        return channel.main_tree.get_descendants().get(content_id=source.content_id)

    def test_makes_a_channel_of_the_topic_for_the_editor(self):
        channel = self._import()

        self.assertEqual(channel.name, "Systems of equations")
        self.assertEqual(channel.language_id, "en")
        self.assertIn(self.editor, channel.editors.all())
        self.assertEqual(
            list(channel.main_tree.get_children().values_list("title", flat=True)),
            ["Solving systems", "Solve a system"],
        )

    def test_copies_are_new_nodes_with_the_same_content(self):
        channel = self._import()

        for source in (self.video, self.exercise):
            copy = self._copy_of(channel, source)
            self.assertNotEqual(copy.node_id, source.node_id)
            self.assertEqual(copy.original_source_node_id, source.node_id)
            self.assertEqual(copy.original_channel_id, self.channel.id)
            self.assertTrue(copy.complete)

    def test_perseus_questions_stay_editable_with_their_files(self):
        channel = self._import()

        exercise = self._copy_of(channel, self.exercise)
        (question,) = exercise.assessment_items.all()
        self.assertEqual(question.type, exercises.PERSEUS_QUESTION)
        self.assertEqual(question.raw_data, self.question.raw_data)
        self.assertEqual(
            sorted(question.files.values_list("checksum", "preset_id")),
            sorted(self.question.files.values_list("checksum", "preset_id")),
        )
        self.assertEqual(
            exercise.extra_fields["options"]["completion_criteria"], MASTERY
        )
        self.assertTrue(exercise.extra_fields["randomize"])
        # Publishing the copy makes its own exercise archives
        self.assertFalse(exercise.files.exists())

    def test_videos_keep_their_files_and_duration(self):
        channel = self._import()

        video = self._copy_of(channel, self.video)
        (file,) = video.files.all()
        self.assertEqual(file.checksum, self.video.files.get().checksum)
        self.assertEqual(file.preset_id, format_presets.VIDEO_HIGH_RES)
        self.assertEqual(file.duration, 100)
