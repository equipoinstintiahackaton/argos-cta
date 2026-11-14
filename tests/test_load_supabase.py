import numpy as np
import pandas as pd

from pipeline import load_supabase


def test_filas_convierte_nan_y_tipos_numpy():
    df = pd.DataFrame({
        "a": np.array([1, 2], dtype="int64"),
        "b": np.array([0.5, np.nan], dtype="float32"),
        "c": ["x", None],
        "t": pd.to_datetime(["2024-01-01 10:00", "2024-01-02 11:00"], utc=True),
    })
    rows = load_supabase.filas(df)
    assert rows[0][0] == 1 and type(rows[0][0]) is int
    assert type(rows[0][1]) is float
    assert rows[1][1] is None and rows[1][2] is None
    assert rows[0][3].year == 2024
