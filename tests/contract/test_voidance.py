"""Automated tests for the Voidance Intelligent Contract.

Runs in genlayer-test's "Direct Mode" — the contract executes in-memory
against the real pinned GenVM SDK (see the "Depends" header in
contracts/innovation_failure_insurance.py), with `mock_web`/`mock_llm`
standing in for the nondet web-fetch and LLM calls that would otherwise run
against real network resources during validator consensus.

Run with:
    pip install genlayer-test
    pytest tests/contract -v
(requires the gltest.config.yaml at the repo root, and Python 3.12/3.13 —
see MEMORY.md for a note on a Python 3.14 incompatibility discovered while
building this suite.)
"""

import json

import pytest

CONTRACT = "innovation_failure_insurance.py"

METHODOLOGY_URL = "https://example.com/methodology.pdf"
EVIDENCE_URL_1 = "https://example.com/dataset.csv"
EVIDENCE_URL_2 = "https://example.com/lab-notebook.pdf"

NOW = 1_800_000_000
MILESTONE_DEADLINE = NOW + 30 * 24 * 3600


def _deploy(direct_deploy, **overrides):
    kwargs = dict(min_coverage_wei=0, min_premium_bps=300, protocol_fee_bps=150, owner_address="")
    kwargs.update(overrides)
    return direct_deploy(
        CONTRACT,
        kwargs["min_coverage_wei"],
        kwargs["min_premium_bps"],
        kwargs["protocol_fee_bps"],
        kwargs["owner_address"],
    )


def _create_policy(contract, direct_vm, sponsor, coverage_wei=100_000, premium_bps=300):
    direct_vm.sender = sponsor
    direct_vm.value = coverage_wei
    policy_id = contract.create_policy(
        "Quantum Resilience Study",
        "Investigating decoherence-resistant qubit arrays.",
        "Physics",
        METHODOLOGY_URL,
        "Double-blind, pre-registered protocol.",
        "Demonstrate 100x decoherence time improvement.",
        json.dumps(["quantum", "hardware"]),
        MILESTONE_DEADLINE,
        NOW,
        premium_bps,
        0,
        0,
    )
    direct_vm.value = 0
    return policy_id


class TestPolicyLifecycle:
    def test_create_policy_locks_real_coverage(self, direct_vm, direct_deploy, direct_alice):
        contract = _deploy(direct_deploy)
        policy_id = _create_policy(contract, direct_vm, direct_alice, coverage_wei=100_000)

        policy = contract.get_policy(policy_id)
        assert policy["status"] == "CREATED"
        assert policy["coverage_wei"] == 100_000
        assert policy["coverage_deposited"] == 100_000

    def test_create_policy_rejects_zero_value(self, direct_vm, direct_deploy, direct_alice):
        contract = _deploy(direct_deploy)
        direct_vm.sender = direct_alice
        direct_vm.value = 0
        with direct_vm.expect_revert():
            contract.create_policy(
                "t", "d", "f", METHODOLOGY_URL, "s", "m", "[]", MILESTONE_DEADLINE, NOW, 300, 0, 0
            )

    def test_accept_policy_requires_exact_premium(
        self, direct_vm, direct_deploy, direct_alice, direct_bob
    ):
        contract = _deploy(direct_deploy)
        policy_id = _create_policy(contract, direct_vm, direct_alice, coverage_wei=100_000, premium_bps=300)
        required_premium = contract.quote_required_premium(policy_id)
        assert required_premium == 3_000  # 3% of 100,000

        direct_vm.sender = direct_bob
        direct_vm.value = required_premium - 1
        with direct_vm.expect_revert():
            contract.accept_policy(policy_id, NOW + 10)
        direct_vm.value = 0

    def test_accept_policy_succeeds_with_exact_premium(
        self, direct_vm, direct_deploy, direct_alice, direct_bob
    ):
        contract = _deploy(direct_deploy)
        policy_id = _create_policy(contract, direct_vm, direct_alice, coverage_wei=100_000, premium_bps=300)
        required_premium = contract.quote_required_premium(policy_id)

        direct_vm.sender = direct_bob
        direct_vm.value = required_premium
        contract.accept_policy(policy_id, NOW + 10)
        direct_vm.value = 0

        policy = contract.get_policy(policy_id)
        assert policy["status"] == "ACTIVE"
        assert policy["premium_deposited"] == required_premium
        assert policy["researcher"].lower() == ("0x" + direct_bob.hex()).lower()

    def test_sponsor_cannot_accept_own_policy(self, direct_vm, direct_deploy, direct_alice):
        contract = _deploy(direct_deploy)
        policy_id = _create_policy(contract, direct_vm, direct_alice, coverage_wei=100_000)
        required_premium = contract.quote_required_premium(policy_id)

        direct_vm.sender = direct_alice
        direct_vm.value = required_premium
        with direct_vm.expect_revert():
            contract.accept_policy(policy_id, NOW + 10)
        direct_vm.value = 0


