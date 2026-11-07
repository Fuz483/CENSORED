import hashlib
import hmac
import json
from datetime import time

from core.config import settings
from db.models import RoomListing, User
from schemas.booking import BookingDetails, RentalAgreement

AGREEMENT_VERSION = "demo-v1"


def build_rental_agreement(
    listing: RoomListing, tenant: User, booking: BookingDetails, end: time,
) -> RentalAgreement:
    text = "\n".join((
        "Демонстрационный договор аренды помещения",
        f"Учреждение: {listing.school}",
        f"Арендатор: {tenant.name}",
        f"Помещение: {listing.room}",
        f"Адрес: {listing.address or 'уточняется учреждением'}",
        f"Дата и время (Минск): {booking.date:%d.%m.%Y}, {booking.start_time:%H:%M}–{end:%H:%M}",
        "В демонстрационном режиме к оплате 0 BYN. Данные карты не запрашиваются.",
        "Арендатор использует помещение в выбранное время, бережно относится к имуществу и соблюдает правила учреждения.",
        "Бронь можно отменить через личный кабинет не позднее чем за два часа до начала.",
        "Этот текст используется для показа работы сервиса на демо.",
    ))
    message = json.dumps([AGREEMENT_VERSION, listing.id, tenant.user_id, booking.reservation_id, text]).encode()
    token = hmac.new(settings.JWT_SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()
    return RentalAgreement(version=AGREEMENT_VERSION, text=text, token=token)
