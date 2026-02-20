"""
Ling Model Router

Maps user subscription plan to concrete Anthropic model ID.
Used by the conversation pipeline to override the default model.
"""

from loguru import logger
from .plan_gates import PLAN_FEATURES, is_privileged

# plan.ai_model → concrete Anthropic model ID
MODEL_MAP: dict[str, str] = {
    "sonnet": "claude-sonnet-4-20250514",
    "opus": "claude-opus-4-20250514",
}

# Default model for unknown plans
DEFAULT_MODEL = "claude-sonnet-4-20250514"


def resolve_model(user: dict) -> str:
    """Resolve the Anthropic model ID for a given user based on their plan.

    Args:
        user: User dict with at least 'plan' and optionally 'role'.

    Returns:
        Concrete model ID string (e.g. 'claude-sonnet-4-20250514').
    """
    if is_privileged(user):
        model = MODEL_MAP.get("opus", DEFAULT_MODEL)
        logger.debug(f"🔀 Model router: privileged user → {model}")
        return model

    plan = user.get("plan", "free")
    ai_model_key = PLAN_FEATURES.get(plan, PLAN_FEATURES["free"]).get("ai_model", "sonnet")
    model = MODEL_MAP.get(ai_model_key, DEFAULT_MODEL)
    logger.debug(f"🔀 Model router: plan={plan}, ai_model={ai_model_key} → {model}")
    return model