class TestCancellationAndTimeouts:
    def test_cancel_before_acceptance_refunds_sponsor(
        self, direct_vm, direct_deploy, direct_alice
    ):
        contract = _deploy(direct_deploy)
        policy_id = _create_policy(contract, direct_vm, direct_alice, coverage_wei=50_000)

        direct_vm.sender = direct_alice
        contract.cancel_policy(policy_id, NOW + 5)

        policy = contract.get_policy(policy_id)
        assert policy["status"] == "CANCELLED"
        assert policy["coverage_deposited"] == 0
        assert contract.get_balance_of(("0x" + direct_alice.hex())) == 50_000

    def test_sponsor_timeout_reclaims_coverage_if_unaccepted(
        self, direct_vm, direct_deploy, direct_alice
    ):
        contract = _deploy(direct_deploy)
        policy_id = _create_policy(contract, direct_vm, direct_alice, coverage_wei=20_000)

        accept_deadline = contract.get_policy(policy_id)["accept_deadline_ts"]
        with direct_vm.expect_revert():
            contract.claim_sponsor_timeout(policy_id, accept_deadline - 1)

        contract.claim_sponsor_timeout(policy_id, accept_deadline + 1)
        policy = contract.get_policy(policy_id)
        assert policy["status"] == "EXPIRED_UNACCEPTED"
        assert contract.get_balance_of(("0x" + direct_alice.hex())) == 20_000

    def test_expired_no_claim_returns_both_sides_their_funds(
        self, direct_vm, direct_deploy, direct_alice, direct_bob
    ):
        contract = _deploy(direct_deploy)
        policy_id = _create_policy(contract, direct_vm, direct_alice, coverage_wei=100_000)
        required_premium = contract.quote_required_premium(policy_id)

        direct_vm.sender = direct_bob
        direct_vm.value = required_premium
        contract.accept_policy(policy_id, NOW + 10)
        direct_vm.value = 0

        claim_deadline = contract.get_policy(policy_id)["claim_deadline_ts"]
        contract.claim_expired_no_claim(policy_id, claim_deadline + 1)

        policy = contract.get_policy(policy_id)
        assert policy["status"] == "EXPIRED_NO_CLAIM"
        assert contract.get_balance_of(("0x" + direct_alice.hex())) == 100_000
        assert contract.get_balance_of(("0x" + direct_bob.hex())) == required_premium


