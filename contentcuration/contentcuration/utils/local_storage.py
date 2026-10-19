"""
Storage in a folder on the server's own disk, for running Studio without object
storage, such as alongside Kolibri on one machine. Files are laid out as in object
storage, under the folder given as MEDIA_ROOT.

Browsers upload files straight to object storage through presigned URLs. Local
storage has no such URLs, so Studio hands out signed URLs to its own upload view
instead.
"""
from django.core import signing
from django.core.files.storage import FileSystemStorage
from django.urls import reverse

_UPLOAD_SALT = "contentcuration.utils.local_storage.upload"


class LocalFileStorage(FileSystemStorage):
    """
    Saving a file replaces any file with the same name, as in object storage, so
    a republished channel's database replaces the previous one.
    """

    def get_available_name(self, name, max_length=None):
        if self.exists(name):
            self.delete(name)
        return super().get_available_name(name, max_length=max_length)


def get_local_upload_url(filepath, md5_hex, lifetime_sec):
    """
    A URL that accepts a PUT of the file with this checksum to this path in
    local storage, for the next lifetime_sec seconds.
    """
    token = signing.dumps(
        {"path": filepath, "md5": md5_hex, "lifetime": lifetime_sec},
        salt=_UPLOAD_SALT,
    )
    return reverse("local_storage_upload", kwargs={"token": token})


def read_local_upload_token(token):
    """
    The path and checksum an upload URL is for.

    :raises django.core.signing.BadSignature: if the token was not made by
        get_local_upload_url, or has expired
    """
    lifetime = signing.loads(token, salt=_UPLOAD_SALT)["lifetime"]
    return signing.loads(token, salt=_UPLOAD_SALT, max_age=lifetime)

