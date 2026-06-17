from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("drivers", "0010_driverprofile_driver_code"),
        ("locations", "0003_administrative_hierarchy"),
    ]

    operations = [
        migrations.CreateModel(
            name="HallOfFameRecognition",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("category", models.CharField(choices=[("driver_of_month", "Driver of the Month"), ("top_city", "Top Driver by City"), ("top_national", "Top Driver in Mauritania"), ("lifetime_milestone", "Lifetime Milestone")], max_length=30)),
                ("badge", models.CharField(choices=[("gold", "Gold Hall of Fame"), ("silver", "Silver Hall of Fame"), ("bronze", "Bronze Hall of Fame")], max_length=20)),
                ("title", models.CharField(max_length=160)),
                ("year", models.PositiveIntegerField()),
                ("month", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("rank", models.PositiveSmallIntegerField(default=1)),
                ("lifetime_completed_rides", models.PositiveIntegerField(default=0)),
                ("years_with_yala", models.PositiveIntegerField(default=0)),
                ("performance_score", models.PositiveSmallIntegerField(default=0)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("awarded_at", models.DateTimeField(auto_now_add=True)),
                ("city", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="hall_of_fame_recognitions", to="locations.city")),
                ("driver", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="hall_of_fame_recognitions", to="drivers.driverprofile")),
            ],
            options={"ordering": ["-year", "-month", "rank", "driver__user__first_name"]},
        ),
        migrations.AddConstraint(
            model_name="halloffamerecognition",
            constraint=models.UniqueConstraint(fields=("driver", "category", "title", "year", "month"), name="unique_driver_hall_recognition"),
        ),
        migrations.AddIndex(
            model_name="halloffamerecognition",
            index=models.Index(fields=["category", "-year", "-month"], name="hof_category_period_idx"),
        ),
        migrations.AddIndex(
            model_name="halloffamerecognition",
            index=models.Index(fields=["city", "-year"], name="hof_city_year_idx"),
        ),
    ]
