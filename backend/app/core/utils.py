import re


_ACCENT_MAP = str.maketrans(
    "áàäâéèëêíìïîóòöôúùüûñ",
    "aaaaeeeeiiiioooouuuun",
)


def slugify(text: str) -> str:
    slug = text.lower().strip().translate(_ACCENT_MAP)
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s-]+", "-", slug)
    return slug.strip("-")
