from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0015_driver_withdrawal_production"),
    ]

    operations = [
        migrations.AddField(
            model_name="withdrawalrequest",
            name="idempotency_key",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="withdrawalrequest",
            name="reference",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="withdrawalrequest",
            name="payment_reference",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddConstraint(
            model_name="withdrawalrequest",
            constraint=models.UniqueConstraint(
                fields=("driver", "idempotency_key"),
                condition=models.Q(idempotency_key__gt=""),
                name="uniq_driver_withdrawal_idempotency_key",
            ),
        ),
    ]
