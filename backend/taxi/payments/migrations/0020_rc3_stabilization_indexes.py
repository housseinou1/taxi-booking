# Generated manually for RC3 stabilization indexes

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0019_alter_payment_method"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="payment",
            index=models.Index(fields=["ride_id", "status"], name="payment_ride_status_idx"),
        ),
        migrations.AddIndex(
            model_name="withdrawalrequest",
            index=models.Index(fields=["status", "-created_at"], name="withdrawal_status_created_idx"),
        ),
        migrations.AddIndex(
            model_name="refundrequest",
            index=models.Index(fields=["status", "-created_at"], name="refund_status_created_idx"),
        ),
        migrations.AddIndex(
            model_name="paymentrecord",
            index=models.Index(fields=["method", "status", "-created_at"], name="payrec_method_status_idx"),
        ),
    ]
