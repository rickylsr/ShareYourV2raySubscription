import json
from pathlib import Path

from flask import request


DEFAULT_LANGUAGE = "zh"
SUPPORTED_LANGUAGES = {
    "zh": {"label": "中文", "html_lang": "zh-CN"},
    "en": {"label": "English", "html_lang": "en"},
}

TRANSLATIONS_DIR = Path(__file__).with_name("translations")
if not TRANSLATIONS_DIR.exists():
    TRANSLATIONS_DIR = Path(__file__).resolve().parents[2] / "app" / "translations"


def _load_translations():
    translations = {}
    for language in SUPPORTED_LANGUAGES:
        with (TRANSLATIONS_DIR / f"{language}.json").open(encoding="utf-8") as file:
            translations[language] = json.load(file)
    return translations


TRANSLATIONS = _load_translations()


def normalize_language(language):
    if not language:
        return None
    language = language.lower().replace("_", "-")
    if language.startswith("zh"):
        return "zh"
    if language.startswith("en"):
        return "en"
    return None


def get_language():
    query_language = normalize_language(request.args.get("lang"))
    if query_language:
        return query_language

    cookie_language = normalize_language(request.cookies.get("language"))
    if cookie_language:
        return cookie_language

    browser_language = request.accept_languages.best_match(["zh-CN", "zh", "en"])
    return normalize_language(browser_language) or DEFAULT_LANGUAGE


def get_translator(language):
    def translate(key):
        return TRANSLATIONS[language].get(
            key,
            TRANSLATIONS[DEFAULT_LANGUAGE].get(key, key),
        )

    return translate
