# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
import typing
from dataclasses import dataclass

from genlayer import *


# ============================================================================
#  SECTION 1 — Constants
# ============================================================================

# ---- Policy lifecycle ------------------------------------------------------
STATUS_CREATED: int = 0          # sponsor funded coverage, awaiting researcher
STATUS_ACTIVE: int = 1           # researcher accepted + staked premium bond
STATUS_CLAIM_SUBMITTED: int = 2  # researcher filed a failure claim
STATUS_EVALUATING: int = 3       # adjudication in progress (transient marker)
STATUS_SETTLED_PASS: int = 4     # rigorous failure confirmed — researcher paid
STATUS_SETTLED_PARTIAL: int = 5  # partial credit — prorated payout
STATUS_SETTLED_FAIL: int = 6     # negligence / fabrication — sponsor refunded
STATUS_CANCELLED: int = 7        # cancelled before acceptance — sponsor refunded
STATUS_EXPIRED_UNACCEPTED: int = 8   # nobody accepted before accept_deadline_ts
STATUS_EXPIRED_NO_CLAIM: int = 9     # accepted but no claim filed before milestone_deadline_ts + grace

STATUS_NAMES: dict[int, str] = {
    STATUS_CREATED: "CREATED",
    STATUS_ACTIVE: "ACTIVE",
    STATUS_CLAIM_SUBMITTED: "CLAIM_SUBMITTED",
    STATUS_EVALUATING: "EVALUATING",
    STATUS_SETTLED_PASS: "SETTLED_PASS",
    STATUS_SETTLED_PARTIAL: "SETTLED_PARTIAL",
    STATUS_SETTLED_FAIL: "SETTLED_FAIL",
    STATUS_CANCELLED: "CANCELLED",
    STATUS_EXPIRED_UNACCEPTED: "EXPIRED_UNACCEPTED",
    STATUS_EXPIRED_NO_CLAIM: "EXPIRED_NO_CLAIM",
}

TERMINAL_STATUSES: set = {
    STATUS_SETTLED_PASS,
    STATUS_SETTLED_PARTIAL,
    STATUS_SETTLED_FAIL,
    STATUS_CANCELLED,
    STATUS_EXPIRED_UNACCEPTED,
    STATUS_EXPIRED_NO_CLAIM,
}

# ---- Verdict classes (per evaluation) --------------------------------------
VERDICT_NONE: int = 0
VERDICT_PASS: int = 1       # rigorous, honest, well-documented failure
VERDICT_PARTIAL: int = 2    # mixed rigor — partial payout
VERDICT_FAIL: int = 3       # negligence, fabrication, abandonment, insufficient evidence

VERDICT_NAMES: dict[int, str] = {
    VERDICT_NONE: "NONE",
    VERDICT_PASS: "PASS",
    VERDICT_PARTIAL: "PARTIAL",
    VERDICT_FAIL: "FAIL",
}

# ---- Error classification prefixes -----------------------------------------
# Deterministic failures use EXPECTED (validators must match exactly).
# External/web failures use EXTERNAL. Flaky network conditions use TRANSIENT.
# Unusable LLM output uses LLM_ERROR — these are allowed to disagree across
# validators, which forces leader rotation instead of persisting bad state.
ERR_EXPECTED = "EXPECTED: "
ERR_EXTERNAL = "EXTERNAL: "
ERR_TRANSIENT = "TRANSIENT: "
ERR_LLM = "LLM_ERROR: "

# ---- Sizing / anti-abuse limits --------------------------------------------
MAX_TITLE_LEN: int = 200
MAX_DESCRIPTION_LEN: int = 4000
MAX_FIELD_LEN: int = 60
MAX_URL_LEN: int = 500
MAX_METHODOLOGY_SUMMARY_LEN: int = 3000
MAX_MILESTONE_LEN: int = 1500
MAX_EVIDENCE_URLS: int = 8
MIN_EVIDENCE_URLS: int = 1
MAX_CLAIM_NARRATIVE_LEN: int = 5000
MAX_EVIDENCE_EXCERPT: int = 1800   # chars of fetched page fed to the LLM per source
MAX_REASONING_STORED: int = 2500
MAX_NOTE_LEN: int = 240
MAX_TAGS: int = 6
MAX_TAG_LEN: int = 32

# ---- Economic parameters ----------------------------------------------------
BPS_DENOMINATOR: int = 10000
DEFAULT_PROTOCOL_FEE_BPS: int = 150       # 1.5% of every payout, funds the pool's sustainability
MAX_PROTOCOL_FEE_BPS: int = 1000          # hard cap 10%
DEFAULT_MIN_PREMIUM_BPS: int = 300        # researcher must bond >= 3% of coverage by default
MIN_ALLOWED_PREMIUM_BPS: int = 50         # platform floor, 0.5%
MAX_ALLOWED_PREMIUM_BPS: int = 5000       # platform ceiling, 50%
DEFAULT_ACCEPT_WINDOW_SECONDS: int = 30 * 24 * 3600     # 30 days to accept
DEFAULT_CLAIM_GRACE_SECONDS: int = 60 * 24 * 3600        # 60 days post-milestone grace to file a claim
MIN_COVERAGE_WEI: int = 0                 # platform-configurable floor

# ---- Evaluation rubric ------------------------------------------------------
# Five criteria, weighted, mirroring the README's evaluation guidance:
#   methodology rigor, honest milestone attempts, documentation quality,
#   independent supporting evidence, reproducibility / knowledge value.
CRITERIA: list[str] = [
    "methodology_rigor",
    "honest_attempt",
    "documentation_quality",
    "independent_evidence",
    "knowledge_value",
]

DEFAULT_CRITERIA_WEIGHTS_BPS: dict[str, int] = {
    "methodology_rigor": 2800,
    "honest_attempt": 2200,
    "documentation_quality": 1800,
    "independent_evidence": 1800,
    "knowledge_value": 1400,
}

# Consensus tolerances — deliberately generous so honest validators with
# slightly different (but substantively equivalent) LLM outputs converge,
# while a materially wrong or dishonest leader still gets rejected. Tight
# tolerances are what cause spurious leader rotation / Undetermined status;
# these bands are calibrated to avoid that while still enforcing substance.
SCORE_TOLERANCE: int = 18            # total_score points out of 100
CRITERION_TOLERANCE: int = 20        # per-criterion points out of 100
CONFIDENCE_TOLERANCE: int = 30       # confidence points out of 100
PAYOUT_BPS_TOLERANCE: int = 2000     # payout_bps points out of 10000 (20%)

# Score bands mapping total_score (0..100) -> verdict + payout_bps.
# PASS: fully rigorous failure -> full coverage returned.
# PARTIAL: mixed rigor -> prorated coverage, linearly scaled within band.
# FAIL: negligence / fabrication / insufficient evidence -> sponsor keeps coverage.
SCORE_BAND_FAIL_MAX: int = 39
SCORE_BAND_PARTIAL_MIN: int = 40
SCORE_BAND_PARTIAL_MAX: int = 74
SCORE_BAND_PASS_MIN: int = 75

# Below this confidence, no matter the score, adjudication is inconclusive
# and the claim is left open for re-evaluation (never silently settles).
MIN_ACTIONABLE_CONFIDENCE: int = 45


# ============================================================================
#  SECTION 2 — Storage dataclasses
#
#  Only str / int-family (u8/u32/u64/u256) / bool / Address fields are used
#  directly; lists of primitives use DynArray; anything shaped like a nested
#  object is serialized to a JSON string. New fields must only be appended.
# ============================================================================

