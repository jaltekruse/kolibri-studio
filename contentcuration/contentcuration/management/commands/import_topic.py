import logging

from django.core.management.base import BaseCommand

from contentcuration.utils.import_tools import import_topic

logger = logging.getLogger("command")


class Command(BaseCommand):
    help = (
        "Copy a topic of a published channel, for example from "
        "https://studio.learningequality.org, into a new channel to edit"
    )

    def add_arguments(self, parser):
        parser.add_argument("source_channel_id", help="the published channel")
        parser.add_argument("topic_id", help="the topic's id in that channel")
        parser.add_argument(
            "--editor", required=True, help="email of the user to edit the channel"
        )
        parser.add_argument(
            "--download-url", help="the Studio to download the channel and files from"
        )
        parser.add_argument(
            "--database", help="a local copy of the channel database to read instead"
        )

    def handle(self, *args, **options):
        channel = import_topic(
            options["source_channel_id"],
            options["topic_id"],
            options["editor"],
            download_url=options["download_url"],
            database=options["database"],
        )
        self.stdout.write(f"Created channel {channel.id}: {channel.name}")
