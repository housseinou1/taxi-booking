# Yala Safety and Emergency Production Architecture

## Implemented Workflow

1. Rider or driver presses SOS during an active ride.
2. The mobile client requests high-accuracy GPS and posts the ride ID and coordinates.
3. The API verifies that the user belongs to the active ride.
4. A critical, immutable incident history record is created with a ride snapshot.
5. An emergency alert record captures notification delivery and emergency-contact snapshots.
6. Priority push notifications are sent immediately to active admin accounts and the ride counterpart.
7. Admin staff acknowledge, investigate, and resolve the incident from the Emergency dashboard.

Normal safety incidents and rider/driver reports use the same incident history and resolution workflow.
Live-trip sharing uses random, expiring, revocable tokens and does not expose user IDs.

## Required Production Configuration

- Configure Firebase service-account credentials and verify Android/iOS high-priority push delivery.
- Run the Django API behind HTTPS only.
- Operate Channels through Redis and route `admin_safety` events to a staffed dispatch console.
- Configure a dedicated 24/7 safety phone number and escalation rota.
- Add an SMS/voice provider for emergency contacts and dispatch fallback when push delivery fails.
- Add a background task queue for notification retries, delivery receipts, and escalation timers.
- Encrypt sensitive database backups and restrict safety records to authorized staff.
- Define retention periods, audit-log access, incident export, and law-enforcement request procedures.
- Monitor open critical incidents, push failures, API latency, and dispatch acknowledgment time.

## Recommended Escalation Targets

- Critical SOS: alert instantly, acknowledge within 60 seconds, escalate by SMS/voice after 90 seconds.
- High-severity report: review within 15 minutes.
- Medium/low reports: review within one business day.
- Never automatically contact police solely from an app event without a locally approved operating procedure.

## Data Retention

Keep incident history and resolution records according to Yala's legal and safety policy. Trip-sharing
links expire after 24 hours. Emergency-contact snapshots are attached to SOS alerts so responders retain
the information that was available when the emergency occurred.
