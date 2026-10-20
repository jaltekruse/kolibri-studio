"""
Pages are document nodes written in Studio's editor rather than uploaded. A page
keeps its content as Markdown, in the node's extra_fields, so it stays easy to
read, diff and convert. Publishing turns it into a kpub, which Kolibri shows with
its article viewer.
"""
import html
import re
import zipfile
from tempfile import NamedTemporaryFile

from django.core.files import File as DjangoFile
from django.core.files.storage import default_storage as storage
from le_utils.constants import exercises
from le_utils.constants import file_formats
from le_utils.constants import format_presets

from contentcuration.constants.contentnode import PAGE_MARKDOWN
from contentcuration.models import File
from contentcuration.models import generate_object_storage_name
from contentcuration.utils.assessment.markdown import render_markdown


# The editor writes an image as ![alt](${☣ CONTENTSTORAGE}/<checksum>.<ext>), with
# an optional " =WxH align=..." suffix.
IMAGE_REFERENCE_PREFIX = "${}/".format(exercises.CONTENT_STORAGE_PLACEHOLDER)
IMAGE_FILENAME_REGEX = re.compile(
    re.escape(IMAGE_REFERENCE_PREFIX) + r"([a-f0-9]{32})\.([0-9a-z]+)"
)

# Same values as the exercise archives, so an unchanged page makes the same file
ZIP_DATE_TIME = (2015, 10, 21, 7, 28, 0)

PAGE_HTML = """<!DOCTYPE html>
<html lang="{language}">
<head>
<meta charset="utf-8">
<title>{title}</title>
</head>
<body>
{body}
</body>
</html>
"""


def get_page_images(markdown):
    """
    The images a page's Markdown shows, as a dict of checksum to file extension.
    """
    return dict(IMAGE_FILENAME_REGEX.findall(markdown or ""))


def set_page_image_files(nodes, user):
    """
    Attach the images each page shows to it, and detach the ones it no longer
    shows. Attached, an image counts toward the author's storage, is copied
    with the page, and is kept by file clean up. The editor uploads images
    before they are in a page, so they start out attached to nothing.
    """
    for node in nodes:
        images = get_page_images(node.extra_fields.get(PAGE_MARKDOWN))
        current_files = node.files.filter(preset_id=format_presets.EXERCISE_IMAGE)
        current_files.exclude(checksum__in=images.keys()).delete()
        missing = set(images).difference(
            current_files.values_list("checksum", flat=True)
        )
        if not missing:
            continue

        uploaded = {
            f.checksum: f
            for f in File.objects.filter(
                checksum__in=missing,
                uploaded_by=user,
                preset_id=format_presets.EXERCISE_IMAGE,
                contentnode__isnull=True,
                assessment_item__isnull=True,
                slideshow_slide__isnull=True,
            )
        }
        for checksum in missing:
            file = uploaded.get(checksum)
            if file is None:
                # Uploaded by someone else, or its unattached record was cleaned
                # up; the image itself is still in storage.
                ext = images[checksum]
                file = File(
                    checksum=checksum,
                    file_on_disk=generate_object_storage_name(
                        checksum, f"{checksum}.{ext}"
                    ),
                    file_format_id=ext,
                    preset_id=format_presets.EXERCISE_IMAGE,
                    uploaded_by=user,
                )
            file.contentnode = node
            file.save()


def render_page(markdown, title, language):
    """
    The page as a standalone HTML document, with its images next to it.
    """
    body = render_markdown((markdown or "").replace(IMAGE_REFERENCE_PREFIX, ""))
    return PAGE_HTML.format(
        language=html.escape(language or "", quote=True),
        title=html.escape(title or ""),
        body=body.strip(),
    )


def _write_to_zip(zf, path, content):
    info = zipfile.ZipInfo(path, date_time=ZIP_DATE_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 0
    zf.writestr(info, content)


def create_page_archive(node, language=None, user_id=None):
    """
    Publish a page as a kpub: its HTML as index.html, and the images it shows.
    Replaces the kpub made the last time it was published.
    """
    markdown = node.extra_fields.get(PAGE_MARKDOWN)
    filename = f"{node.title}.{file_formats.HTML5_ARTICLE}"
    with NamedTemporaryFile(suffix=".zip") as tempf:
        with zipfile.ZipFile(tempf, "w") as zf:
            _write_to_zip(
                zf,
                "index.html",
                render_page(markdown, node.title, language).encode("utf-8"),
            )
            for checksum, ext in sorted(get_page_images(markdown).items()):
                image_name = f"{checksum}.{ext}"
                with storage.open(
                    generate_object_storage_name(checksum, image_name), "rb"
                ) as image:
                    _write_to_zip(zf, image_name, image.read())
        file_size = tempf.tell()
        tempf.seek(0)

        node.files.filter(preset_id=format_presets.KPUB_ZIP).delete()
        File.objects.create(
            file_on_disk=DjangoFile(tempf, name=filename),
            contentnode=node,
            file_format_id=file_formats.HTML5_ARTICLE,
            preset_id=format_presets.KPUB_ZIP,
            original_filename=filename,
            file_size=file_size,
            uploaded_by_id=user_id,
        )
