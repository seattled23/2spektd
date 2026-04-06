"""Simple calculator module for testing 2spektd validation."""
import deal


@deal.pre(lambda a, b: isinstance(a, int) and isinstance(b, int), message="a and b must be integers")
@deal.post(lambda result: isinstance(result, int), message="result must be integer")
@deal.raises()
def add(a: int, b: int) -> int:
    """
    Add two numbers.

    @pre a and b are integers
    @post returns sum of a and b
    """
    return a + b


@deal.pre(lambda a, b: isinstance(a, int) and isinstance(b, int), message="a and b must be integers")
@deal.post(lambda result: isinstance(result, int), message="result must be integer")
@deal.raises()
def subtract(a: int, b: int) -> int:
    """
    Subtract b from a.

    @pre a and b are integers
    @post returns difference of a and b
    """
    return a - b
