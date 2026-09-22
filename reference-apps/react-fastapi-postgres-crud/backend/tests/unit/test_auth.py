import time

from app.auth import decode_session, encode_session, hash_password, verify_password


def test_hash_and_verify_password_roundtrip() -> None:
    hashed = hash_password("correct-horse")
    assert hashed != "correct-horse"
    assert verify_password("correct-horse", hashed) is True


def test_verify_password_rejects_wrong_password() -> None:
    hashed = hash_password("correct-horse")
    assert verify_password("wrong-password", hashed) is False


def test_verify_password_rejects_malformed_stored_value() -> None:
    assert verify_password("anything", "not-a-real-hash") is False


def test_session_roundtrip() -> None:
    token = encode_session("user-1", "admin")
    payload = decode_session(token)
    assert payload is not None
    assert payload["sub"] == "user-1"
    assert payload["role"] == "admin"


def test_session_rejects_tampered_token() -> None:
    token = encode_session("user-1", "member")
    tampered = token[:-1] + ("a" if token[-1] != "a" else "b")
    assert decode_session(tampered) is None


def test_session_rejects_missing_token() -> None:
    assert decode_session(None) is None
    assert decode_session("") is None


def test_session_rejects_expired_token(monkeypatch) -> None:
    from itsdangerous import URLSafeTimedSerializer

    from app import auth as auth_module

    token = encode_session("user-1", "member")

    # Simulate the max_age window having elapsed without sleeping the test suite: reach into
    # the same serializer construction auth.decode_session uses and force max_age=0.
    real_serializer = auth_module._serializer()
    assert isinstance(real_serializer, URLSafeTimedSerializer)
    time.sleep(1)
    monkeypatch.setattr(auth_module, "SESSION_TTL_SECONDS", 0)
    assert decode_session(token) is None
