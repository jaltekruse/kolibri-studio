import os
import uuid
import zipfile

from django.core.files.storage import default_storage as storage
from kolibri_content import models as kolibri_models
from kolibri_content.router import cleanup_content_database_connection
from kolibri_content.router import set_active_content_database
from le_utils.constants import content_kinds
from le_utils.constants import exercises
from le_utils.constants import format_presets
from mock import patch

from contentcuration import models as cc
from contentcuration.constants.contentnode import PAGE_MARKDOWN
from contentcuration.tests import testdata
from contentcuration.tests.base import StudioAPITestCase
from contentcuration.tests.base import StudioTestCase
from contentcuration.tests.viewsets.base import generate_update_event
from contentcuration.tests.viewsets.base import SyncTestMixin
from contentcuration.utils.publish import create_content_database
from contentcuration.utils.publish import set_channel_icon_encoding
from contentcuration.viewsets.sync.constants import CONTENTNODE


IMAGE_PREFIX = "${}/".format(exercises.CONTENT_STORAGE_PLACEHOLDER)


def image_markdown(image_file, suffix=""):
    return f"![A red square]({IMAGE_PREFIX}{image_file.checksum}.jpg{suffix})"


def create_page(parent, markdown, **kwargs):
    return cc.ContentNode.objects.create(
        kind_id=content_kinds.DOCUMENT,
        title="Solving equations",
        parent=parent,
        license=testdata.license_wtfpl(),
        copyright_holder="Learning Equality",
        extra_fields={PAGE_MARKDOWN: markdown},
        **kwargs,
    )


class PageCompletenessTestCase(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.channel = testdata.channel()

    def test_page_with_markdown_needs_no_file(self):
        page = create_page(self.channel.main_tree, "# Solving equations")

        self.assertEqual(page.mark_complete(), [])

    def test_empty_page_is_incomplete(self):
        page = create_page(self.channel.main_tree, " \n")

        self.assertIn("Empty page", page.mark_complete())

    def test_uploaded_document_still_needs_its_file(self):
        document = create_page(self.channel.main_tree, "")
        document.extra_fields = {}

        self.assertIn("Missing default file", document.mark_complete())


class PageImagesSyncTestCase(SyncTestMixin, StudioAPITestCase):
    def setUp(self):
        super().setUp()
        self.channel = testdata.channel()
        self.user = testdata.user()
        self.channel.editors.add(self.user)
        self.client.force_authenticate(user=self.user)
        self.page = create_page(self.channel.main_tree, "")

    def edit_page(self, markdown):
        response = self.sync_changes(
            [
                generate_update_event(
                    self.page.id,
                    CONTENTNODE,
                    {f"extra_fields.{PAGE_MARKDOWN}": markdown},
                    channel_id=self.channel.id,
                )
            ]
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.page.refresh_from_db()

    def page_image_checksums(self):
        return set(
            self.page.files.filter(preset_id=format_presets.EXERCISE_IMAGE).values_list(
                "checksum", flat=True
            )
        )

    def test_saves_markdown_and_attaches_the_images_it_shows(self):
        image = testdata.fileobj_exercise_image(uploaded_by=self.user)
        markdown = "Look:\n\n" + image_markdown(image, " =100x100 align=center")

        self.edit_page(markdown)

        self.assertEqual(self.page.extra_fields[PAGE_MARKDOWN], markdown)
        image.refresh_from_db()
        self.assertEqual(image.contentnode_id, self.page.id)

    def test_detaches_images_taken_out_of_the_page(self):
        image = testdata.fileobj_exercise_image(uploaded_by=self.user)
        self.edit_page(image_markdown(image))

        self.edit_page("No pictures now")

        self.assertEqual(self.page_image_checksums(), set())

    def test_attaches_an_image_uploaded_by_someone_else(self):
        image = testdata.fileobj_exercise_image(
            color="blue", uploaded_by=testdata.user("other@example.com")
        )

        self.edit_page(image_markdown(image))

        self.assertEqual(self.page_image_checksums(), {image.checksum})
        image.refresh_from_db()
        self.assertIsNone(image.contentnode_id)


class PagePublishTestCase(StudioTestCase):
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
        self.image = testdata.fileobj_exercise_image()
        self.page = create_page(
            self.channel.main_tree,
            "# Solving equations\n\nKeep $$x + 1 = 2$$ balanced.\n\n"
            + image_markdown(self.image, " =50x50"),
            complete=True,
            node_id=uuid.uuid4().hex,
        )
        self.image.contentnode = self.page
        self.image.save()
        self.tempdb = None

    def tearDown(self):
        if self.tempdb:
            cleanup_content_database_connection(self.tempdb)
            set_active_content_database(None)
            os.remove(self.tempdb)
        super().tearDown()

    def publish(self):
        self.tempdb = create_content_database(
            self.channel, True, self.admin_user.id, True
        )
        set_active_content_database(self.tempdb)

    def test_publishes_a_page_as_a_kpub(self):
        self.publish()

        kpub = self.page.files.get(preset_id=format_presets.KPUB_ZIP)
        with storage.open(str(kpub.file_on_disk), "rb") as f:
            with zipfile.ZipFile(f) as zf:
                self.assertEqual(
                    set(zf.namelist()), {"index.html", f"{self.image.checksum}.jpg"}
                )
                index = zf.read("index.html").decode("utf-8")
        self.assertIn("<h1>Solving equations</h1>", index)
        self.assertIn('<math display="inline">', index)
        self.assertIn(f'src="{self.image.checksum}.jpg"', index)
        self.assertNotIn(exercises.CONTENT_STORAGE_PLACEHOLDER, index)

        published_files = kolibri_models.File.objects.filter(
            contentnode_id=self.page.node_id
        )
        self.assertEqual(
            list(published_files.values_list("preset", "local_file_id")),
            [(format_presets.KPUB_ZIP, kpub.checksum)],
        )

    def test_republishing_an_edited_page_replaces_its_kpub(self):
        self.publish()
        first = self.page.files.get(preset_id=format_presets.KPUB_ZIP)
        self.page.refresh_from_db()
        self.page.extra_fields[PAGE_MARKDOWN] = "# Solving inequalities"
        self.page.changed = True
        self.page.save()
        cleanup_content_database_connection(self.tempdb)
        os.remove(self.tempdb)

        self.publish()

        second = self.page.files.get(preset_id=format_presets.KPUB_ZIP)
        self.assertNotEqual(first.checksum, second.checksum)