@allow_storage
@dataclass
class Policy:
    id: u64
    sponsor: Address
    researcher: Address              # zero address until accepted

    project_title: str
    project_description: str
    research_field: str
    methodology_url: str             # public methodology / preregistration document
    methodology_summary: str
    milestone_description: str
    tags_json: str                   # JSON array of strings

    status: u8

    # ---- economic terms (agreed amounts) ----
    coverage_wei: u256                # term: total coverage sponsor is offering
    premium_bps: u32                  # term: required researcher bond, bps of coverage

    # ---- economic ledger (actual escrow custody — the ONLY source payouts read from) ----
    coverage_deposited: u256
    premium_deposited: u256

    # ---- timing ----
    created_ts: u64
    accept_deadline_ts: u64           # sponsor timeout: researcher must accept by here
    milestone_deadline_ts: u64        # research milestone target date
    claim_deadline_ts: u64            # milestone_deadline_ts + grace: last date to file a claim
    accepted_ts: u64
    claim_submitted_ts: u64
    settled_ts: u64

    # ---- claim + evaluation outcome (latest) ----
    claim_narrative: str
    evidence_urls_json: str           # JSON array of evidence URLs submitted with the claim
    verdict: u8
    total_score: u32                  # 0..100
    confidence: u32                   # 0..100
    payout_bps: u32                   # 0..10000, fraction of coverage paid to researcher
    criteria_json: str                # JSON {criterion: 0..100}
    evaluation_summary: str
    evaluation_count: u32             # number of adjudication passes run

    fee_paid: bool


@allow_storage
@dataclass
class EvaluationRecord:
    """Append-only audit trail entry for one adjudication pass on a policy."""
    policy_id: u64
    verdict: u8
    total_score: u32
    confidence: u32
    payout_bps: u32
    criteria_json: str
    summary: str
    evidence_ok_count: u32
    evidence_total_count: u32
    evaluated_ts: u64


@allow_storage
@dataclass
class ActivityEvent:
    """Append-only per-policy activity/audit log entry."""
    kind: str
    actor: Address
    amount: u256
    ts: u64
    note: str


@allow_storage
@dataclass
class UserStats:
    address: str
    policies_sponsored: u256
    policies_researched: u256
    claims_filed: u256
    claims_passed: u256
    claims_partial: u256
    claims_failed: u256
    total_coverage_funded_wei: u256
    total_payouts_received_wei: u256


# ============================================================================
#  SECTION 3 — Pure / deterministic helpers (safe anywhere, no nondet calls)
# ============================================================================

def _require(cond: bool, message: str) -> None:
    if not cond:
        raise gl.vm.UserError(ERR_EXPECTED + message)


def _clamp_int(value: int, low: int, high: int) -> int:
    if value < low:
        return low
    if value > high:
        return high
    return value


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)] + "…"


def _normalize_url(url: str, field: str = "url") -> str:
    u = url.strip()
    _require(0 < len(u) <= MAX_URL_LEN, f"{field} must be 1..{MAX_URL_LEN} chars")
    _require(
        u.startswith("https://") or u.startswith("http://"),
        f"{field} must start with http(s):// — got '{u[:40]}'",
    )
    return u


def _url_domain(url: str) -> str:
    """Best-effort domain extraction for independence checks (no regex deps)."""
    u = url.strip().lower()
    for prefix in ("https://", "http://"):
        if u.startswith(prefix):
            u = u[len(prefix):]
            break
    if u.startswith("www."):
        u = u[4:]
    return u.split("/")[0].split("?")[0].split("#")[0]


def _score_bucket(raw: typing.Any) -> int:
    """Coerce arbitrary LLM numeric output into an int 0..100."""
    try:
        if isinstance(raw, bool):
            value = 100.0 if raw else 0.0
        elif isinstance(raw, (int, float)):
            value = float(raw)
        elif isinstance(raw, str):
            value = float(raw.strip().rstrip("%").strip())
        else:
            value = 0.0
    except (ValueError, TypeError):
        value = 0.0
    if 0.0 < value <= 1.0:
        value *= 100.0
    return int(round(_clamp_int(int(value), 0, 100)))


def _coerce_bool(raw: typing.Any) -> typing.Optional[bool]:
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        if raw == 1:
            return True
        if raw == 0:
            return False
        return None
    if isinstance(raw, str):
        lowered = raw.strip().lower()
        if lowered in ("true", "yes", "y", "1", "rigorous", "genuine", "pass"):
            return True
        if lowered in ("false", "no", "n", "0", "negligent", "fabricated", "fail"):
            return False
    return None


def _first_present(payload: dict, keys: list[str]) -> typing.Any:
    for key in keys:
        if key in payload:
            return payload[key]
    return None


def _sanitize_json_text(text: str) -> str:
    """Strip markdown code fences and outer chatter around a JSON object."""
    stripped = text.strip()
    if stripped.startswith("```"):
        first_newline = stripped.find("\n")
        if first_newline != -1:
            stripped = stripped[first_newline + 1:]
        if stripped.rstrip().endswith("```"):
            stripped = stripped.rstrip()[:-3]
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        stripped = stripped[start: end + 1]
    return stripped.strip()


def _safe_json_loads(text: str, default: typing.Any) -> typing.Any:
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError, TypeError):
        return default


