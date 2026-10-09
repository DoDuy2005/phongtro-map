from email.message import EmailMessage
import json
import smtplib
import ssl
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import settings


def send_verification_email(recipient: str, full_name: str, token: str) -> None:
    if not settings.smtp_from_email:
        raise RuntimeError("Set SMTP_FROM_EMAIL to a verified sender address.")

    verify_url = f"{settings.frontend_url.rstrip('/')}/auth/verify?token={token}"
    message = EmailMessage()
    message["Subject"] = "Xác nhận email tài khoản Phòng Trọ Map"
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = recipient
    message.set_content(
        f"Xin chào {full_name},\n\n"
        "Vui lòng xác nhận địa chỉ email để hoàn tất đăng ký tài khoản Phòng Trọ Map.\n"
        f"Mở liên kết sau để xác nhận: {verify_url}\n\n"
        "Nếu bạn không tạo tài khoản này, hãy bỏ qua email này."
    )

    if settings.brevo_api_key:
        payload = {
            "sender": {"name": settings.smtp_from_name, "email": settings.smtp_from_email},
            "to": [{"email": recipient, "name": full_name}],
            "subject": message["Subject"],
            "textContent": message.get_content(),
        }
        request = Request(
            "https://api.brevo.com/v3/smtp/email",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "accept": "application/json",
                "api-key": settings.brevo_api_key,
                "content-type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=20) as response:
                if response.status not in (200, 201, 202):
                    raise RuntimeError(f"Brevo rejected email with HTTP {response.status}.")
            return
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"Brevo API returned HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise RuntimeError(f"Could not connect to Brevo API: {exc.reason}") from exc

    if not settings.smtp_host:
        raise RuntimeError("Set BREVO_API_KEY or configure SMTP_HOST to send email.")
    context = ssl.create_default_context()
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
        if settings.smtp_use_tls:
            server.starttls(context=context)
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)