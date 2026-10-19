import hashlib
import shutil
import tempfile

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.http import Http404
from django.test import override_settings
from django.test import RequestFactory
from django.test import SimpleTestCase

from contentcuration.dev_urls import file_server
from contentcuration.models import generate_storage_url
from contentcuration.utils.local_storage import get_local_upload_url
from contentcuration.utils.local_storage import LocalFileStorage
from contentcuration.utils.storage_common import get_presigned_upload_url

CONTENT = b"%PDF-1.4 linear equations"
CHECKSUM = hashlib.md5(CONTENT).hexdigest()
FILENAME = f"{CHECKSUM}.pdf"
PATH = f"storage/{CHECKSUM[0]}/{CHECKSUM[1]}/{FILENAME}"


class LocalStorageTestCase(SimpleTestCase):
    """Studio keeping files in a folder on disk, instead of object storage."""

    def setUp(self):
        folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, folder)
        local_storage = override_settings(
            DEFAULT_FILE_STORAGE="contentcuration.utils.local_storage.LocalFileStorage",
            MEDIA_ROOT=folder,
        )
        local_storage.enable()
        self.addCleanup(local_storage.disable)

    def upload_url(self, lifetime_sec=600):
        return get_presigned_upload_url(
            PATH, CHECKSUM, lifetime_sec, len(CONTENT), storage=default_storage
        )["uploadURL"]

    def put(self, url, content=CONTENT):
        return self.client.put(url, data=content, content_type="application/pdf")

    def test_saving_a_file_replaces_one_with_the_same_name(self):
        storage = LocalFileStorage()
        storage.save("databases/channel.sqlite3", ContentFile(b"version 1"))

        name = storage.save("databases/channel.sqlite3", ContentFile(b"version 2"))

        self.assertEqual(name, "databases/channel.sqlite3")
        with storage.open(name) as f:
            self.assertEqual(f.read(), b"version 2")

    def test_browsers_upload_the_file_to_studio(self):
        response = self.put(self.upload_url())

        self.assertEqual(response.status_code, 200)
        with default_storage.open(PATH) as f:
            self.assertEqual(f.read(), CONTENT)

    def test_rejects_a_different_file(self):
        response = self.put(self.upload_url(), content=b"something else")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(default_storage.exists(PATH))

    def test_rejects_a_changed_upload_url(self):
        url = self.upload_url()
        changed = url[:-1] + ("A" if url[-1] != "A" else "B")

        response = self.put(changed)

        self.assertEqual(response.status_code, 403)
        self.assertFalse(default_storage.exists(PATH))

    def test_upload_urls_only_save_to_their_own_path(self):
        url = get_local_upload_url("storage/a/b/other.pdf", CHECKSUM, 600)

        self.put(url)

        self.assertTrue(default_storage.exists("storage/a/b/other.pdf"))
        self.assertFalse(default_storage.exists(PATH))

    def test_rejects_an_expired_upload_url(self):
        response = self.put(self.upload_url(lifetime_sec=-1))

        self.assertEqual(response.status_code, 403)
        self.assertFalse(default_storage.exists(PATH))

    def test_only_accepts_uploads(self):
        self.assertEqual(self.client.get(self.upload_url()).status_code, 405)

    def test_files_are_served_by_studio(self):
        default_storage.save(PATH, ContentFile(CONTENT))

        self.assertEqual(generate_storage_url(FILENAME), f"/content/{PATH}")
        response = file_server(RequestFactory().get(f"/content/{PATH}"), PATH)
        self.assertEqual(b"".join(response.streaming_content), CONTENT)

    def test_missing_files_are_not_found(self):
        with self.assertRaises(Http404):
            file_server(RequestFactory().get(f"/content/{PATH}"), PATH)
