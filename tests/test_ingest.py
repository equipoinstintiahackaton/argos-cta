from datetime import date

from pipeline import config, ingest_firms


def test_reintenta_ante_limite_de_transacciones(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "RAW_FIRMS", tmp_path)
    monkeypatch.setattr(ingest_firms.time, "sleep", lambda s: None)
    respuestas = iter([
        RuntimeError("FIRMS rechazo el pedido (400): 'Exceeding allowed transaction limit.'"),
        RuntimeError("FIRMS rechazo el pedido (400): 'Invalid MAP_KEY.'"),
        "latitude,longitude\n1,2\n",
    ])

    def fake(source, start, n_days):
        r = next(respuestas)
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(ingest_firms, "fetch_window", fake)
    ingest_firms.download("VIIRS_SNPP_SP", date(2024, 1, 1), date(2024, 1, 3))
    assert (tmp_path / "VIIRS_SNPP_SP" / "2024-01-01_3d.csv").exists()


def test_error_distinto_no_se_reintenta_y_no_deja_archivo(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "RAW_FIRMS", tmp_path)
    monkeypatch.setattr(ingest_firms.time, "sleep", lambda s: None)
    llamadas = {"n": 0}

    def fake(source, start, n_days):
        llamadas["n"] += 1
        raise RuntimeError("FIRMS rechazo el pedido (400): 'Parametro invalido'")

    monkeypatch.setattr(ingest_firms, "fetch_window", fake)
    ingest_firms.download("VIIRS_SNPP_SP", date(2024, 1, 1), date(2024, 1, 3))
    assert llamadas["n"] == 1
    assert not list((tmp_path / "VIIRS_SNPP_SP").glob("*.csv"))
