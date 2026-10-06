class JobRefused(Exception):
    """A request the service will not run, with the reason a person reads.

    `code` is stable (the UI and tests match on it); `message` is prose;
    `status` is the HTTP status the handlers answer with.
    """

    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
