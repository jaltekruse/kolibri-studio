import hashlib
import tempfile

from django.core import signing
from django.core.files import File
from django.core.files.storage import default_storage
from django.http import HttpResponse
from django.http import HttpResponseBadRequest
from django.http import HttpResponseForbidden
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from contentcuration.utils.local_storage import read_local_upload_token

_CHUNK_SIZE = 1024 * 1024


# Like an object storage presigned URL, the signed token in the URL is what
# authorizes the upload, so there is no session or CSRF token to check.
@csrf_exempt
@require_http_methods(["PUT"])
def upload_to_local_storage(request, token):
    """
    Saves a file uploaded to a URL from get_local_upload_url, after checking
    that it has the checksum the URL was made for.
    """
    try:
        upload = read_local_upload_token(token)
    except signing.BadSignature:
        return HttpResponseForbidden()
    md5 = hashlib.md5()
    with tempfile.TemporaryFile() as temp:
        # Read the body in chunks, so large files are not held in memory
        for chunk in iter(lambda: request.read(_CHUNK_SIZE), b""):
            md5.update(chunk)
            temp.write(chunk)
        if md5.hexdigest() != upload["md5"]:
            return HttpResponseBadRequest("The file does not match its checksum")
        temp.seek(0)
        default_storage.save(upload["path"], File(temp))
    return HttpResponse()
