"""Notifier stubs for SMS/email. In production these wrap Twilio/SendGrid APIs."""


def send_sms(phone: str, message: str):
    # stub: replace with Twilio client in production
    print(f"SMS to {phone}: {message}")


def send_email(email: str, subject: str, body: str):
    print(f"Email to {email}: {subject}\n{body}")
