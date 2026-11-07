from hashlib import sha256

UO_DEMO_USER_ID = "UO-BSU-LYCEUM-DEMO"
UO_DEMO_SCHOOL = "Лицей БГУ"
UO_CATALOG_ID_PREFIX = "UO-CATALOG-"


def demo_institution_id(school: str) -> str:
    if school == UO_DEMO_SCHOOL:
        return UO_DEMO_USER_ID
    return UO_CATALOG_ID_PREFIX + sha256(school.encode()).hexdigest()[:32]


def is_demo_institution(user_id: str) -> bool:
    return user_id == UO_DEMO_USER_ID or user_id.startswith(UO_CATALOG_ID_PREFIX)
