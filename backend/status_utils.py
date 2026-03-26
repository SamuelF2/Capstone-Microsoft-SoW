"""Pure utility functions for status page logic."""


def aggregate_service_results(results: list) -> list[dict]:
    """Convert asyncio.gather results (which may include exceptions) to service dicts."""
    services = []
    for r in results:
        if isinstance(r, Exception):
            services.append({"name": "Unknown", "status": "down", "port": 0, "detail": str(r)[:80]})
        else:
            services.append(r)
    return services


def compute_overall_status(services: list[dict]) -> str:
    """Return 'healthy' if all services are up, 'degraded' otherwise."""
    return "healthy" if all(s["status"] == "up" for s in services) else "degraded"


def truncate_error(error_str: str, max_length: int = 80) -> str:
    """Take the first line of an error string and cap at max_length."""
    first_line = error_str.split("\n")[0]
    return first_line[:max_length]
