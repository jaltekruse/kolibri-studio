import os
import uuid

from kolibri_content import models as kolibri_models
from kolibri_content.router import cleanup_content_database_connection
from kolibri_content.router import set_active_content_database
from le_utils.constants import format_presets
from mock import patch

from contentcuration.tests import testdata
from contentcuration.tests.base import StudioTestCase
from contentcuration.utils.publish import create_content_database
from contentcuration.utils.publish import set_channel_icon_encoding
from contentcuration.utils.youtube import get_youtube_id
from contentcuration.utils.youtube import youtube_id_from_url

YOUTUBE_ID = "5a6zpfl50go"


def ricecooker_source_domain(domain):
    return uuid.uuid5(uuid.NAMESPACE_DNS, domain).hex


class YouTubeIdFromUrlTestCase(StudioTestCase):
    def test_reads_the_id_from_youtube_urls(self):
        for url in (
            f"http://www.youtube.com/watch?v={YOUTUBE_ID}",
            f"https://youtube.com/watch?feature=share&v={YOUTUBE_ID}",
            f"https://m.youtube.com/watch?v={YOUTUBE_ID}",
            f"https://youtu.be/{YOUTUBE_ID}?t=30",
            f"https://www.youtube.com/embed/{YOUTUBE_ID}",
            f"https://www.youtube-nocookie.com/embed/{YOUTUBE_ID}",
            f"https://www.youtube.com/shorts/{YOUTUBE_ID}",
        ):
            with self.subTest(url=url):
                self.assertEqual(youtube_id_from_url(url), YOUTUBE_ID)

    def test_ignores_other_urls(self):
        for url in (
            None,
            "",
            f"https://example.com/watch?v={YOUTUBE_ID}",
            "https://www.youtube.com/watch?v=too-short",
            "https://www.youtube.com/playlist?list=PL0123456789",
            f"https://www.youtube.com/channel/{YOUTUBE_ID}",
        ):
            with self.subTest(url=url):
                self.assertIsNone(youtube_id_from_url(url))


class GetYouTubeIdTestCase(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.channel = testdata.channel()
        self.video = testdata.node(
            {"kind_id": "video", "title": "Systems of equations"},
            parent=self.channel.main_tree,
        )

    def set_source(self, domain, source_id=YOUTUBE_ID, language="en"):
        self.video.source_domain = domain
        self.video.source_id = source_id
        self.video.language_id = language
        self.video.save()

    def test_from_the_url_the_video_was_downloaded_from(self):
        self.video.files.filter(preset_id=format_presets.VIDEO_HIGH_RES).update(
            source_url=f"http://www.youtube.com/watch?v={YOUTUBE_ID}"
        )

        self.assertEqual(get_youtube_id(self.video), YOUTUBE_ID)

    def test_from_a_youtube_source_id(self):
        self.set_source(ricecooker_source_domain("youtube.com"))

        self.assertEqual(get_youtube_id(self.video), YOUTUBE_ID)

    def test_from_an_english_khan_academy_video(self):
        self.set_source(ricecooker_source_domain("khanacademy.org"))

        self.assertEqual(get_youtube_id(self.video), YOUTUBE_ID)

    def test_not_for_a_dubbed_khan_academy_video(self):
        # Its source_id is the English video's YouTube id
        self.set_source(ricecooker_source_domain("khanacademy.org"), language="es")

        self.assertIsNone(get_youtube_id(self.video))

    def test_not_for_a_video_from_elsewhere(self):
        self.set_source(ricecooker_source_domain("example.org"))

        self.assertIsNone(get_youtube_id(self.video))

    def test_not_for_a_video_without_a_source(self):
        self.assertIsNone(get_youtube_id(self.video))


class PublishYouTubeIdTestCase(StudioTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.patch_copy_db = patch("contentcuration.utils.publish.save_export_database")
        cls.patch_copy_db.start()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls.patch_copy_db.stop()

    def setUp(self):
        super().setUp()
        self.channel = testdata.channel()
        set_channel_icon_encoding(self.channel)
        self.video = testdata.node(
            {
                "kind_id": "video",
                "title": "Systems of equations",
                "node_id": uuid.uuid4().hex,
                "extra_fields": {
                    "options": {
                        "completion_criteria": {"model": "time", "threshold": 100}
                    }
                },
            },
            parent=self.channel.main_tree,
        )
        self.video.source_domain = ricecooker_source_domain("youtube.com")
        self.video.source_id = YOUTUBE_ID
        self.video.save()
        self.tempdb = None

    def tearDown(self):
        if self.tempdb:
            cleanup_content_database_connection(self.tempdb)
            set_active_content_database(None)
            os.remove(self.tempdb)
        super().tearDown()

    def test_publishes_the_youtube_id_in_the_video_options(self):
        self.tempdb = create_content_database(
            self.channel, True, self.admin_user.id, True
        )
        set_active_content_database(self.tempdb)

        published = kolibri_models.ContentNode.objects.get(id=self.video.node_id)
        self.assertEqual(
            published.options,
            {
                "completion_criteria": {"model": "time", "threshold": 100},
                "youtube_id": YOUTUBE_ID,
            },
        )
        self.video.refresh_from_db()
        self.assertNotIn("youtube_id", self.video.extra_fields["options"])
