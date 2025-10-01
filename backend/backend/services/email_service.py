# backend/services/email_service.py
import os
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional


class EmailService:
    def __init__(self):
        # Email configuration from environment variables
        self.smtp_server = os.getenv("EMAIL_SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("EMAIL_SMTP_PORT", "587"))
        self.smtp_username = os.getenv("EMAIL_SMTP_USERNAME", "")
        self.smtp_password = os.getenv("EMAIL_SMTP_PASSWORD", "")
        self.from_email = os.getenv("EMAIL_FROM", "noreply@harmonic.com")
        
    def send_completion_email(
        self, 
        to_email: str, 
        job_id: str, 
        collection_id: str, 
        companies_added: int,
        collection_name: Optional[str] = None
    ) -> bool:
        """Send email notification when bulk operation completes"""
        try:
            # Create message
            msg = MIMEMultipart()
            msg['From'] = self.from_email
            msg['To'] = to_email
            msg['Subject'] = "Your bulk operation is complete!"
            
            # Email body
            body = f"""
            Hi there,
            
            Your bulk operation has completed successfully!
            
            Details:
            - Job ID: {job_id}
            - Collection: {collection_name or collection_id}
            - Companies added: {companies_added}
            - Completed at: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}
            
            You can view the results in your dashboard.
            
            Thanks!
            The Harmonic Team
            """
            
            msg.attach(MIMEText(body, 'plain'))
            
            # Send email if SMTP is configured
            if self.smtp_username and self.smtp_password:
                server = smtplib.SMTP(self.smtp_server, self.smtp_port)
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                text = msg.as_string()
                server.sendmail(self.from_email, to_email, text)
                server.quit()
                print(f"Email sent successfully to {to_email}")
                return True
            else:
                # Fallback: just print to console
                print(f"Email notification (SMTP not configured):")
                print(f"  To: {to_email}")
                print(f"  Subject: {msg['Subject']}")
                print(f"  Body: {body}")
                return True
                
        except Exception as e:
            print(f"Failed to send email to {to_email}: {str(e)}")
            return False


# Global email service instance
email_service = EmailService()
