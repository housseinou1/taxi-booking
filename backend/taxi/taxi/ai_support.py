import logging
import re
from hashlib import sha256

import requests
from django.conf import settings
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTIONS = """
You are Yala Support AI for a Mauritania ride platform used by riders and drivers.
Reply in the same language as the user's latest message: English, French, or Arabic.
Be concise, calm, practical, and friendly.

You can explain ride booking, pickup and stops, driver onboarding, required Mauritania
vehicle documents, payments, account access, safety tools, ratings, and app navigation.

Important rules:
- Never ask for or repeat passwords, payment card numbers, national ID numbers, license
  numbers, private phone numbers, or authentication codes.
- Never claim that you changed, approved, blocked, refunded, or verified an account.
- For account-specific action, tell the user to open Support and contact Yala staff.
- For an immediate emergency, tell the user to leave the chat and call Mauritania
  Police 117, Ambulance 101, or Fire 118.
- Do not invent prices, policies, driver approval status, or trip information.
- Clearly say when a Yala staff member must review something.
""".strip()


def _client_key(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    address = forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR", "unknown")
    return sha256(address.encode("utf-8")).hexdigest()[:20]


def _rate_limited(request):
    key = f"yala-ai:{_client_key(request)}"
    count = cache.get(key, 0)
    if count >= 20:
        return True
    if count == 0:
        cache.set(key, 1, timeout=60)
    else:
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, timeout=60)
    return False


def _safe_messages(raw_messages):
    messages = []
    if not isinstance(raw_messages, list):
        return messages
    for item in raw_messages[-6:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = str(item.get("content", "")).strip()
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content[:1500]})
    return messages


def _extract_output_text(payload):
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                return content["text"].strip()
    return ""


def _fallback_answer(message):
    text = message.lower()
    is_arabic = bool(re.search(r"[\u0600-\u06ff]", message))
    is_french = any(word in text for word in ("bonjour", "comment", "chauffeur", "course", "paiement", "compte"))

    if any(word in text for word in ("emergency", "urgence", "accident", "danger", "help me", "شرطة", "خطر")):
        return (
            "هذه حالة طارئة. اترك المحادثة واتصل بالشرطة 117 أو الإسعاف 101 أو الإطفاء 118 الآن."
            if is_arabic
            else "En cas d'urgence immédiate, quittez le chat et appelez la Police au 117, l'Ambulance au 101 ou les Pompiers au 118."
            if is_french
            else "For an immediate emergency, leave the chat and call Police 117, Ambulance 101, or Fire 118 now."
        )
    if any(word in text for word in ("document", "license", "licence", "vignette", "assurance", "carte grise", "وثائق")):
        return (
            "يحتاج السائق إلى: الفينييت، التأمين مع تاريخ الانتهاء، رخصة القيادة مع تاريخ الإصدار والانتهاء، البطاقة الرمادية، ورقم اللوحة. يجب أن يراجع فريق يالا الوثائق."
            if is_arabic
            else "Le chauffeur doit fournir : vignette, assurance avec expiration, permis avec dates de délivrance et d'expiration, carte grise et plaque d'immatriculation. L'équipe Yala doit vérifier les documents."
            if is_french
            else "Drivers need a vignette, insurance with expiry date, driver license with issue and expiry dates, carte grise, and plate number. Yala staff must review the documents."
        )
    if any(word in text for word in ("payment", "pay", "refund", "paiement", "rembourse", "دفع")):
        return (
            "افتح صفحة المدفوعات للتحقق من الطريقة والإيصال. لطلب استرداد أو مراجعة عملية محددة، تواصل مع دعم يالا ولا ترسل رقم بطاقتك في الدردشة."
            if is_arabic
            else "Ouvrez la page Paiements pour vérifier le moyen de paiement et le reçu. Pour un remboursement ou une transaction précise, contactez le support Yala sans envoyer votre numéro de carte dans le chat."
            if is_french
            else "Open Payments to check the method and receipt. For a refund or a specific transaction, contact Yala Support and never send your card number in chat."
        )
    if any(word in text for word in ("login", "password", "connexion", "mot de passe", "دخول", "كلمة")):
        return (
            "تحقق من البريد وكلمة المرور ثم استخدم إعادة تعيين كلمة المرور إذا لزم الأمر. لا ترسل كلمة المرور أو رمز التحقق لأي شخص."
            if is_arabic
            else "Vérifiez votre e-mail et votre mot de passe, puis utilisez la réinitialisation si nécessaire. Ne partagez jamais votre mot de passe ou code de vérification."
            if is_french
            else "Check your email and password, then use password reset if needed. Never share your password or verification code."
        )
    if any(word in text for word in ("ride", "trip", "stop", "course", "arrêt", "رحلة", "توقف")):
        return (
            "اختر نقطة الالتقاط والوجهة، وأضف التوقفات قبل تأكيد الرحلة. بعد قبول السائق يمكنك متابعة الوصول والرحلة مباشرة."
            if is_arabic
            else "Choisissez le départ et la destination, puis ajoutez les arrêts avant de confirmer. Après acceptation, vous pouvez suivre l'arrivée du chauffeur et la course en direct."
            if is_french
            else "Choose pickup and destination, then add stops before confirming. After a driver accepts, you can track the arrival and trip live."
        )
    return (
        "يمكنني المساعدة في الرحلات والحسابات ووثائق السائق والمدفوعات والأمان. اكتب سؤالك بتفاصيل عامة فقط، بدون معلومات شخصية."
        if is_arabic
        else "Je peux aider avec les courses, comptes, documents chauffeur, paiements et sécurité. Posez votre question avec des détails généraux, sans informations personnelles."
        if is_french
        else "I can help with rides, accounts, driver documents, payments, and safety. Ask your question using general details only, without personal information."
    )


def _openai_answer(messages, context):
    response = requests.post(
        "https://api.openai.com/v1/responses",
        headers={
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": settings.OPENAI_MODEL,
            "instructions": f"{SYSTEM_INSTRUCTIONS}\nNon-sensitive app context: {context}",
            "input": messages,
        },
        timeout=20,
    )
    response.raise_for_status()
    return _extract_output_text(response.json())


@api_view(["POST"])
@permission_classes([AllowAny])
def support_ai(request):
    if _rate_limited(request):
        return Response({"detail": "Please wait a moment before asking another question."}, status=429)

    message = str(request.data.get("message", "")).strip()
    if not message:
        return Response({"detail": "Please enter a question."}, status=400)
    if len(message) > 1500:
        return Response({"detail": "Please shorten your question."}, status=400)

    messages = _safe_messages(request.data.get("messages", []))
    if not messages or messages[-1].get("content") != message:
        messages.append({"role": "user", "content": message})

    context = str(request.data.get("context", "website"))[:120]
    answer = ""
    source = "yala"

    if settings.YALA_AI_ENABLED and settings.OPENAI_API_KEY:
        try:
            answer = _openai_answer(messages, context)
            source = "ai"
        except requests.RequestException:
            logger.exception("OpenAI support request failed")

    if not answer:
        answer = _fallback_answer(message)

    return Response({"answer": answer, "source": source})
