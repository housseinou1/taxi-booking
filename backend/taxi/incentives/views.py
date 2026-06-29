"""
Driver Incentive & Bonus API.
"""
from decimal import Decimal
from django.db.models import Sum, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import status

from .models import IncentiveProgram, DriverIncentiveProgress, BonusPayment


# ─── Driver endpoints ──────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def available_programs(request):
    """List active incentive programs the driver can join."""
    programs = IncentiveProgram.objects.filter(status="active")
    active = [p for p in programs if p.is_currently_active]
    # Get driver's existing enrollments
    enrolled_ids = set(
        DriverIncentiveProgress.objects.filter(driver=request.user).values_list("program_id", flat=True)
    )
    return Response([{
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "type": p.incentive_type,
        "bonus_amount": float(p.bonus_amount),
        "target": p.target_value,
        "ends_at": p.ends_at,
        "city": p.city.name if p.city else "All cities",
        "enrolled": p.id in enrolled_ids,
    } for p in active])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def enroll_program(request, program_id):
    """Driver enrolls in an incentive program."""
    program = get_object_or_404(IncentiveProgram, id=program_id, status="active")
    if not program.is_currently_active:
        return Response({"error": "Program is not currently active."}, status=status.HTTP_400_BAD_REQUEST)

    progress, created = DriverIncentiveProgress.objects.get_or_create(
        driver=request.user, program=program,
        defaults={"status": "in_progress"}
    )
    if not created:
        return Response({"error": "Already enrolled.", "progress": progress.progress_percent}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        "message": f"Enrolled in {program.name}!",
        "target": program.target_value,
        "bonus": float(program.bonus_amount),
    }, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_progress(request):
    """Driver's incentive progress and history."""
    active = DriverIncentiveProgress.objects.filter(
        driver=request.user, status="in_progress"
    ).select_related("program")
    completed = DriverIncentiveProgress.objects.filter(
        driver=request.user, status__in=["completed", "paid"]
    ).select_related("program")

    total_earned = BonusPayment.objects.filter(driver=request.user).aggregate(t=Sum("amount"))["t"] or 0

    return Response({
        "total_bonus_earned": float(total_earned),
        "active_goals": [{
            "program": p.program.name,
            "type": p.program.incentive_type,
            "current": p.current_value,
            "target": p.program.target_value,
            "progress_percent": p.progress_percent,
            "bonus": float(p.program.bonus_amount),
        } for p in active],
        "completed": [{
            "program": p.program.name,
            "bonus_earned": float(p.bonus_earned),
            "completed_at": p.completed_at,
            "status": p.status,
        } for p in completed[:10]],
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_bonus_history(request):
    """Driver's bonus payment history."""
    payments = BonusPayment.objects.filter(driver=request.user)
    return Response([{
        "amount": float(p.amount),
        "reason": p.reason,
        "paid_at": p.paid_at,
        "program": p.program.name if p.program else "Manual",
    } for p in payments[:20]])


# ─── Admin endpoints ───────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def admin_programs(request):
    """Admin: list or create incentive programs."""
    if request.method == "GET":
        programs = IncentiveProgram.objects.all()
        return Response([{
            "id": p.id, "name": p.name, "type": p.incentive_type,
            "bonus": float(p.bonus_amount), "target": p.target_value,
            "status": p.status, "participants": p.participants.count(),
            "completed": p.participants.filter(status__in=["completed", "paid"]).count(),
            "total_paid": float(BonusPayment.objects.filter(program=p).aggregate(t=Sum("amount"))["t"] or 0),
        } for p in programs])

    program = IncentiveProgram.objects.create(
        name=request.data.get("name", "New Bonus"),
        description=request.data.get("description", ""),
        incentive_type=request.data.get("type", "ride_count"),
        bonus_amount=Decimal(str(request.data.get("bonus_amount", 200))),
        target_value=request.data.get("target", 10),
        city_id=request.data.get("city_id"),
        starts_at=request.data.get("starts_at") or timezone.now(),
        ends_at=request.data.get("ends_at"),
    )
    return Response({"id": program.id, "name": program.name}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_pay_bonus(request):
    """Admin: manually pay a bonus to a driver."""
    from django.contrib.auth import get_user_model
    User = get_user_model()

    driver = get_object_or_404(User, id=request.data.get("driver_id"))
    amount = Decimal(str(request.data.get("amount", 0)))
    if amount <= 0:
        return Response({"error": "Amount must be positive."}, status=status.HTTP_400_BAD_REQUEST)

    payment = BonusPayment.objects.create(
        driver=driver,
        program_id=request.data.get("program_id"),
        amount=amount,
        reason=request.data.get("reason", "Manual bonus"),
        admin_note=request.data.get("note", ""),
    )
    try:
        from notifications.push import notify_courier_bonus

        notify_courier_bonus(driver, amount, payment.reason, program_id=payment.program_id)
    except Exception:
        pass
    return Response({"message": f"{amount} MRU bonus paid to {driver.email}", "id": payment.id}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_incentive_analytics(request):
    """Admin: incentive program analytics."""
    total_programs = IncentiveProgram.objects.count()
    active_programs = IncentiveProgram.objects.filter(status="active").count()
    total_paid = float(BonusPayment.objects.aggregate(t=Sum("amount"))["t"] or 0)
    total_bonuses = BonusPayment.objects.count()
    active_participants = DriverIncentiveProgress.objects.filter(status="in_progress").count()
    completed_goals = DriverIncentiveProgress.objects.filter(status__in=["completed", "paid"]).count()

    # Top earners
    top_drivers = (
        BonusPayment.objects.values("driver__first_name", "driver__last_name", "driver__email")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("-total")[:10]
    )

    return Response({
        "total_programs": total_programs,
        "active_programs": active_programs,
        "total_bonus_paid": total_paid,
        "total_bonus_payments": total_bonuses,
        "active_participants": active_participants,
        "completed_goals": completed_goals,
        "top_earners": [{
            "name": f"{d['driver__first_name']} {d['driver__last_name']}",
            "email": d["driver__email"],
            "total_earned": float(d["total"]),
            "bonuses_received": d["count"],
        } for d in top_drivers],
    })
