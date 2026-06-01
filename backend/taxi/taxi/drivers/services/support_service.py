"""
Support Service

Manages emergency protocol, live chat session initiation, and FAQ
for the Premium Driver App Support Center.

Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
"""

import time
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from taxi.drivers.models import DriverProfile, SupportTicket


# FAQ data organized by category with keyword-searchable entries.
# In a production system this could be stored in the database,
# but for the MVP we use a static structure for fast keyword search.
FAQ_DATA = [
    {
        "category": "Account & Profile",
        "questions": [
            {
                "id": 1,
                "question": "How do I update my profile photo?",
                "answer": (
                    "Go to the Document Center, select 'Profile Photo', "
                    "and upload a new image in JPEG or PNG format (max 10 MB)."
                ),
                "keywords": ["profile", "photo", "picture", "update", "change"],
            },
            {
                "id": 2,
                "question": "How do I change my phone number?",
                "answer": (
                    "Contact support through the live chat to request a phone "
                    "number change. For security, this requires identity verification."
                ),
                "keywords": ["phone", "number", "change", "update", "contact"],
            },
            {
                "id": 3,
                "question": "How do I reset my PIN?",
                "answer": (
                    "Go to Settings > Security > PIN Lock and tap 'Reset PIN'. "
                    "You will need to verify your identity via SMS code."
                ),
                "keywords": ["pin", "reset", "security", "lock", "password"],
            },
        ],
    },
    {
        "category": "Rides & Earnings",
        "questions": [
            {
                "id": 4,
                "question": "How is my fare calculated?",
                "answer": (
                    "Fares are calculated based on distance (km), time, "
                    "base fare, and any applicable surge pricing. "
                    "All amounts are displayed in MRU."
                ),
                "keywords": ["fare", "price", "calculate", "cost", "earnings", "money"],
            },
            {
                "id": 5,
                "question": "Why was my ride cancelled?",
                "answer": (
                    "Rides can be cancelled by the rider, by you, or by the system "
                    "(e.g., if the acceptance timer expires). Check your ride history "
                    "for details on specific cancellations."
                ),
                "keywords": ["cancel", "cancelled", "ride", "why", "reason"],
            },
            {
                "id": 6,
                "question": "When do I receive my earnings?",
                "answer": (
                    "Earnings are updated in real-time after each completed ride. "
                    "Withdrawals are processed according to the payment schedule "
                    "configured in your payment settings."
                ),
                "keywords": ["earnings", "payment", "withdraw", "receive", "money", "pay"],
            },
        ],
    },
    {
        "category": "Documents & Verification",
        "questions": [
            {
                "id": 7,
                "question": "What documents do I need to upload?",
                "answer": (
                    "You need to upload: Driver License, National ID, Insurance, "
                    "Vehicle Registration, and a Profile Photo. All documents must "
                    "be in JPEG, PNG, or PDF format (max 10 MB each)."
                ),
                "keywords": ["document", "upload", "required", "license", "id", "insurance"],
            },
            {
                "id": 8,
                "question": "How long does document review take?",
                "answer": (
                    "Document reviews are typically completed within 24-48 hours. "
                    "You will receive a notification when your document is approved "
                    "or if additional information is needed."
                ),
                "keywords": ["review", "document", "time", "long", "approval", "pending"],
            },
            {
                "id": 9,
                "question": "My document was rejected. What should I do?",
                "answer": (
                    "Check the rejection reason in the Document Center. Common issues "
                    "include blurry images, expired documents, or mismatched information. "
                    "Upload a corrected version to resubmit."
                ),
                "keywords": ["rejected", "document", "resubmit", "fix", "upload"],
            },
        ],
    },
    {
        "category": "Safety & Emergency",
        "questions": [
            {
                "id": 10,
                "question": "How does the Emergency button work?",
                "answer": (
                    "Tapping the Emergency button immediately shares your GPS location "
                    "with our support team and creates a priority support ticket. "
                    "A support agent will be assigned within seconds."
                ),
                "keywords": ["emergency", "button", "safety", "help", "sos"],
            },
            {
                "id": 11,
                "question": "What should I do in case of an accident?",
                "answer": (
                    "First, ensure everyone's safety and call emergency services if needed. "
                    "Then tap the Emergency button in the app to alert our support team. "
                    "Document the scene with photos if possible."
                ),
                "keywords": ["accident", "crash", "emergency", "safety", "incident"],
            },
        ],
    },
    {
        "category": "Levels & Rewards",
        "questions": [
            {
                "id": 12,
                "question": "How do I level up?",
                "answer": (
                    "Your level is determined by completed rides, average rating, "
                    "acceptance rate, and completion rate. Meet all thresholds for "
                    "the next level to advance. Check the Level Info screen for details."
                ),
                "keywords": ["level", "upgrade", "advance", "progress", "rank"],
            },
            {
                "id": 13,
                "question": "Can I lose my level?",
                "answer": (
                    "Yes. If your metrics fall below your current level's thresholds "
                    "for 7 consecutive days, you'll receive a warning. If they remain "
                    "below for another 7 days, you'll be demoted to the previous level."
                ),
                "keywords": ["level", "lose", "demote", "downgrade", "drop"],
            },
            {
                "id": 14,
                "question": "How do reward points work?",
                "answer": (
                    "You earn points for completed rides, high ratings (4+ stars), "
                    "and consecutive online hours. Points can be redeemed for rewards "
                    "on the Rewards screen."
                ),
                "keywords": ["reward", "points", "earn", "redeem"],
            },
        ],
    },
]


