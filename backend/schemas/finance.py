from pydantic import BaseModel, Field
from schemas.booking import RoomType


class FinanceCalculateRequest(BaseModel):
    """Схема запроса на расчет стоимости аренды и расщепления платежа."""

    type_room: RoomType = Field(..., description="Тип арендуемого помещения")
    hours: float = Field(..., gt=0, le=24, description="Продолжительность аренды в часах")


class FinanceSplitBreakdown(BaseModel):
    """Детализация распределения средств согласно нормативам (40/30/15/15)."""

    utilities_40_percent: float = Field(..., description="Коммунальные услуги (40%)")
    budget_30_percent: float = Field(..., description="Перечисление в бюджет (30%)")
    payroll_fund_15_percent: float = Field(..., description="Фонд оплаты труда (15%)")
    school_development_15_percent: float = Field(..., description="Фонд развития школы (15%)")


class FinanceCalculateResponse(BaseModel):
    """Схема ответа с итоговым финансовым расчетом."""

    type_room: RoomType
    hours: float
    hourly_rate: float
    total_amount: float
    distribution: FinanceSplitBreakdown