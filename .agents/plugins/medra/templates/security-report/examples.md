# Examples: Security Report

Filled examples for `guide.md`. Read only when unsure of a field's format; the guide's fill rules govern.

## Summary

"pass-with-findings: one medium finding remains (S-03, verbose errors on the reset endpoint). Token handling matches M-02 of the threat model. Dependency CVEs could not be checked against NVD (unreachable); `npm audit` ran instead."

## Finding

```markdown
### S-02 [high] Reset token compared with a non-constant-time equality

**Status:** open
**Confidence:** high · **Origin:** manual
**CWE:** CWE-208 · **CVE:** n/a · **CVSS:** n/a
**Location:** `src/Auth/ResetService.cs:88` · M-02, TM-02
**Evidence:** `if (stored.TokenHash == Hash(token))` compares strings with `==`
**Attack scenario:** an attacker measures response times over many requests to recover the hash byte by byte.
**Impact:** account takeover for any user with a pending reset.
**Fix:** compare with `CryptographicOperations.FixedTimeEquals` on the byte arrays.
**Validation:** a unit test asserts `FixedTimeEquals` is used; re-run this audit on round 2.
**References:** https://learn.microsoft.com/dotnet/api/system.security.cryptography.cryptographicoperations.fixedtimeequals
**Residual risk:** none once fixed; rate limiting (M-05) further reduces the window.
```

## Previous Findings row

`S-02 | open | remediated | ResetService.cs:88 now uses FixedTimeEquals; test ResetServiceTests.cs:41`
