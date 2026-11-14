"""
Pipeline configuration for the Safe ML Experiment Runner.

All configuration is defined in code (dataclasses) with optional YAML overrides.
No model weights, adapters, credentials, or restricted data are referenced here.

Model identity (corrected):
- Qwen3.6-35B-A3B is the TARGET base model per the research plan. It is NOT
  available locally; downloading it (~70 GB BF16 / ~17.5 GB 4-bit) is prohibited
  without explicit operator approval.
- The only locally available base model is Qwen2.5-7B-Instruct-4bit
  (/Users/himnishdukkola/Documents/tds-agent/tds-model-qwen/), 7.6B params,
  4-bit quantized, ~4 GB on disk.
- Local adapters (tds-agent, tds-agent-qwen) are LoRA adapters trained on
  Qwen2.5-7B-Instruct-4bit, NOT on Qwen3.6-35B-A3B.
- There is NO Qwen3.6-35B-A3B adapter and NO step-360 checkpoint locally.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any


class RunMode(str, Enum):
    DRY_RUN = "dry-run"
    EVALUATE_ONLY = "evaluate-only"
    TRAIN_ONCE = "train-once"
    SCHEDULED = "scheduled"


class DatasetClass(str, Enum):
    SYNTHETIC = "synthetic"
    REAL = "real"
    MODEL_GENERATED = "model_generated"
    MIXED = "mixed"


class LicenseStatus(str, Enum):
    APPROVED = "approved"
    REVIEW_REQUIRED = "review_required"
    BLOCKED = "blocked"


@dataclass
class DatasetEntry:
    """Machine-readable dataset registry entry (Phase 2)."""

    name: str
    source_url: str
    revision: str | None = None
    sha256: str | None = None
    license: str | None = None
    license_status: LicenseStatus = LicenseStatus.REVIEW_REQUIRED
    dataset_class: DatasetClass = DatasetClass.REAL
    permitted_use: str | None = None
    annotation_quality: str | None = None
    label_provenance: str | None = None
    split_assignment: dict[str, str] | None = None
    exclusion_list: list[str] = field(default_factory=list)
    restricted_data: bool = False
    cloud_processing: bool = False
    review_required: bool = False
    notes: str | None = None

    def is_ingestible(self) -> bool:
        """A dataset may be ingested only if license is approved and not restricted."""
        return (
            self.license_status == LicenseStatus.APPROVED
            and not self.restricted_data
            and not self.review_required
        )


@dataclass
class ResourceLimits:
    """Resource safeguards for training (Phase 4)."""

    max_memory_gb: float = 40.0  # Leave headroom on 48 GB unified memory
    max_disk_gb: float = 100.0
    max_duration_minutes: int = 60
    max_temperature_c: float | None = None  # None = thermal telemetry unsupported
    max_concurrent_training: int = 1
    smoke_test_max_steps: int = 10
    smoke_test_max_duration_minutes: int = 5


@dataclass
class EvaluationLeakageConfig:
    """Configuration for evaluation/training leakage prevention (Phase 3).

    Ensures article-level and patient-level disjointness between training and
    held-out evaluation sets. Never fabricates gold labels or treats
    model-generated annotations as clinical ground truth.
    """

    enabled: bool = True
    check_article_id_overlap: bool = True
    check_patient_id_overlap: bool = True
    exclude_training_ids_from_eval: bool = True
    eval_split_must_be_disjoint: bool = True
    # Article/patient IDs that must never appear in evaluation (from training data)
    forced_exclusion_ids: list[str] = field(default_factory=list)
    # IDs observed in training data that are automatically excluded from eval
    observed_training_ids: list[str] = field(default_factory=list)


@dataclass
class ModelConfig:
    """Model configuration.

    Qwen3.6-35B-A3B is the target base model but is NOT available locally.
    The local model is Qwen2.5-7B-Instruct-4bit.
    """

    # Target base model (per research plan) - NOT available locally
    base_model_id: str = "Qwen/Qwen3.6-35B-A3B"
    base_model_available_locally: bool = False
    base_model_download_size_gb_4bit: float = 17.5
    base_model_download_size_gb_bf16: float = 70.0

    # Locally available base model
    local_model_path: str | None = "/Users/himnishdukkola/Documents/tds-agent/tds-model-qwen"
    local_model_id: str = "mlx-community/Qwen2.5-7B-Instruct-4bit"
    local_model_params: int = 7_615_616_512
    local_model_quantization: str = "4-bit"
    local_model_architecture: str = "Qwen2ForCausalLM"

    # Adapter configuration
    adapter_path: str | None = None
    training_framework: str = "mlx"
    fine_tune_type: str = "lora"
    lora_rank: int = 8
    lora_layers: int = 8
    max_seq_length: int = 2048

    # Local adapters (trained on Qwen2.5-7B-Instruct-4bit, NOT Qwen3.6-35B-A3B)
    local_adapters: dict[str, str] = field(
        default_factory=lambda: {
            "tds-agent": "/Users/himnishdukkola/Documents/tds-agent/adapters/tds-agent",
            "tds-agent-qwen": "/Users/himnishdukkola/Documents/tds-agent/adapters/tds-agent-qwen",
        }
    )


@dataclass
class PipelineConfig:
    """Top-level pipeline configuration."""

    mode: RunMode = RunMode.DRY_RUN
    datasets: list[DatasetEntry] = field(default_factory=list)
    resources: ResourceLimits = field(default_factory=ResourceLimits)
    model: ModelConfig = field(default_factory=ModelConfig)
    leakage: EvaluationLeakageConfig = field(default_factory=EvaluationLeakageConfig)
    work_dir: str = str(Path.cwd())
    checkpoint_dir: str = str(Path.cwd() / "checkpoints")
    run_dir: str = str(Path.cwd() / "runs")
    log_dir: str = str(Path.cwd() / "logs")
    require_operator_approval: bool = True
    auto_promote: bool = False  # Never auto-promote
    thermal_telemetry_available: bool = False  # Mark unsupported if unavailable
    dry_run_only: bool = False

    def validate(self) -> list[str]:
        """Validate configuration. Returns list of error messages."""
        errors: list[str] = []

        # No unsupervised training
        if self.mode in (RunMode.TRAIN_ONCE, RunMode.SCHEDULED) and not self.require_operator_approval:
            errors.append("require_operator_approval must be True for training modes")

        # Never auto-promote
        if self.auto_promote:
            errors.append("auto_promote must always be False")

        # Thermal telemetry
        if self.resources.max_temperature_c is not None and not self.thermal_telemetry_available:
            errors.append("max_temperature_c set but thermal_telemetry_available is False")

        # Resource sanity
        if self.resources.max_memory_gb > 44.0:
            errors.append("max_memory_gb should not exceed 44 GB on 48 GB unified memory")

        # No 35B training locally (target model not available, would exceed memory)
        if self.model.base_model_id == "Qwen/Qwen3.6-35B-A3B" and self.mode in (
            RunMode.TRAIN_ONCE,
            RunMode.SCHEDULED,
        ):
            errors.append(
                "Qwen3.6-35B-A3B training not available locally "
                f"({self.model.base_model_download_size_gb_4bit} GB 4-bit > 48 GB memory). "
                "Use the local Qwen2.5-7B-Instruct-4bit model instead."
            )

        # Leakage config must be enabled
        if not self.leakage.enabled:
            errors.append("evaluation leakage detection must be enabled")

        return errors


DEFAULT_CONFIG = PipelineConfig()


def load_config(path: str | Path | None = None) -> PipelineConfig:
    """Load configuration. YAML override support is reserved for future use."""
    if path is None:
        return DEFAULT_CONFIG
    # YAML loading reserved; for now return defaults with a note
    raise NotImplementedError("YAML config loading not yet implemented; use code defaults")