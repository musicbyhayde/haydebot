def calculate_commission(amount: float) -> float:
    """
    Central logic for musician commission.
    Currently 15% of the closing amount, minimum 400 ILS.
    Returns 0 if amount is 0 or None.
    """
    if not amount:
        return 0.0
    return max(float(amount) * 0.15, 400.0)
