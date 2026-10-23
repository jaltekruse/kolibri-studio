"""
The YouTube ids of videos that are also on YouTube. Publishing puts a video's
YouTube id in its options, so Kolibri can play it from YouTube instead of
sending its own copy.
"""
import re
import uuid
from urllib.parse import parse_qs
from urllib.parse import urlsplit

from le_utils.constants import format_presets

YOUTUBE_ID = re.compile(r"^[\w-]{11}$")

YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}

# The paths on YouTube that end in a video's id, as in youtube.com/embed/<id>
YOUTUBE_ID_PATHS = {"embed", "shorts", "live", "v"}

VIDEO_PRESETS = (format_presets.VIDEO_HIGH_RES, format_presets.VIDEO_LOW_RES)


def _source_domains(*domains):
    # Ricecooker sends a node's source_domain as the namespace of its content_id,
    # made from the channel's domain, rather than as the domain itself
    return {
        source_domain
        for domain in domains
        for source_domain in (domain, uuid.uuid5(uuid.NAMESPACE_DNS, domain).hex)
    }


YOUTUBE_SOURCE_DOMAINS = _source_domains("youtube.com", "www.youtube.com")

# Khan Academy's chef sets a video's source_id to the YouTube id of the English
# video, which is not the YouTube video for a dubbed one
KHAN_ACADEMY_SOURCE_DOMAINS = _source_domains("khanacademy.org")


def youtube_id_from_url(url):
    """
    The id of the YouTube video at a URL, or None if it is not one.
    """
    parts = urlsplit(url or "")
    host = (parts.hostname or "").lower()
    segments = [segment for segment in parts.path.split("/") if segment]
    if host == "youtu.be" and segments:
        youtube_id = segments[0]
    elif host in YOUTUBE_HOSTS and segments == ["watch"]:
        youtube_id = parse_qs(parts.query).get("v", [""])[0]
    elif (
        host in YOUTUBE_HOSTS and len(segments) == 2 and segments[0] in YOUTUBE_ID_PATHS
    ):
        youtube_id = segments[1]
    else:
        return None
    return youtube_id if YOUTUBE_ID.match(youtube_id) else None


def get_youtube_id(node):
    """
    The YouTube id of a video node, or None if it is not known to be on YouTube:
    from the URL its video file was downloaded from, or from its source_id when
    that is a YouTube id.
    """
    source_urls = node.files.filter(preset_id__in=VIDEO_PRESETS).values_list(
        "source_url", flat=True
    )
    for source_url in source_urls:
        youtube_id = youtube_id_from_url(source_url)
        if youtube_id:
            return youtube_id

    source_id = node.source_id or ""
    if not YOUTUBE_ID.match(source_id):
        return None
    if node.source_domain in YOUTUBE_SOURCE_DOMAINS:
        return source_id
    language = (node.language_id or "").split("-")[0]
    if node.source_domain in KHAN_ACADEMY_SOURCE_DOMAINS and language == "en":
        return source_id
    return None
