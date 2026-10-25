from django.urls import reverse
from le_utils.constants import content_kinds
from le_utils.constants import exercises

from ..base import BaseAPITestCase
from contentcuration.models import AssessmentItem
from contentcuration.models import ContentNode
from contentcuration.tests import testdata


class PerseusGraphieTestCase(BaseAPITestCase):
    """The parts of a graphie a Perseus question shows, as the editor loads them."""

    def setUp(self):
        super().setUp()
        exercise = ContentNode.objects.create(
            title="Exercise",
            kind_id=content_kinds.EXERCISE,
            parent=self.channel.main_tree,
        )
        question = AssessmentItem.objects.create(
            contentnode=exercise, type=exercises.PERSEUS_QUESTION
        )
        graphie = testdata.fileobj_exercise_graphie(original_filename="graph1")
        graphie.assessment_item = question
        graphie.save()

    def _get(self, name, suffix):
        return self.client.get(reverse("perseus_graphie", args=[name, suffix]))

    def test_serves_the_svg_of_a_graphie_in_a_channel_the_user_edits(self):
        self.sign_in()

        response = self._get("graph1", ".svg")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/svg+xml")
        self.assertEqual(
            response.content, b"<svg><circle cx='50' cy='50' r='40' />graph1</svg>"
        )
        # Opened on its own, the svg cannot run scripts as Studio
        self.assertIn("sandbox", response["Content-Security-Policy"])

    def test_serves_the_label_data_of_a_graphie(self):
        self.sign_in()

        response = self._get("graph1", "-data.json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(response.json(), {"version": {"major": 0, "minor": 0}})

    def test_hides_graphies_in_channels_the_user_cannot_see(self):
        self.sign_in(testdata.user(email="other@example.com"))

        self.assertEqual(self._get("graph1", ".svg").status_code, 404)

    def test_has_no_graphie_by_another_name(self):
        self.sign_in()

        self.assertEqual(self._get("graph2", ".svg").status_code, 404)
