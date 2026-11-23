# Examples: Review Report

Filled examples for `guide.md`. Read only when unsure of a field's format; the guide's fill rules govern.

## Finding

```markdown
### F-02 [critical] Expiry test asserts the implementation, not the scenario

**Where:** `test/auth/reset-expiry.test.ts:41` · AUTH-004.S1
**Problem:** The test mocks `isExpired()` to return true, so it passes whatever the expiry window is.
**Fix:** Freeze the clock at issue time + 16 minutes and assert the form is not rendered.
```