class TestClaimAdjudication:
    """Covers the nondet web-fetch + LLM adjudication path via mock_web/mock_llm."""

    def _accept_and_submit_claim(self, contract, direct_vm, alice, bob):
        policy_id = _create_policy(contract, direct_vm, alice, coverage_wei=100_000, premium_bps=300)
        required_premium = contract.quote_required_premium(policy_id)

        direct_vm.sender = bob
        direct_vm.value = required_premium
        contract.accept_policy(policy_id, NOW + 10)
        direct_vm.value = 0

        contract.submit_claim(
            policy_id,
            "The qubit array decohered faster than predicted despite following the "
            "pre-registered protocol exactly; hardware limitation, not negligence.",
            json.dumps([EVIDENCE_URL_1, EVIDENCE_URL_2]),
            NOW + 20,
        )
        return policy_id

    def test_pass_verdict_pays_full_coverage_to_researcher(
        self, direct_vm, direct_deploy, direct_alice, direct_bob
    ):
        contract = _deploy(direct_deploy)
        policy_id = self._accept_and_submit_claim(contract, direct_vm, direct_alice, direct_bob)

        direct_vm.mock_web(r".*", {"status": 200, "body": "Rigorous, well-documented methodology."})
        direct_vm.mock_llm(
            r".*",
            json.dumps(
                {
                    "criteria": {
                        "methodology_rigor": 90,
                        "honest_attempt": 92,
                        "documentation_quality": 88,
                        "independent_evidence": 80,
                        "knowledge_value": 85,
                    },
                    "total_score": 88,
                    "confidence": 90,
                    "fraud_flag": False,
                    "reasoning": "Evidence strongly supports a rigorous, honest failure.",
                    "evidence_assessment": "Dataset and lab notebook both corroborate the claim.",
                }
            ),
        )

        result = contract.evaluate_claim(policy_id, NOW + 30)
        assert result["verdict"] == "PASS"
        assert result["status"] == "SETTLED_PASS"

        required_premium = 3_000
        protocol_fee = (100_000 * 150) // 10_000  # 1500
        expected_researcher_credit = (100_000 - protocol_fee) + required_premium
        assert contract.get_balance_of(("0x" + direct_bob.hex())) == expected_researcher_credit
        assert contract.get_balance_of(("0x" + direct_alice.hex())) == 0

    def test_fail_verdict_refunds_sponsor_and_forfeits_bond(
        self, direct_vm, direct_deploy, direct_alice, direct_bob
    ):
        contract = _deploy(direct_deploy)
        policy_id = self._accept_and_submit_claim(contract, direct_vm, direct_alice, direct_bob)

        direct_vm.mock_web(r".*", {"status": 200, "body": "No real experiment log found."})
        direct_vm.mock_llm(
            r".*",
            json.dumps(
                {
                    "criteria": {
                        "methodology_rigor": 10,
                        "honest_attempt": 5,
                        "documentation_quality": 5,
                        "independent_evidence": 0,
                        "knowledge_value": 5,
                    },
                    "total_score": 8,
                    "confidence": 85,
                    "fraud_flag": True,
                    "reasoning": "No independent evidence; narrative unsupported by any data.",
                    "evidence_assessment": "Both evidence URLs failed to substantiate the claim.",
                }
            ),
        )

        result = contract.evaluate_claim(policy_id, NOW + 30)
        assert result["verdict"] == "FAIL"
        assert result["status"] == "SETTLED_FAIL"

        required_premium = 3_000
        assert contract.get_balance_of(("0x" + direct_alice.hex())) == 100_000 + required_premium
        assert contract.get_balance_of(("0x" + direct_bob.hex())) == 0

    def test_partial_verdict_prorates_payout(
        self, direct_vm, direct_deploy, direct_alice, direct_bob
    ):
        contract = _deploy(direct_deploy)
        policy_id = self._accept_and_submit_claim(contract, direct_vm, direct_alice, direct_bob)

        direct_vm.mock_web(r".*", {"status": 200, "body": "Partially documented methodology."})
        direct_vm.mock_llm(
            r".*",
            json.dumps(
                {
                    "criteria": {
                        "methodology_rigor": 60,
                        "honest_attempt": 65,
                        "documentation_quality": 50,
                        "independent_evidence": 40,
                        "knowledge_value": 55,
                    },
                    "total_score": 55,
                    "confidence": 70,
                    "fraud_flag": False,
                    "reasoning": "Mixed rigor — some documentation gaps but genuine attempt.",
                    "evidence_assessment": "One evidence source partially supports the claim.",
                }
            ),
        )

        result = contract.evaluate_claim(policy_id, NOW + 30)
        assert result["verdict"] == "PARTIAL"
        assert result["status"] == "SETTLED_PARTIAL"
        assert 0 < result["payout_bps"] < 10_000

        # both sides should have received *something* — no funds stuck
        assert contract.get_balance_of(("0x" + direct_bob.hex())) > 0
        assert contract.get_balance_of(("0x" + direct_alice.hex())) >= 0

    def test_low_confidence_verdict_stays_open_for_re_evaluation(
        self, direct_vm, direct_deploy, direct_alice, direct_bob
    ):
        contract = _deploy(direct_deploy)
        policy_id = self._accept_and_submit_claim(contract, direct_vm, direct_alice, direct_bob)

        direct_vm.mock_web(r".*", {"status": 500, "body": ""})
        direct_vm.mock_llm(
            r".*",
            json.dumps(
                {
                    "criteria": {
                        "methodology_rigor": 50,
                        "honest_attempt": 50,
                        "documentation_quality": 50,
                        "independent_evidence": 50,
                        "knowledge_value": 50,
                    },
                    "total_score": 50,
                    "confidence": 20,  # below MIN_ACTIONABLE_CONFIDENCE
                    "fraud_flag": False,
                    "reasoning": "Sources unreachable; cannot confidently adjudicate.",
                    "evidence_assessment": "All evidence sources failed to load.",
                }
            ),
        )

        result = contract.evaluate_claim(policy_id, NOW + 30)
        assert result["status"] == "CLAIM_SUBMITTED"  # unsettled — no funds moved
        assert contract.get_balance_of(("0x" + direct_bob.hex())) == 0
        assert contract.get_balance_of(("0x" + direct_alice.hex())) == 0


class TestAdminControls:
    def test_only_owner_can_pause(self, direct_vm, direct_deploy, direct_alice):
        contract = _deploy(direct_deploy)
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert():
            contract.pause()

    def test_paused_contract_rejects_new_policies(
        self, direct_vm, direct_deploy, direct_owner, direct_alice
    ):
        contract = _deploy(direct_deploy)
        direct_vm.sender = direct_owner
        contract.pause()

        direct_vm.sender = direct_alice
        direct_vm.value = 1_000
        with direct_vm.expect_revert():
            contract.create_policy(
                "t", "d", "f", METHODOLOGY_URL, "s", "m", "[]", MILESTONE_DEADLINE, NOW, 300, 0, 0
            )
        direct_vm.value = 0

    def test_protocol_fee_cap_enforced(self, direct_vm, direct_deploy, direct_owner):
        contract = _deploy(direct_deploy)
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert():
            contract.set_protocol_fee_bps(2000)  # exceeds MAX_PROTOCOL_FEE_BPS (1000)
