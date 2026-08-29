# Sunrise Verify MVP

Flow:
1. Eligible car/property listing shows a Sunrise Verify CTA.
2. Signed-in user starts `verify-checkout`.
3. Edge Function validates listing type, creates `verification_requests` row and Stripe Checkout session.
4. Stripe returns user to `/verify/:id?session_id=...`.
5. `verify-status` verifies request ownership and Stripe payment status.
6. Paid requests move to `processing`.
7. Future provider adapter writes result and changes status to `ready`.

MVP prices:
- vehicle: 79.90 PLN
- property: 49.90 PLN

No external data provider is connected yet. A paid request remains in `processing` until a provider/operator completes it.
