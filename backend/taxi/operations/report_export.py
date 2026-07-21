"""Export helpers for executive dashboard reports."""

from __future__ import annotations

import csv
import io
from html import escape


def export_csv(rows: list[dict]) -> bytes:
    buffer = io.StringIO()
    if not rows:
        writer = csv.writer(buffer)
        writer.writerow(["message"])
        writer.writerow(["No records"])
        return buffer.getvalue().encode("utf-8-sig")

    fieldnames = list(rows[0].keys())
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8-sig")


def export_excel(rows: list[dict]) -> bytes:
    try:
        from openpyxl import Workbook
    except ImportError:
        return export_csv(rows)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Executive Report"
    if not rows:
        sheet.append(["message"])
        sheet.append(["No records"])
    else:
        headers = list(rows[0].keys())
        sheet.append(headers)
        for row in rows:
            sheet.append([row.get(key, "") for key in headers])
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


def export_pdf(rows: list[dict], title: str = "Yala Executive Report") -> bytes:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.pdfgen import canvas
    except ImportError:
        lines = [title, ""]
        if not rows:
            lines.append("No records")
        else:
            headers = list(rows[0].keys())
            lines.append(" | ".join(headers))
            for row in rows[:200]:
                lines.append(" | ".join(str(row.get(key, "")) for key in headers))
        return "\n".join(lines).encode("utf-8")

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 2 * cm
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(2 * cm, y, title)
    y -= 1.2 * cm
    pdf.setFont("Helvetica", 9)

    if not rows:
        pdf.drawString(2 * cm, y, "No records")
    else:
        headers = list(rows[0].keys())
        pdf.drawString(2 * cm, y, " | ".join(headers[:6]))
        y -= 0.6 * cm
        for row in rows[:120]:
            if y < 2 * cm:
                pdf.showPage()
                y = height - 2 * cm
                pdf.setFont("Helvetica", 9)
            line = " | ".join(str(row.get(key, ""))[:24] for key in headers[:6])
            pdf.drawString(2 * cm, y, escape(line)[:120])
            y -= 0.45 * cm

    pdf.save()
    return buffer.getvalue()
