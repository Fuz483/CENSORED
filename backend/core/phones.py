import re


def phone_prefix(value: str) -> str:
    value = re.sub(r"[\s().-]", "", value)
    if not re.fullmatch(r"\+?[0-9]+", value):
        return ""
    if value.startswith("+"):
        return value
    if value.startswith("00"):
        return "+" + value[2:]
    if value.startswith("375"):
        return "+" + value
    if value.startswith("80"):
        return "+375" + value[2:]
    if value.startswith("0"):
        return "+375" + value[1:]
    return "+375" + value


def normalize_phone(value: str) -> str:
    number = phone_prefix(value)
    if not re.fullmatch(r"\+[1-9][0-9]{6,14}", number) or (
        number.startswith("+375") and len(number) != 13
    ):
        raise ValueError("Укажите полный номер телефона, например +375291234567.")
    return number
