"""
Read-only inventory of duplicate (wallet, reference) before migration 0022.

Usage:
  python manage.py wallet_reference_inventory
  python manage.py wallet_reference_inventory --json engineering/wallet-0022-inventory.json
"""

from __future__ import annotations

import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db.models import Count

from payments.models import WalletTransaction


class Command(BaseCommand):
    help = "List duplicate wallet transaction references (read-only, no data changes)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--json",
            dest="json_path",
            default="",
            help="Optional path to write JSON report",
        )

    def handle(self, *args, **options):
        dup_groups = (
            WalletTransaction.objects.exclude(reference="")
            .values("wallet_id", "reference")
            .annotate(c=Count("id"))
            .filter(c__gt=1)
            .order_by("-c")
        )
        rows = []
        for g in dup_groups:
            ids = list(
                WalletTransaction.objects.filter(
                    wallet_id=g["wallet_id"],
                    reference=g["reference"],
                )
                .order_by("id")
                .values_list("id", "amount", "created_at")
            )
            rows.append(
                {
                    "wallet_id": g["wallet_id"],
                    "reference": g["reference"],
                    "count": g["c"],
                    "transactions": [
                        {"id": i, "amount": str(a), "created_at": c.isoformat() if c else None}
                        for i, a, c in ids
                    ],
                    "proposed_fix": f"keep id {ids[0][0]}; relabel others to {{reference}}#dup{{id}}",
                }
            )

        report = {
            "duplicate_groups": len(rows),
            "groups": rows,
            "policy": "No deletes; amounts unchanged; migration 0022 applies #dup relabel",
        }
        self.stdout.write(f"Duplicate reference groups: {len(rows)}")
        for row in rows[:20]:
            self.stdout.write(
                f"  wallet={row['wallet_id']} ref={row['reference']!r} count={row['count']} ids="
                + ",".join(str(t["id"]) for t in row["transactions"])
            )
        if len(rows) > 20:
            self.stdout.write(f"  ... and {len(rows) - 20} more (see JSON)")

        path = (options.get("json_path") or "").strip()
        if path:
            out = Path(path)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(report, indent=2), encoding="utf-8")
            self.stdout.write(self.style.SUCCESS(f"Wrote {out}"))
