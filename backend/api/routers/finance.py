from decimal import Decimal, ROUND_HALF_UP
from typing import Dict
from fastapi import APIRouter, status
from schemas.booking import RoomType
from schemas.finance import (
    FinanceCalculateRequest,
    FinanceCalculateResponse,
    FinanceSplitBreakdown,
)

router = APIRouter(prefix="/api/v1/finance", tags=["Финансовый модуль"])

# Базовые часовые тарифные ставки по категориям помещений (в BYN)
BASE_HOURLY_RATES: Dict[RoomType, Decimal] = {
    RoomType.sport_hall: Decimal("45.00"),
    RoomType.assembly_hall: Decimal("60.00"),
    RoomType.it_lab: Decimal("35.00"),
    RoomType.workshop: Decimal("30.00"),
    RoomType.pool: Decimal("50.00"),
}


def get_room_hourly_price(type_room: RoomType) -> Decimal:
    """Получение фиксированной стоимости 1-часового слота для заданного типа помещения."""
    return BASE_HOURLY_RATES[type_room].quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_decree_150_split(
    type_room: RoomType,
    hours: float,
) -> FinanceCalculateResponse:
    """
    Расчет итоговой стоимости аренды и нормативное расщепление платежа (Указ № 150):
    - 40% — возмещение коммунальных услуг;
    - 30% — перечисление в доход бюджета;
    - 15% — фонд оплаты труда (ФОТ);
    - 15% — фонд развития учреждения образования.
    """
    hourly_rate = float(BASE_HOURLY_RATES[type_room])
    total_amount = round(hourly_rate * hours, 2)

    utilities = round(total_amount * 0.40, 2)
    budget = round(total_amount * 0.30, 2)
    payroll = round(total_amount * 0.15, 2)
    development = round(total_amount - (utilities + budget + payroll), 2)

    return FinanceCalculateResponse(
        type_room=type_room,
        hours=hours,
        hourly_rate=hourly_rate,
        total_amount=total_amount,
        distribution=FinanceSplitBreakdown(
            utilities_40_percent=utilities,
            budget_30_percent=budget,
            payroll_fund_15_percent=payroll,
            school_development_15_percent=development,
        ),
    )


@router.post(
    "/calculate",
    response_model=FinanceCalculateResponse,
    status_code=status.HTTP_200_OK,
    summary="Расчет финансового распределения платежа (Указ № 150)",
)
async def calculate_finance_endpoint(
    payload: FinanceCalculateRequest,
) -> FinanceCalculateResponse:
    """Эндпоинт расчета стоимости аренды и пропорционального распределения суммы."""
    return calculate_decree_150_split(
        type_room=payload.type_room,
        hours=payload.hours,
    )
