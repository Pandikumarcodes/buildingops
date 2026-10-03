"""Safe internal categories for bounded assistant failures."""


class ProviderUnavailableError(Exception):
    """The external Gemini service could not complete a request."""


class OperationalDataUnavailableError(Exception):
    """BuildingOps persisted operational data could not be read."""


class ToolExecutionError(Exception):
    """An allowlisted tool request could not be completed safely."""


class AssistantInternalError(Exception):
    """An unexpected assistant orchestration failure occurred."""