class SupportService:
    """
    Service responsible for handling emergency protocols, live chat
    session initiation, and FAQ search for the Driver Support Center.
    """

    # Maximum time (in seconds) to share GPS after emergency tap
    EMERGENCY_GPS_TIMEOUT = 5

    def initiate_emergency(self, driver_profile, current_lat=None, current_lng=None):
        """
        Initiate the emergency protocol for a driver.

        Shares the driver's GPS location with the support team within 5 seconds.
        If current GPS is unavailable, falls back to the last known location
        stored on the driver profile.

        Args:
            driver_profile: DriverProfile instance
            current_lat: Current GPS latitude (None if unavailable)
            current_lng: Current GPS longitude (None if unavailable)

        Returns:
            Dict with:
            - 'ticket': The created SupportTicket instance
            - 'location_lat': Latitude shared with support
            - 'location_lng': Longitude shared with support
            - 'location_current': Boolean indicating if location is current GPS
            - 'message': Status message for the driver
        """
        start_time = time.time()

        # Determine location: use current GPS if available, else fallback
        location_current = True
        if current_lat is not None and current_lng is not None:
            location_lat = current_lat
            location_lng = current_lng
        else:
            # Fallback to last known location from driver profile
            location_current = False
            location_lat = driver_profile.current_lat
            location_lng = driver_profile.current_lng

        # Create emergency support ticket with location
        ticket = SupportTicket.objects.create(
            driver=driver_profile,
            ticket_type="emergency",
            status="open",
            subject="Emergency Alert",
            message="Driver initiated emergency protocol.",
            location_lat=location_lat,
            location_lng=location_lng,
        )

        elapsed = time.time() - start_time

        # Build response message
        if location_current:
            message = "Emergency alert sent. Your current GPS location has been shared with the support team."
        else:
            message = (
                "Emergency alert sent. Your last known location has been shared "
                "with the support team. Note: the location shared may not be current."
            )

        return {
            "ticket": ticket,
            "location_lat": location_lat,
            "location_lng": location_lng,
            "location_current": location_current,
            "message": message,
            "response_time_ms": int(elapsed * 1000),
        }

    def initiate_live_chat(self, driver_profile, subject="", message=""):
        """
        Initiate a live chat session with a support agent.

        Creates a support ticket of type 'live_chat' and returns a
        confirmation that the request has been queued.

        Args:
            driver_profile: DriverProfile instance
            subject: Optional subject for the chat session
            message: Optional initial message

        Returns:
            Dict with:
            - 'ticket': The created SupportTicket instance
            - 'queue_position': Estimated queue position
            - 'message': Confirmation message for the driver
        """
        # Create live chat support ticket
        ticket = SupportTicket.objects.create(
            driver=driver_profile,
            ticket_type="live_chat",
            status="open",
            subject=subject or "Live Chat Request",
            message=message,
            location_lat=driver_profile.current_lat,
            location_lng=driver_profile.current_lng,
        )

        # Calculate approximate queue position based on open live chat tickets
        queue_position = SupportTicket.objects.filter(
            ticket_type="live_chat",
            status="open",
            created_at__lte=ticket.created_at,
        ).count()

        return {
            "ticket": ticket,
            "queue_position": queue_position,
            "message": (
                f"Your chat request has been queued. "
                f"You are number {queue_position} in the queue. "
                f"A support agent will be with you shortly."
            ),
        }

    def get_faq(self, category=None):
        """
        Get FAQ articles organized by category.

        Args:
            category: Optional category name to filter by.
                      If None, returns all categories.

        Returns:
            List of category dicts, each containing:
            - 'category': Category name
            - 'questions': List of question dicts with 'id', 'question', 'answer'
        """
        if category:
            # Filter to specific category (case-insensitive)
            results = [
                {
                    "category": cat["category"],
                    "questions": [
                        {
                            "id": q["id"],
                            "question": q["question"],
                            "answer": q["answer"],
                        }
                        for q in cat["questions"]
                    ],
                }
                for cat in FAQ_DATA
                if cat["category"].lower() == category.lower()
            ]
            return results
        else:
            # Return all categories without keywords (internal field)
            return [
                {
                    "category": cat["category"],
                    "questions": [
                        {
                            "id": q["id"],
                            "question": q["question"],
                            "answer": q["answer"],
                        }
                        for q in cat["questions"]
                    ],
                }
                for cat in FAQ_DATA
            ]

    def search_faq(self, query):
        """
        Search FAQ articles by keyword.

        Performs case-insensitive keyword matching against question text,
        answer text, and keyword tags.

        Args:
            query: Search string (keywords)

        Returns:
            List of matching question dicts with 'id', 'question', 'answer',
            and 'category' fields. Returns results within 3 seconds of query
            submission as per requirement 10.6.
        """
        if not query or not query.strip():
            return []

        query_lower = query.strip().lower()
        query_terms = query_lower.split()

        results = []

        for cat in FAQ_DATA:
            for q in cat["questions"]:
                # Check if any query term matches keywords, question, or answer
                match = False
                for term in query_terms:
                    # Check keywords list
                    if any(term in kw for kw in q["keywords"]):
                        match = True
                        break
                    # Check question text
                    if term in q["question"].lower():
                        match = True
                        break
                    # Check answer text
                    if term in q["answer"].lower():
                        match = True
                        break

                if match:
                    results.append({
                        "id": q["id"],
                        "question": q["question"],
                        "answer": q["answer"],
                        "category": cat["category"],
                    })

        return results

    def get_driver_tickets(self, driver_profile, status=None, ticket_type=None):
        """
        Get support tickets for a driver, optionally filtered by status or type.

        Args:
            driver_profile: DriverProfile instance
            status: Optional status filter ('open', 'in_progress', 'resolved', 'closed')
            ticket_type: Optional type filter ('emergency', 'live_chat', 'contact_form')

        Returns:
            QuerySet of SupportTicket instances ordered by creation date (newest first).
        """
        qs = SupportTicket.objects.filter(driver=driver_profile)

        if status:
            qs = qs.filter(status=status)

        if ticket_type:
            qs = qs.filter(ticket_type=ticket_type)

        return qs.order_by("-created_at")
