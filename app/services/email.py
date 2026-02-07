import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import get_settings
import asyncio

settings = get_settings()

class EmailService:
    async def send_notification(self, subject: str, body: str):
        """Send a notification email."""
        if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
            print("⚠️ Skipping email - SMTP credentials not set.")
            return

        try:
            msg = MIMEMultipart()
            msg['From'] = settings.SMTP_USER
            msg['To'] = settings.NOTIFICATION_EMAIL
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'html'))

            await asyncio.to_thread(self._send_email_sync, msg)
            print(f"✅ Email notification sent to {settings.NOTIFICATION_EMAIL}")
        except Exception as e:
            print(f"❌ Failed to send email notification: {e}")

    def _send_email_sync(self, msg: MIMEMultipart):
        with smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)

email_service = EmailService()
