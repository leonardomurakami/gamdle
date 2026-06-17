# Authentication And Account Specification

## Passwordless Login

Authentication uses email magic links only. Passwords are not stored or accepted.

Login flow:

1. The player submits an email to `POST /api/auth/request`.
2. The server trims and lowercases the address, then validates a basic email shape and maximum length of 254 characters.
3. The server records the request for rate limiting.
4. Previous unused login tokens for the same email are marked used.
5. A cryptographically random 32-byte base64url token is generated.
6. Only its SHA-256 hash is persisted.
7. A one-time verification link is delivered.
8. Opening the link atomically consumes the unexpired token.
9. The account is created when the email is new.
10. A 30-day session is created and the player is redirected to the app.

Login tokens expire after 15 minutes and cannot be reused.

The login request response does not reveal whether the account already existed.

## Delivery

When `EMAIL_WEBHOOK_URL` is set, the server sends:

```json
{
  "to": "player@example.com",
  "subject": "Your Gamdle sign-in link",
  "text": "Plain-text message",
  "html": "<p>HTML message</p>"
}
```

Without a webhook, the email is logged to the development console.

In non-production mode, API responses also include clickable development links.

## Sessions

- Session tokens are cryptographically random and stored only as SHA-256 hashes.
- Sessions expire 30 days after creation.
- Production authentication uses a cookie with:
  - `HttpOnly`
  - `Secure`
  - `SameSite=Lax`
  - `Path=/`
  - 30-day `Max-Age`
- Logging out deletes the cookie-backed session when available and expires the cookie.
- Development mode additionally supports a bearer session because some embedded local browsers do not persist redirect cookies:
  - The verification redirect includes `#dev_session=<token>`.
  - The client stores it locally when storage is available.
  - API calls send `Authorization: Bearer <token>`.
  - The server accepts this bearer form only outside production.

## Rate Limiting

Within the previous 15 minutes:

- Maximum 5 login requests for one normalized email.
- Maximum 20 login requests from one IP address.

Exceeding either limit returns HTTP `429`.

## Email Change

Changing email requires an authenticated session and verification of both addresses.

1. The player submits a different valid email.
2. If the new address is already used, the response remains generic.
3. An `email_changes` record is created with a 15-minute expiry.
4. One token is sent to the current address.
5. One token is sent to the proposed address.
6. Each token marks its corresponding verification timestamp.
7. Once both are verified before expiry, the user's email is updated and the change is marked complete.

## Account Deletion

- An authenticated player requests a fresh deletion link.
- Existing unused deletion tokens for that account are invalidated.
- Opening the one-time token deletes the user.
- Foreign-key cascades delete sessions, tokens, email changes, runs, wagers, and achievements associated with the account.
- The browser session cookie is expired.

## Request Security

- POST requests with an `Origin` header must exactly match `BASE_URL`.
- Request bodies are limited to 100,000 characters.
- Static responses set:
  - A restrictive Content Security Policy.
  - `X-Content-Type-Options: nosniff`.
  - `Referrer-Policy: no-referrer`.
