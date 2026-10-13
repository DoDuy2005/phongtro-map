from email.message import EmailMessage
import json
import smtplib
import ssl
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import settings


def _send_email(recipient: str, full_name: str, subject: str, body: str) -> None:
    if not settings.smtp_from_email:
        raise RuntimeError("Set SMTP_FROM_EMAIL to a verified sender address.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = recipient
    message.set_content(body)

    if settings.brevo_api_key:
        payload = {
            "sender": {"name": settings.smtp_from_name, "email": settings.smtp_from_email},
            "to": [{"email": recipient, "name": full_name}],
            "subject": subject,
            "textContent": body,
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


def send_verification_email(recipient: str, full_name: str, token: str) -> None:
    verify_url = f"{settings.frontend_url.rstrip('/')}/auth/verify?token={token}"
    _send_email(
        recipient,
        full_name,
        "Xác nhận email tài khoản Phòng Trọ Map",
        f"Xin chào {full_name},\n\n"
        "Vui lòng xác nhận địa chỉ email để hoàn tất đăng ký tài khoản Phòng Trọ Map.\n"
        f"Mở liên kết sau để xác nhận: {verify_url}\n\n"
        "Nếu bạn không tạo tài khoản này, hãy bỏ qua email này.",
    )


def send_room_availability_email(recipient: str, full_name: str, room_title: str, days: int) -> None:
    landlord_url = f"{settings.frontend_url.rstrip('/')}/landlord"
    _send_email(
        recipient,
        full_name,
        "Vui lòng xác nhận phòng còn trống - Phòng Trọ Map",
        f"Xin chào {full_name},\n\n"
        f'Tin "{room_title}" đã đăng quá {days} ngày. Vui lòng đăng nhập trang quản lý chủ trọ '
        "để xác nhận phòng còn trống hay đã cho thuê hết.\n\n"
        f"Mở trang quản lý: {landlord_url}\n\n"
        "Tin đăng của bạn vẫn được giữ nguyên cho đến khi bạn xác nhận.",
    )
