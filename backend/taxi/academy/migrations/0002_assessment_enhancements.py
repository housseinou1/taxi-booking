# Generated manually for Phase 39 academy enhancements

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("academy", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="exam_duration_minutes",
            field=models.PositiveIntegerField(
                default=0,
                help_text="Timed exam duration in minutes. 0 = untimed.",
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="randomize_questions",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="assessmentattempt",
            name="expires_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="assessmentattempt",
            name="question_ids",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