def _parse_verdict_payload(raw: typing.Any) -> dict:
    """Normalize an LLM adjudication response into a canonical dict:
    {criteria: {name: 0..100}, total_score, confidence, reasoning,
    evidence_assessment, fraud_flag}.

    Tolerant of alias keys and stringly-typed values. Only raises LLM_ERROR
    when the payload is fundamentally unusable (not valid JSON / not a dict);
    otherwise it degrades to conservative defaults so the platform never
    crashes on a slightly malformed but honest model response.
    """
    payload: typing.Any = raw
    if isinstance(payload, str):
        payload = _safe_json_loads(_sanitize_json_text(payload), None)
        if payload is None:
            raise gl.vm.UserError(ERR_LLM + "verdict was not parseable JSON")
    if not isinstance(payload, dict):
        raise gl.vm.UserError(ERR_LLM + "verdict JSON was not an object")

    raw_criteria = _first_present(payload, ["criteria", "scores", "rubric"])
    criteria: dict[str, int] = {}
    if isinstance(raw_criteria, dict):
        for name in CRITERIA:
            val = _first_present(raw_criteria, [name, name.replace("_", " ")])
            criteria[name] = _score_bucket(val) if val is not None else 0
    else:
        for name in CRITERIA:
            criteria[name] = _score_bucket(_first_present(payload, [name]))

    total_raw = _first_present(payload, ["total_score", "score", "overall_score"])
    if total_raw is not None:
        total_score = _score_bucket(total_raw)
    else:
        weights = DEFAULT_CRITERIA_WEIGHTS_BPS
        weighted = sum(criteria.get(k, 0) * weights.get(k, 0) for k in CRITERIA)
        total_score = int(weighted // BPS_DENOMINATOR)

    confidence = _score_bucket(
        _first_present(payload, ["confidence", "confidence_pct", "certainty"])
    )

    reasoning_raw = _first_present(payload, ["reasoning", "rationale", "explanation"])
    reasoning = str(reasoning_raw) if reasoning_raw is not None else ""

    evidence_raw = _first_present(
        payload, ["evidence_assessment", "evidence_summary", "sources_summary"]
    )
    evidence_assessment = str(evidence_raw) if evidence_raw is not None else ""

    fraud_raw = _first_present(payload, ["fraud_flag", "fabrication_detected", "negligence_detected"])
    fraud_flag = _coerce_bool(fraud_raw)
    if fraud_flag is None:
        fraud_flag = False

    return {
        "criteria": criteria,
        "total_score": _clamp_int(total_score, 0, 100),
        "confidence": _clamp_int(confidence, 0, 100),
        "reasoning": reasoning,
        "evidence_assessment": evidence_assessment,
        "fraud_flag": bool(fraud_flag),
    }


def _score_to_verdict(total_score: int, fraud_flag: bool) -> tuple[int, int]:
    """Map a total_score (0..100) plus fraud flag to (verdict, payout_bps)."""
    if fraud_flag:
        return VERDICT_FAIL, 0
    if total_score <= SCORE_BAND_FAIL_MAX:
        return VERDICT_FAIL, 0
    if total_score >= SCORE_BAND_PASS_MIN:
        return VERDICT_PASS, BPS_DENOMINATOR
    # linear scaling within the PARTIAL band
    span = SCORE_BAND_PARTIAL_MAX - SCORE_BAND_PARTIAL_MIN
    progress = total_score - SCORE_BAND_PARTIAL_MIN
    bps = int((progress * BPS_DENOMINATOR) // max(1, span))
    return VERDICT_PARTIAL, _clamp_int(bps, 500, 9500)


# ============================================================================
#  SECTION 4 — Native value transfer (the actual value-transfer path)
#
#  GenLayer's IC-to-IC call (`gl.get_contract_at(addr).emit_transfer(...)`)
#  only settles balance against another deployed Intelligent Contract, not a
#  plain externally-owned wallet — which is what every researcher/sponsor
#  address is. The EVM-compatibility interface stub below is the mechanism
#  that actually delivers native GEN to an EOA. ALL payouts funnel through
#  the single `_send_gen` choke point so the entire value-transfer surface
#  of the contract can be audited by grepping one function name.
# ============================================================================

@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


def _send_gen(to_address: Address, amount: int) -> None:
    """Single emission point for every native-token payout in this contract.

    Callers MUST zero the relevant ledger field(s) and persist state BEFORE
    calling this. That ordering is what makes double-spend and reentrancy
    structurally impossible: a second call into the same payout path always
    finds the ledger already at zero and rejects before reaching here.
    """
    if amount <= 0:
        return
    _Recipient(to_address).emit_transfer(value=u256(int(amount)))


# ============================================================================
#  SECTION 5 — The Contract
# ============================================================================

class Voidance(gl.Contract):
    """Decentralized insurance for rigorous research that fails despite
    genuine, well-documented effort. See module docstring for design
    principles; see PUBLIC WRITES sections below for the full escrow
    lifecycle and every fund exit path."""

    # ---- ownership / platform config ----------------------------------
    owner: Address
    admins: TreeMap[str, bool]
    paused: bool
    protocol_fee_bps: u32
    min_premium_bps: u32
    min_coverage_wei: u256
    accrued_protocol_fees_wei: u256
    default_accept_window_seconds: u64
    default_claim_grace_seconds: u64

    # ---- policy storage --------------------------------------------------
    policy_count: u64
    policies: TreeMap[u64, Policy]
    evaluation_history: TreeMap[u64, DynArray[EvaluationRecord]]
    activity: TreeMap[u64, DynArray[ActivityEvent]]

    # per-address index of policy ids touched, for dashboard queries
    sponsor_policy_ids: TreeMap[Address, DynArray[u64]]
    researcher_policy_ids: TreeMap[Address, DynArray[u64]]

    # ---- internal withdrawable balances -----------------------------------
    # Credited by settlement/refund/cancellation paths; withdraw() turns a
    # credit into a REAL native transfer. This lets multi-recipient payouts
    # (e.g. protocol fee + researcher share in the same settlement) each
    # follow the zero-then-transfer rule independently without re-entering
    # external calls back-to-back inside one transaction.
    balances: TreeMap[Address, u256]

    # ---- user stats ---------------------------------------------------------
    user_stats: TreeMap[str, UserStats]

    # ---- platform metrics -----------------------------------------------------
    total_coverage_funded_wei: u256
    total_premiums_staked_wei: u256
    total_payouts_wei: u256
    total_policies_settled: u64

    # ========================================================================
    #  Construction
    # ========================================================================

    def __init__(
        self,
        min_coverage_wei: int = MIN_COVERAGE_WEI,
        min_premium_bps: int = DEFAULT_MIN_PREMIUM_BPS,
        protocol_fee_bps: int = DEFAULT_PROTOCOL_FEE_BPS,
        owner_address: str = "",
    ):
        """Deploy the platform.

        Args:
            min_coverage_wei: minimum native units a sponsor must fund per
                policy (anti-spam). 0 disables the floor.
            min_premium_bps: default required researcher bond, in bps of
                coverage, applied when a policy doesn't override it.
            protocol_fee_bps: platform sustainability fee taken from payouts.
            owner_address: explicit owner override for deployment paths that
                present a zero sender to the constructor; falls back to the
                deploying sender when omitted.
        """
        self.owner = Address(owner_address) if owner_address else gl.message.sender_address
        self.admins[self.owner.as_hex] = True
        self.paused = False
        self.protocol_fee_bps = u32(_clamp_int(int(protocol_fee_bps), 0, MAX_PROTOCOL_FEE_BPS))
        self.min_premium_bps = u32(
            _clamp_int(int(min_premium_bps), MIN_ALLOWED_PREMIUM_BPS, MAX_ALLOWED_PREMIUM_BPS)
        )
        self.min_coverage_wei = u256(max(0, int(min_coverage_wei)))
        self.accrued_protocol_fees_wei = u256(0)
        self.default_accept_window_seconds = u64(DEFAULT_ACCEPT_WINDOW_SECONDS)
        self.default_claim_grace_seconds = u64(DEFAULT_CLAIM_GRACE_SECONDS)

        self.policy_count = u64(0)
        self.total_coverage_funded_wei = u256(0)
        self.total_premiums_staked_wei = u256(0)
        self.total_payouts_wei = u256(0)
        self.total_policies_settled = u64(0)

    # ========================================================================
    #  Internal utilities — access control, lookups, bookkeeping
    # ========================================================================

    def _not_paused(self) -> None:
        if self.paused:
            raise gl.vm.UserError(ERR_EXPECTED + "platform is paused")

    def _only_owner(self) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(ERR_EXPECTED + "only the owner may call this")

    def _only_admin(self) -> None:
        sender = gl.message.sender_address.as_hex
        if not self.admins.get(sender, False) and gl.message.sender_address != self.owner:
            raise gl.vm.UserError(ERR_EXPECTED + "only an admin may call this")

    def _get_policy(self, policy_id: int) -> Policy:
        pid = u64(policy_id)
        policy = self.policies.get(pid)
        if policy is None:
            raise gl.vm.UserError(ERR_EXPECTED + f"policy {policy_id} does not exist")
        return policy

    def _credit_balance(self, addr: Address, amount: int) -> None:
        if amount <= 0:
            return
        current = self.balances.get(addr)
        base = int(current) if current is not None else 0
        self.balances[addr] = u256(base + int(amount))

    def _log(self, policy_id: int, kind: str, actor: Address, amount: int, ts: int, note: str) -> None:
        pid = u64(policy_id)
        if self.activity.get(pid) is None:
            self.activity[pid] = []
        self.activity[pid].append(
            ActivityEvent(
                kind=kind,
                actor=actor,
                amount=u256(max(0, amount)),
                ts=u64(max(0, ts)),
                note=_truncate(note, MAX_NOTE_LEN),
            )
        )

    def _record_sponsor(self, addr: Address, policy_id: int) -> None:
        if self.sponsor_policy_ids.get(addr) is None:
            self.sponsor_policy_ids[addr] = []
        arr = self.sponsor_policy_ids[addr]
        pid = u64(policy_id)
        for existing in arr:
            if existing == pid:
                return
        arr.append(pid)

    def _record_researcher(self, addr: Address, policy_id: int) -> None:
        if self.researcher_policy_ids.get(addr) is None:
            self.researcher_policy_ids[addr] = []
        arr = self.researcher_policy_ids[addr]
        pid = u64(policy_id)
        for existing in arr:
            if existing == pid:
                return
        arr.append(pid)

    def _touch_user(self, address: str) -> UserStats:
        if address not in self.user_stats:
            self.user_stats[address] = UserStats(
                address=address,
                policies_sponsored=u256(0),
                policies_researched=u256(0),
                claims_filed=u256(0),
                claims_passed=u256(0),
                claims_partial=u256(0),
                claims_failed=u256(0),
                total_coverage_funded_wei=u256(0),
                total_payouts_received_wei=u256(0),
            )
        return self.user_stats[address]

    def _send_native(self, recipient: Address, amount: int) -> None:
        """Outbound half of the value-transfer path — delegates to the
        module-level `_send_gen` choke point. Callers must zero and persist
        the ledger BEFORE invoking this."""
        _send_gen(recipient, amount)

    # ------------------------------------------------------------------------
    #  Serialization for views (schema-safe primitives only — no Address /
    #  dataclass objects ever cross the view boundary directly)
    # ------------------------------------------------------------------------

    def _policy_dict(self, policy: Policy) -> dict:
        zero_addr = "0x0000000000000000000000000000000000000000"
        return {
            "id": int(policy.id),
            "sponsor": policy.sponsor.as_hex,
            "researcher": policy.researcher.as_hex if policy.researcher.as_hex != zero_addr else None,
            "project_title": policy.project_title,
            "project_description": policy.project_description,
            "research_field": policy.research_field,
            "methodology_url": policy.methodology_url,
            "methodology_summary": policy.methodology_summary,
            "milestone_description": policy.milestone_description,
            "tags": _safe_json_loads(policy.tags_json, []),
            "status": STATUS_NAMES.get(int(policy.status), "CREATED"),
            "coverage_wei": int(policy.coverage_wei),
            "premium_bps": int(policy.premium_bps),
            "coverage_deposited": int(policy.coverage_deposited),
            "premium_deposited": int(policy.premium_deposited),
            "created_ts": int(policy.created_ts),
            "accept_deadline_ts": int(policy.accept_deadline_ts),
            "milestone_deadline_ts": int(policy.milestone_deadline_ts),
            "claim_deadline_ts": int(policy.claim_deadline_ts),
            "accepted_ts": int(policy.accepted_ts),
            "claim_submitted_ts": int(policy.claim_submitted_ts),
            "settled_ts": int(policy.settled_ts),
            "claim_narrative": policy.claim_narrative,
            "evidence_urls": _safe_json_loads(policy.evidence_urls_json, []),
            "verdict": VERDICT_NAMES.get(int(policy.verdict), "NONE"),
            "total_score": int(policy.total_score),
            "confidence": int(policy.confidence),
            "payout_bps": int(policy.payout_bps),
            "criteria": _safe_json_loads(policy.criteria_json, {}),
            "evaluation_summary": policy.evaluation_summary,
            "evaluation_count": int(policy.evaluation_count),
        }

    def _evaluation_dict(self, rec: EvaluationRecord) -> dict:
        return {
            "policy_id": int(rec.policy_id),
            "verdict": VERDICT_NAMES.get(int(rec.verdict), "NONE"),
            "total_score": int(rec.total_score),
            "confidence": int(rec.confidence),
            "payout_bps": int(rec.payout_bps),
            "criteria": _safe_json_loads(rec.criteria_json, {}),
            "summary": rec.summary,
            "evidence_ok_count": int(rec.evidence_ok_count),
            "evidence_total_count": int(rec.evidence_total_count),
            "evaluated_ts": int(rec.evaluated_ts),
        }

    # ========================================================================
    #  SECTION 6 — Nondeterministic adjudication core
    #  (only ever invoked from inside a `gl.eq_principle.prompt_comparative`
    #  leader closure — never from deterministic code paths)
    # ========================================================================

    def _fetch_evidence(self, urls: list[str]) -> list[dict]:
        """Fetch each evidence URL defensively. A dead/slow source degrades to
        an error record instead of aborting the whole adjudication pass — the
        LLM is told which sources failed and must weigh that into confidence."""
        results: list[dict] = []
        for url in urls[:MAX_EVIDENCE_URLS]:
            try:
                text = gl.nondet.web.render(url, mode="text")
                excerpt = str(text)[:MAX_EVIDENCE_EXCERPT]
                results.append({"url": url, "ok": True, "excerpt": excerpt})
            except Exception as exc:  # noqa: BLE001 — degrade per-source, don't abort
                results.append(
                    {"url": url, "ok": False, "excerpt": f"[fetch failed: {str(exc)[:150]}]"}
                )
        return results

    def _build_adjudication_prompt(
        self,
        policy: Policy,
        methodology_evidence: dict,
        claim_evidence: list[dict],
        now_ts: int,
    ) -> str:
        method_status = "OK" if methodology_evidence["ok"] else "FETCH_FAILED"
        method_block = (
            f"--- METHODOLOGY DOCUMENT ({method_status}): {methodology_evidence['url']}\n"
            f"{methodology_evidence['excerpt']}"
        )

        claim_blocks = []
        for item in claim_evidence:
            status = "OK" if item["ok"] else "FETCH_FAILED"
            claim_blocks.append(f"--- CLAIM EVIDENCE ({status}): {item['url']}\n{item['excerpt']}")
        claim_text = "\n\n".join(claim_blocks) if claim_blocks else "(no additional evidence URLs)"

        return f"""You are a neutral insurance adjudicator for a decentralized "innovation failure insurance" \
platform. You are NOT judging whether the research succeeded — you are judging whether the \
researcher pursued it with genuine, rigorous, honest effort such that the resulting failure \
deserves indemnity, as opposed to negligence, fabrication, or abandonment.

POLICY: "{policy.project_title}" ({policy.research_field})
PROJECT DESCRIPTION:
{policy.project_description}

INSURED MILESTONE:
{policy.milestone_description}

RESEARCHER'S FAILURE CLAIM (self-reported — do not treat as ground truth on its own):
{policy.claim_narrative}

You must independently verify this claim against the evidence fetched below. Base your \
verdict ONLY on the evidence excerpts and widely-known public facts — never on the claim \
narrative alone.

{method_block}

{claim_text}

TIMING: current unix time is {now_ts}; the insured milestone deadline was {int(policy.milestone_deadline_ts)}.

Score each criterion from 0-100 based on what the evidence actually shows:
- methodology_rigor: was a sound, pre-specified scientific/engineering methodology followed?
- honest_attempt: is there concrete evidence the milestone was genuinely attempted, not \
skipped or faked?
- documentation_quality: are experiments, data, and decisions documented well enough for a \
third party to understand what was done?
- independent_evidence: does evidence EXIST BEYOND the claimant's own narrative (data files, \
repositories, third-party logs, external references) that corroborates the claim?
- knowledge_value: despite failing the milestone, did the work generate genuine, reusable \
scientific or technical knowledge?

Respond with ONLY a JSON object, no markdown, with exactly these keys:
{{
  "criteria": {{
    "methodology_rigor": 0-100,
    "honest_attempt": 0-100,
    "documentation_quality": 0-100,
    "independent_evidence": 0-100,
    "knowledge_value": 0-100
  }},
  "total_score": 0-100 — your overall weighted verdict,
  "confidence": 0-100 — how confident you are in this verdict given the evidence quality,
  "fraud_flag": true or false — set true ONLY if evidence indicates fabrication, staged \
results, or the milestone was never actually attempted,
  "reasoning": one short paragraph (under 150 words) explaining the verdict,
  "evidence_assessment": one sentence naming which evidence was decisive and which sources, \
if any, failed to load or were insufficient
}}

Rules:
- If methodology or claim evidence failed to load, lower confidence accordingly — never \
invent facts about pages you could not read.
- If independent_evidence is unavailable (only the claimant's own narrative exists), \
independent_evidence must score below 30 and confidence should reflect that gap.
- fraud_flag=true should force total_score into the failing range regardless of other scores.
- Keep reasoning concise and evidence-grounded."""

    def _adjudicate_claim_nondet(self, policy: Policy, now_ts: int) -> tuple[dict, int, int]:
        """Run the full web-fetch + LLM verdict for a policy's claim under a
        tolerant comparative equivalence principle. Returns
        (parsed_verdict, evidence_ok_count, evidence_total_count).

        The equivalence principle compares only coarse, decision-relevant
        fields (verdict band via total_score, confidence band, fraud_flag)
        and explicitly treats prose differences as irrelevant. This is what
        keeps honest validator disagreement from causing leader rotation or
        an Undetermined consensus result, while still rejecting a leader
        whose verdict is materially different from the honest majority.
        """
        evidence_urls = _safe_json_loads(policy.evidence_urls_json, [])
        if not isinstance(evidence_urls, list):
            evidence_urls = []
        methodology_url = policy.methodology_url
        evidence_total_count = 1 + len(evidence_urls[:MAX_EVIDENCE_URLS])

        def leader() -> str:
            methodology_evidence = self._fetch_evidence([methodology_url])[0]
            claim_evidence = self._fetch_evidence([str(u) for u in evidence_urls])
            ok_count = (1 if methodology_evidence["ok"] else 0) + sum(
                1 for e in claim_evidence if e["ok"]
            )
            prompt = self._build_adjudication_prompt(
                policy, methodology_evidence, claim_evidence, now_ts
            )
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            verdict = _parse_verdict_payload(raw)
            # Canonical compact JSON — comparative equivalence below compares
            # meaning via the tolerant principle, not raw bytes.
            return json.dumps(
                {
                    "criteria": verdict["criteria"],
                    "total_score": verdict["total_score"],
                    "confidence": verdict["confidence"],
                    "fraud_flag": verdict["fraud_flag"],
                    "reasoning": _truncate(verdict["reasoning"], 900),
                    "evidence_assessment": _truncate(verdict["evidence_assessment"], 300),
                    "evidence_ok_count": ok_count,
                    "evidence_total_count": evidence_total_count,
                },
                sort_keys=True,
            )

        principle = (
            "Both results are JSON insurance-adjudication verdicts about the same research "
            "failure claim. Treat them as equivalent if: (1) their 'total_score' values are "
            f"within {SCORE_TOLERANCE} points of each other, (2) each individual criterion in "
            f"'criteria' is within {CRITERION_TOLERANCE} points of the other's, (3) their "
            f"'confidence' values are within {CONFIDENCE_TOLERANCE} points of each other, and "
            "(4) they agree on the boolean value of 'fraud_flag'. Differences in the wording "
            "of 'reasoning' or 'evidence_assessment', formatting, key order, or minor 'evidence_ok_count' "
            "discrepancies caused by transient network conditions are irrelevant and must NOT "
            "cause disagreement."
        )

        raw_result = gl.eq_principle.prompt_comparative(leader, principle)
        parsed = json.loads(raw_result)
        verdict = _parse_verdict_payload(parsed)
        ok_count = int(parsed.get("evidence_ok_count", 0))
        total_count = int(parsed.get("evidence_total_count", evidence_total_count))
        return verdict, ok_count, total_count

    # ========================================================================
    #  SECTION 7 — PUBLIC WRITES — policy lifecycle (escrow custody IN)
    # ========================================================================

    @gl.public.write.payable
    def create_policy(
        self,
        project_title: str,
        project_description: str,
        research_field: str,
        methodology_url: str,
        methodology_summary: str,
        milestone_description: str,
        tags_json: str,
        milestone_deadline_ts: int,
        now_ts: int,
        premium_bps: int = 0,
        accept_window_seconds: int = 0,
        claim_grace_seconds: int = 0,
    ) -> int:
        """Sponsor creates and funds a policy. Attach native value equal to
        the coverage amount — `gl.message.value` becomes `coverage_deposited`,
        the ONLY figure payout logic ever reads from.

        Returns the new policy id.
        """
        self._not_paused()
        sender = gl.message.sender_address
        coverage = int(gl.message.value)

        _require(coverage > 0, "coverage must be funded with positive GEN value")
        _require(coverage >= int(self.min_coverage_wei), "coverage below platform minimum")
        _require(0 < len(project_title.strip()) <= MAX_TITLE_LEN, f"project_title must be 1..{MAX_TITLE_LEN} chars")
        _require(
            0 < len(project_description.strip()) <= MAX_DESCRIPTION_LEN,
            f"project_description must be 1..{MAX_DESCRIPTION_LEN} chars",
        )
        _require(0 < len(research_field.strip()) <= MAX_FIELD_LEN, "research_field required")
        methodology_url = _normalize_url(methodology_url, "methodology_url")
        _require(
            len(methodology_summary) <= MAX_METHODOLOGY_SUMMARY_LEN,
            f"methodology_summary exceeds {MAX_METHODOLOGY_SUMMARY_LEN} chars",
        )
        _require(
            0 < len(milestone_description.strip()) <= MAX_MILESTONE_LEN,
            f"milestone_description must be 1..{MAX_MILESTONE_LEN} chars",
        )
        _require(milestone_deadline_ts > now_ts, "milestone_deadline_ts must be in the future")
        _require(now_ts > 0, "now_ts must be a positive unix timestamp")

        tags = _safe_json_loads(tags_json, [])
        _require(isinstance(tags, list) and len(tags) <= MAX_TAGS, f"tags_json must be an array of <= {MAX_TAGS} strings")
        clean_tags = [_truncate(str(t).strip(), MAX_TAG_LEN) for t in tags if str(t).strip()]

        effective_premium_bps = (
            int(premium_bps) if premium_bps and premium_bps > 0 else int(self.min_premium_bps)
        )
        effective_premium_bps = _clamp_int(
            effective_premium_bps, int(self.min_premium_bps), MAX_ALLOWED_PREMIUM_BPS
        )

        accept_window = (
            int(accept_window_seconds) if accept_window_seconds and accept_window_seconds > 0
            else int(self.default_accept_window_seconds)
        )
        grace = (
            int(claim_grace_seconds) if claim_grace_seconds and claim_grace_seconds > 0
            else int(self.default_claim_grace_seconds)
        )

        policy_id = int(self.policy_count)
        self.policy_count = u64(policy_id + 1)
        pid = u64(policy_id)

        zero_addr = Address("0x0000000000000000000000000000000000000000")

        self.policies[pid] = Policy(
            id=pid,
            sponsor=sender,
            researcher=zero_addr,
            project_title=project_title.strip(),
            project_description=project_description.strip(),
            research_field=research_field.strip(),
            methodology_url=methodology_url,
            methodology_summary=methodology_summary.strip(),
            milestone_description=milestone_description.strip(),
            tags_json=json.dumps(clean_tags),
            status=u8(STATUS_CREATED),
            coverage_wei=u256(coverage),
            premium_bps=u32(effective_premium_bps),
            coverage_deposited=u256(coverage),
            premium_deposited=u256(0),
            created_ts=u64(now_ts),
            accept_deadline_ts=u64(now_ts + accept_window),
            milestone_deadline_ts=u64(milestone_deadline_ts),
            claim_deadline_ts=u64(milestone_deadline_ts + grace),
            accepted_ts=u64(0),
            claim_submitted_ts=u64(0),
            settled_ts=u64(0),
            claim_narrative="",
            evidence_urls_json="[]",
            verdict=u8(VERDICT_NONE),
            total_score=u32(0),
            confidence=u32(0),
            payout_bps=u32(0),
            criteria_json="{}",
            evaluation_summary="",
            evaluation_count=u32(0),
            fee_paid=False,
        )
        self.evaluation_history[pid] = []

        self._record_sponsor(sender, policy_id)
        stats = self._touch_user(sender.as_hex)
        stats.policies_sponsored = u256(int(stats.policies_sponsored) + 1)
        stats.total_coverage_funded_wei = u256(int(stats.total_coverage_funded_wei) + coverage)
        self.total_coverage_funded_wei = u256(int(self.total_coverage_funded_wei) + coverage)

        self._log(policy_id, "CREATE", sender, coverage, now_ts, project_title.strip()[:100])
        return policy_id

    @gl.public.write.payable
    def accept_policy(self, policy_id: int, now_ts: int) -> None:
        """Researcher accepts a policy by staking the required premium bond.
        Attach native value EXACTLY equal to `premium_bps` of `coverage_wei`
        — this is the anti-fraud commitment that is forfeited on a FAIL
        verdict and returned in full on PASS/PARTIAL."""
        self._not_paused()
        policy = self._get_policy(policy_id)
        _require(int(policy.status) == STATUS_CREATED, "policy is not awaiting acceptance")
        _require(now_ts <= int(policy.accept_deadline_ts), "acceptance window has expired")

        sender = gl.message.sender_address
        _require(sender != policy.sponsor, "sponsor cannot also be the researcher")

        required_premium = (int(policy.coverage_wei) * int(policy.premium_bps)) // BPS_DENOMINATOR
        attached = int(gl.message.value)
        _require(
            attached == required_premium,
            f"must attach exactly {required_premium} wei as the premium bond",
        )

        policy.researcher = sender
        policy.premium_deposited = u256(attached)
        policy.status = u8(STATUS_ACTIVE)
        policy.accepted_ts = u64(now_ts)

        self._record_researcher(sender, policy_id)
        stats = self._touch_user(sender.as_hex)
        stats.policies_researched = u256(int(stats.policies_researched) + 1)
        self.total_premiums_staked_wei = u256(int(self.total_premiums_staked_wei) + attached)

        self._log(policy_id, "ACCEPT", sender, attached, now_ts, "")

    @gl.public.write
    def submit_claim(
        self,
        policy_id: int,
        claim_narrative: str,
        evidence_urls_json: str,
        now_ts: int,
    ) -> None:
        """Researcher files a failure claim with supporting evidence URLs.
        Moves the policy to CLAIM_SUBMITTED, ready for permissionless
        adjudication via `evaluate_claim`."""
        self._not_paused()
        policy = self._get_policy(policy_id)
        sender = gl.message.sender_address
        _require(int(policy.status) == STATUS_ACTIVE, "policy is not active")
        _require(sender == policy.researcher, "only the accepted researcher may file a claim")
        _require(now_ts <= int(policy.claim_deadline_ts), "claim filing window has expired")
        _require(
            0 < len(claim_narrative.strip()) <= MAX_CLAIM_NARRATIVE_LEN,
            f"claim_narrative must be 1..{MAX_CLAIM_NARRATIVE_LEN} chars",
        )

        urls = _safe_json_loads(evidence_urls_json, None)
        _require(isinstance(urls, list), "evidence_urls_json must be a JSON array")
        _require(
            MIN_EVIDENCE_URLS <= len(urls) <= MAX_EVIDENCE_URLS,
            f"claim needs {MIN_EVIDENCE_URLS}..{MAX_EVIDENCE_URLS} evidence URLs",
        )
        normalized = [_normalize_url(str(u), "evidence url") for u in urls]

        policy.claim_narrative = claim_narrative.strip()
        policy.evidence_urls_json = json.dumps(normalized)
        policy.status = u8(STATUS_CLAIM_SUBMITTED)
        policy.claim_submitted_ts = u64(now_ts)

        stats = self._touch_user(sender.as_hex)
        stats.claims_filed = u256(int(stats.claims_filed) + 1)

        self._log(policy_id, "CLAIM_SUBMITTED", sender, 0, now_ts, "")

    @gl.public.write
    def withdraw_claim(self, policy_id: int, now_ts: int) -> None:
        """Researcher may withdraw an unevaluated claim to revise evidence
        before anyone calls `evaluate_claim`. Returns the policy to ACTIVE."""
        policy = self._get_policy(policy_id)
        sender = gl.message.sender_address
        _require(int(policy.status) == STATUS_CLAIM_SUBMITTED, "no pending claim to withdraw")
        _require(sender == policy.researcher, "only the researcher may withdraw the claim")
        policy.status = u8(STATUS_ACTIVE)
        policy.claim_narrative = ""
        policy.evidence_urls_json = "[]"
        policy.claim_submitted_ts = u64(0)
        self._log(policy_id, "CLAIM_WITHDRAWN", sender, 0, now_ts, "")

    # ========================================================================
    #  SECTION 8 — PUBLIC WRITES — trustless adjudication + settlement
    #  (PAYOUT PATHS — every way GEN can leave escrow, enumerated)
    #    1. evaluate_claim -> PASS/PARTIAL/FAIL settlement (primary path)
    #    2. claim_sponsor_timeout -> sponsor reclaims coverage if nobody accepted
    #    3. claim_expired_no_claim -> researcher's premium + sponsor's coverage
    #       split back to their respective owners if no claim was ever filed
    #    4. cancel_policy -> sponsor reclaims coverage before acceptance
    #  Every path re-derives amounts from the stored ledger fields, zeroes
    #  them, persists state, and only THEN credits balances / transfers.
    # ========================================================================

    @gl.public.write
    def evaluate_claim(self, policy_id: int, now_ts: int) -> dict:
        """Permissionlessly adjudicate a submitted claim against contract-
        fetched web evidence, then settle the policy from the verdict.

        Anyone may call this — resolution is trustless and does not require
        the sponsor's cooperation. Returns the post-settlement policy view.
        """
        self._not_paused()
        policy = self._get_policy(policy_id)
        _require(int(policy.status) == STATUS_CLAIM_SUBMITTED, "policy has no claim awaiting evaluation")

        policy.status = u8(STATUS_EVALUATING)

        verdict, ok_count, total_count = self._adjudicate_claim_nondet(policy, now_ts)

        if int(verdict["confidence"]) < MIN_ACTIONABLE_CONFIDENCE:
            # Inconclusive — do not settle. Leave the claim open for a later
            # re-run (e.g. once a slow evidence source becomes reachable).
            policy.status = u8(STATUS_CLAIM_SUBMITTED)
            policy.evaluation_count = u32(int(policy.evaluation_count) + 1)
            self.evaluation_history[u64(policy_id)].append(
                EvaluationRecord(
                    policy_id=u64(policy_id),
                    verdict=u8(VERDICT_NONE),
                    total_score=u32(verdict["total_score"]),
                    confidence=u32(verdict["confidence"]),
                    payout_bps=u32(0),
                    criteria_json=json.dumps(verdict["criteria"]),
                    summary=_truncate(verdict["reasoning"], MAX_REASONING_STORED),
                    evidence_ok_count=u32(ok_count),
                    evidence_total_count=u32(total_count),
                    evaluated_ts=u64(now_ts),
                )
            )
            self._log(
                policy_id, "EVALUATION_INCONCLUSIVE", gl.message.sender_address, 0, now_ts,
                f"confidence {verdict['confidence']}% below floor",
            )
            return self._policy_dict(policy)

        verdict_class, payout_bps = _score_to_verdict(verdict["total_score"], verdict["fraud_flag"])

        policy.verdict = u8(verdict_class)
        policy.total_score = u32(verdict["total_score"])
        policy.confidence = u32(verdict["confidence"])
        policy.payout_bps = u32(payout_bps)
        policy.criteria_json = json.dumps(verdict["criteria"])
        policy.evaluation_summary = _truncate(verdict["reasoning"], MAX_REASONING_STORED)
        policy.evaluation_count = u32(int(policy.evaluation_count) + 1)

        self.evaluation_history[u64(policy_id)].append(
            EvaluationRecord(
                policy_id=u64(policy_id),
                verdict=u8(verdict_class),
                total_score=u32(verdict["total_score"]),
                confidence=u32(verdict["confidence"]),
                payout_bps=u32(payout_bps),
                criteria_json=json.dumps(verdict["criteria"]),
                summary=_truncate(verdict["reasoning"], MAX_REASONING_STORED),
                evidence_ok_count=u32(ok_count),
                evidence_total_count=u32(total_count),
                evaluated_ts=u64(now_ts),
            )
        )

        self._settle(policy, verdict_class, payout_bps, now_ts)
        self._log(
            policy_id, "SETTLED", gl.message.sender_address, 0, now_ts,
            f"{VERDICT_NAMES[verdict_class]} score={verdict['total_score']} payout_bps={payout_bps}",
        )
        return self._policy_dict(policy)

    def _settle(self, policy: Policy, verdict_class: int, payout_bps: int, now_ts: int) -> None:
        """PAYOUT PATH 1 — core settlement. Reads the escrow ledger, zeroes
        it, persists, then credits balances. Idempotent: fee_paid guards
        against a second settlement of the same policy."""
        if policy.fee_paid:
            raise gl.vm.UserError(ERR_EXPECTED + "policy already settled")

        coverage = int(policy.coverage_deposited)
        premium = int(policy.premium_deposited)

        # ---- zero the ledger BEFORE any transfer/credit ----
        policy.coverage_deposited = u256(0)
        policy.premium_deposited = u256(0)
        policy.fee_paid = True
        policy.settled_ts = u64(now_ts)
        if verdict_class == VERDICT_PASS:
            policy.status = u8(STATUS_SETTLED_PASS)
        elif verdict_class == VERDICT_PARTIAL:
            policy.status = u8(STATUS_SETTLED_PARTIAL)
        else:
            policy.status = u8(STATUS_SETTLED_FAIL)
        # (state is persisted implicitly on write to storage-backed fields —
        # everything above this line has already mutated committed state
        # before any credit/transfer below is issued)

        researcher_share = (coverage * payout_bps) // BPS_DENOMINATOR
        sponsor_refund = coverage - researcher_share

        protocol_fee = 0
        if researcher_share > 0:
            protocol_fee = (researcher_share * int(self.protocol_fee_bps)) // BPS_DENOMINATOR
            researcher_share -= protocol_fee

        if verdict_class == VERDICT_FAIL:
            # Negligence/fabrication: sponsor gets coverage back AND the
            # researcher's forfeited premium bond (anti-fraud deterrent).
            self._credit_balance(policy.sponsor, sponsor_refund + premium)
        else:
            # PASS or PARTIAL: researcher always gets their bond back in
            # full — the bond is a commitment device, not a risk stake.
            if researcher_share > 0:
                self._credit_balance(policy.researcher, researcher_share + premium)
            else:
                self._credit_balance(policy.researcher, premium)
            if sponsor_refund > 0:
                self._credit_balance(policy.sponsor, sponsor_refund)

        if protocol_fee > 0:
            self.accrued_protocol_fees_wei = u256(int(self.accrued_protocol_fees_wei) + protocol_fee)

        self.total_payouts_wei = u256(int(self.total_payouts_wei) + researcher_share)
        self.total_policies_settled = u64(int(self.total_policies_settled) + 1)

        r_stats = self._touch_user(policy.researcher.as_hex)
        r_stats.total_payouts_received_wei = u256(
            int(r_stats.total_payouts_received_wei) + researcher_share + premium
        )
        if verdict_class == VERDICT_PASS:
            r_stats.claims_passed = u256(int(r_stats.claims_passed) + 1)
        elif verdict_class == VERDICT_PARTIAL:
            r_stats.claims_partial = u256(int(r_stats.claims_partial) + 1)
        else:
            r_stats.claims_failed = u256(int(r_stats.claims_failed) + 1)

    @gl.public.write
    def claim_sponsor_timeout(self, policy_id: int, now_ts: int) -> None:
        """PAYOUT PATH 2 — if no researcher ever accepted a policy before its
        acceptance window closed, the sponsor reclaims the full coverage.
        Permissionless (anyone can trigger cleanup); funds only ever move to
        the original sponsor."""
        self._not_paused()
        policy = self._get_policy(policy_id)
        _require(int(policy.status) == STATUS_CREATED, "policy is not awaiting acceptance")
        _require(now_ts > int(policy.accept_deadline_ts), "acceptance window has not expired yet")

        refund = int(policy.coverage_deposited)
        policy.coverage_deposited = u256(0)
        policy.status = u8(STATUS_EXPIRED_UNACCEPTED)
        policy.settled_ts = u64(now_ts)
        policy.fee_paid = True

        if refund > 0:
            self._credit_balance(policy.sponsor, refund)
        self._log(policy_id, "EXPIRED_UNACCEPTED", gl.message.sender_address, refund, now_ts, "")

    @gl.public.write
    def claim_expired_no_claim(self, policy_id: int, now_ts: int) -> None:
        """PAYOUT PATH 3 — if a researcher accepted but never filed a claim
        before the claim deadline, the policy expires cleanly: sponsor's
        coverage and researcher's premium bond both return to their original
        owners. Permissionless recovery so funds can never be stuck forever
        if either side goes silent."""
        self._not_paused()
        policy = self._get_policy(policy_id)
        _require(int(policy.status) == STATUS_ACTIVE, "policy is not active")
        _require(now_ts > int(policy.claim_deadline_ts), "claim filing window has not expired yet")

        coverage = int(policy.coverage_deposited)
        premium = int(policy.premium_deposited)
        policy.coverage_deposited = u256(0)
        policy.premium_deposited = u256(0)
        policy.status = u8(STATUS_EXPIRED_NO_CLAIM)
        policy.settled_ts = u64(now_ts)
        policy.fee_paid = True

        if coverage > 0:
            self._credit_balance(policy.sponsor, coverage)
        if premium > 0:
            self._credit_balance(policy.researcher, premium)
        self._log(policy_id, "EXPIRED_NO_CLAIM", gl.message.sender_address, coverage + premium, now_ts, "")

    @gl.public.write
    def cancel_policy(self, policy_id: int, now_ts: int) -> None:
        """PAYOUT PATH 4 — sponsor cancels an unaccepted policy at will and
        reclaims the full coverage. Only possible before any researcher has
        committed a premium bond."""
        self._not_paused()
        policy = self._get_policy(policy_id)
        sender = gl.message.sender_address
        _require(int(policy.status) == STATUS_CREATED, "policy can only be cancelled before acceptance")
        _require(sender == policy.sponsor or sender == self.owner, "only the sponsor or owner may cancel")

        refund = int(policy.coverage_deposited)
        policy.coverage_deposited = u256(0)
        policy.status = u8(STATUS_CANCELLED)
        policy.settled_ts = u64(now_ts)
        policy.fee_paid = True

        if refund > 0:
            self._credit_balance(policy.sponsor, refund)
        self._log(policy_id, "CANCELLED", sender, refund, now_ts, "")

    # ========================================================================
    #  SECTION 9 — PUBLIC WRITES — the value-transfer path (escrow custody OUT)
    # ========================================================================

    @gl.public.write
    def withdraw(self, amount: int) -> None:
        """Turn a credited internal balance into a REAL native-token
        transfer from the contract to the caller. This is the sole exit
        point for every credit created by settlement/refund/cancellation
        above — funds sit in escrow until explicitly withdrawn."""
        sender = gl.message.sender_address
        try:
            amount = int(amount)
        except (ValueError, TypeError):
            raise gl.vm.UserError(ERR_EXPECTED + "amount must be an integer")
        current = self.balances.get(sender)
        available = int(current) if current is not None else 0
        _require(amount > 0, "withdraw amount must be positive")
        _require(amount <= available, f"insufficient balance: have {available}")

        # zero-then-transfer, enforced here too even though this is already
        # a post-ledger internal credit — no exceptions to the ordering rule
        self.balances[sender] = u256(available - amount)
        self._send_native(sender, amount)

    @gl.public.write
    def withdraw_all(self) -> int:
        """Convenience wrapper: withdraw the caller's entire internal
        balance. Returns the amount transferred."""
        sender = gl.message.sender_address
        current = self.balances.get(sender)
        available = int(current) if current is not None else 0
        _require(available > 0, "no balance to withdraw")
        self.balances[sender] = u256(0)
        self._send_native(sender, available)
        return available

    # ========================================================================
    #  SECTION 10 — PUBLIC WRITES — administration
    # ========================================================================

    @gl.public.write
    def add_admin(self, address: str) -> None:
        self._only_owner()
        self.admins[Address(address).as_hex] = True

    @gl.public.write
    def remove_admin(self, address: str) -> None:
        self._only_owner()
        self.admins[Address(address).as_hex] = False

    @gl.public.write
    def pause(self) -> None:
        """Admin: halt policy creation, acceptance, claims, and settlement.
        Existing withdraw() calls remain available so no funds are ever
        frozen by an emergency pause."""
        self._only_admin()
        self.paused = True

    @gl.public.write
    def unpause(self) -> None:
        self._only_admin()
        self.paused = False

    @gl.public.write
    def set_protocol_fee_bps(self, new_fee_bps: int) -> None:
        self._only_owner()
        _require(0 <= new_fee_bps <= MAX_PROTOCOL_FEE_BPS, f"fee must be 0..{MAX_PROTOCOL_FEE_BPS} bps")
        self.protocol_fee_bps = u32(new_fee_bps)

    @gl.public.write
    def set_min_premium_bps(self, new_min_bps: int) -> None:
        self._only_owner()
        _require(
            MIN_ALLOWED_PREMIUM_BPS <= new_min_bps <= MAX_ALLOWED_PREMIUM_BPS,
            f"min premium must be {MIN_ALLOWED_PREMIUM_BPS}..{MAX_ALLOWED_PREMIUM_BPS} bps",
        )
        self.min_premium_bps = u32(new_min_bps)

    @gl.public.write
    def set_min_coverage_wei(self, new_min_wei: int) -> None:
        self._only_owner()
        _require(new_min_wei >= 0, "minimum coverage must be non-negative")
        self.min_coverage_wei = u256(new_min_wei)

    @gl.public.write
    def set_default_windows(self, accept_window_seconds: int, claim_grace_seconds: int) -> None:
        self._only_owner()
        _require(accept_window_seconds > 0 and claim_grace_seconds > 0, "windows must be positive")
        self.default_accept_window_seconds = u64(accept_window_seconds)
        self.default_claim_grace_seconds = u64(claim_grace_seconds)

    @gl.public.write
    def set_owner(self, new_owner: str) -> None:
        self._only_owner()
        new_addr = Address(new_owner)
        self.admins[new_addr.as_hex] = True
        self.owner = new_addr

    @gl.public.write
    def sweep_protocol_fees(self) -> int:
        """Owner: move accrued protocol fees into the owner's withdrawable
        balance (still requires a subsequent withdraw() to actually transfer
        GEN out — same ledger discipline as every other payout)."""
        self._only_owner()
        amount = int(self.accrued_protocol_fees_wei)
        _require(amount > 0, "no fees accrued")
        self.accrued_protocol_fees_wei = u256(0)
        self._credit_balance(self.owner, amount)
        return amount

    # ========================================================================
    #  SECTION 11 — PUBLIC VIEWS
    # ========================================================================

    @gl.public.view
    def get_policy(self, policy_id: int) -> dict:
        return self._policy_dict(self._get_policy(policy_id))

    @gl.public.view
    def get_policies(self, offset: int = 0, limit: int = 20) -> list[dict]:
        """Paginated policy summaries, newest first."""
        count = int(self.policy_count)
        capped_limit = _clamp_int(int(limit), 1, 50)
        start = count - 1 - max(0, int(offset))
        result: list[dict] = []
        idx = start
        while idx >= 0 and len(result) < capped_limit:
            policy = self.policies.get(u64(idx))
            if policy is not None:
                result.append(self._policy_dict(policy))
            idx -= 1
        return result

    @gl.public.view
    def get_policy_count(self) -> int:
        return int(self.policy_count)

    @gl.public.view
    def get_policy_ids_by_status(self, status: str) -> list[int]:
        wanted = status.strip().upper()
        matches: list[int] = []
        for i in range(int(self.policy_count)):
            policy = self.policies.get(u64(i))
            if policy is not None and STATUS_NAMES.get(int(policy.status)) == wanted:
                matches.append(i)
        return matches

    @gl.public.view
    def get_policy_ids_by_field(self, research_field: str) -> list[int]:
        wanted = research_field.strip().lower()
        matches: list[int] = []
        for i in range(int(self.policy_count)):
            policy = self.policies.get(u64(i))
            if policy is not None and policy.research_field.strip().lower() == wanted:
                matches.append(i)
        return matches

    @gl.public.view
    def get_sponsor_policy_ids(self, address: str) -> list[int]:
        arr = self.sponsor_policy_ids.get(Address(address))
        return [int(x) for x in arr] if arr is not None else []

    @gl.public.view
    def get_researcher_policy_ids(self, address: str) -> list[int]:
        arr = self.researcher_policy_ids.get(Address(address))
        return [int(x) for x in arr] if arr is not None else []

    @gl.public.view
    def get_evaluation_history(self, policy_id: int) -> list[dict]:
        self._get_policy(policy_id)
        history = self.evaluation_history.get(u64(policy_id))
        if history is None:
            return []
        return [self._evaluation_dict(rec) for rec in history]

    @gl.public.view
    def get_activity(self, policy_id: int, offset: int = 0, limit: int = 25) -> list[dict]:
        """Recent activity log entries for a policy, newest first."""
        self._get_policy(policy_id)
        log = self.activity.get(u64(policy_id))
        if log is None:
            return []
        total = len(log)
        capped = _clamp_int(int(limit), 1, 100)
        start = total - 1 - max(0, int(offset))
        result: list[dict] = []
        idx = start
        while idx >= 0 and len(result) < capped:
            evt = log[idx]
            result.append(
                {
                    "kind": evt.kind,
                    "actor": evt.actor.as_hex,
                    "amount": int(evt.amount),
                    "ts": int(evt.ts),
                    "note": evt.note,
                }
            )
            idx -= 1
        return result

    @gl.public.view
    def get_balance_of(self, address: str) -> int:
        """Internal withdrawable native balance of an address — call
        withdraw() to convert this into a real on-chain transfer."""
        current = self.balances.get(Address(address))
        return int(current) if current is not None else 0

    @gl.public.view
    def get_user_stats(self, address: str) -> dict:
        stats = self.user_stats.get(address.lower())
        if stats is None:
            stats = self.user_stats.get(address)
        if stats is None:
            return {
                "address": address,
                "policies_sponsored": 0,
                "policies_researched": 0,
                "claims_filed": 0,
                "claims_passed": 0,
                "claims_partial": 0,
                "claims_failed": 0,
                "total_coverage_funded_wei": 0,
                "total_payouts_received_wei": 0,
            }
        return {
            "address": stats.address,
            "policies_sponsored": int(stats.policies_sponsored),
            "policies_researched": int(stats.policies_researched),
            "claims_filed": int(stats.claims_filed),
            "claims_passed": int(stats.claims_passed),
            "claims_partial": int(stats.claims_partial),
            "claims_failed": int(stats.claims_failed),
            "total_coverage_funded_wei": int(stats.total_coverage_funded_wei),
            "total_payouts_received_wei": int(stats.total_payouts_received_wei),
        }

    @gl.public.view
    def quote_required_premium(self, policy_id: int) -> int:
        """The exact wei a researcher must attach to accept_policy()."""
        policy = self._get_policy(policy_id)
        return (int(policy.coverage_wei) * int(policy.premium_bps)) // BPS_DENOMINATOR

    @gl.public.view
    def quote_settlement_preview(self, policy_id: int) -> dict:
        """Non-binding preview of how a policy WOULD settle at its current
        (already-evaluated) verdict, without mutating state. Useful for
        frontends to show "pending settlement" figures."""
        policy = self._get_policy(policy_id)
        coverage = int(policy.coverage_deposited)
        premium = int(policy.premium_deposited)
        payout_bps = int(policy.payout_bps)
        researcher_share = (coverage * payout_bps) // BPS_DENOMINATOR
        protocol_fee = (researcher_share * int(self.protocol_fee_bps)) // BPS_DENOMINATOR if researcher_share > 0 else 0
        researcher_net = researcher_share - protocol_fee
        sponsor_refund = coverage - researcher_share
        return {
            "verdict": VERDICT_NAMES.get(int(policy.verdict), "NONE"),
            "researcher_payout_wei": researcher_net + (premium if int(policy.verdict) != VERDICT_FAIL else 0),
            "sponsor_refund_wei": sponsor_refund + (premium if int(policy.verdict) == VERDICT_FAIL else 0),
            "protocol_fee_wei": protocol_fee,
        }

    @gl.public.view
    def get_platform_stats(self) -> dict:
        return {
            "policy_count": int(self.policy_count),
            "total_coverage_funded_wei": int(self.total_coverage_funded_wei),
            "total_premiums_staked_wei": int(self.total_premiums_staked_wei),
            "total_payouts_wei": int(self.total_payouts_wei),
            "total_policies_settled": int(self.total_policies_settled),
            "accrued_protocol_fees_wei": int(self.accrued_protocol_fees_wei),
            "paused": bool(self.paused),
        }

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "owner": self.owner.as_hex,
            "paused": bool(self.paused),
            "protocol_fee_bps": int(self.protocol_fee_bps),
            "min_premium_bps": int(self.min_premium_bps),
            "min_coverage_wei": int(self.min_coverage_wei),
            "default_accept_window_seconds": int(self.default_accept_window_seconds),
            "default_claim_grace_seconds": int(self.default_claim_grace_seconds),
            "max_evidence_urls": MAX_EVIDENCE_URLS,
            "min_evidence_urls": MIN_EVIDENCE_URLS,
            "criteria": list(CRITERIA),
            "criteria_weights_bps": dict(DEFAULT_CRITERIA_WEIGHTS_BPS),
            "score_bands": {
                "fail_max": SCORE_BAND_FAIL_MAX,
                "partial_min": SCORE_BAND_PARTIAL_MIN,
                "partial_max": SCORE_BAND_PARTIAL_MAX,
                "pass_min": SCORE_BAND_PASS_MIN,
            },
            "min_actionable_confidence": MIN_ACTIONABLE_CONFIDENCE,
        }

    @gl.public.view
    def is_admin(self, address: str) -> bool:
        return bool(self.admins.get(Address(address).as_hex, False))
