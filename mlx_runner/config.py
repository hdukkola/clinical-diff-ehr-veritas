"""
Pipeline configuration for the Safe ML Experiment Runner (continuous 35B ML pipeline).

All configuration is defined in code (dataclasses) with optional YAML overrides.
No model weights, adapters, credentials, or restricted data are referenced here.

Model identity (verified from local artifacts):
- Base model: mlx-community/Qwen3.6-35B-A3B-4bit (community conversion)
  Local snapshot: ~/.cache/huggingface/hub/models--mlx-community--Qwen3.6-35B-A3B-4bit/
  Revision: 38740b847e4cb78f352aba30aa41c76e08e6eb46
  Quantization: 4-bit (QLoRA-style, NOT CUDA/bitsandbytes NF4)
  Upstream source correspondence: NOT independently verified
- Official model: Qwen/Qwen3.6-35B-A3B at revision 995ad96eacd98c81ed38be0c5b274b04031597b0
  (~35.95B BF16 params, ~67 GiB storage) — NOT downloaded locally
- Training framework: mlx-lm 0.31.3, mlx 0.32.0, Python 3.14.7
- Hardware: Apple M5 Pro, 18 CPU cores, ~48 GB unified memory

Hardware constraints (measured from prior runs):
- Peak training memory: 24.960 GB (35B 4-bit LoRA, rank 8, 2 layers, seq 1024)
- Safe memory ceiling on 48 GB unified: 40 GB (leaves headroom for macOS + other processes)
- Max sequence length used previously: 1024 tokens
- Conservative defaults: max_seq_length=512, batch_size=1, grad_accumulation=4
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


class TrainingStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    ABORTED = "aborted"
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
    """Resource safeguards for training on Apple M5 Pro with 48 GB unified memory.

    Conservative defaults measured from prior 35B 4-bit LoRA training runs
    (peak 24.960 GB). Limits leave headroom for macOS and other processes.
    """

    max_memory_gb: float = 40.0  # Leave headroom on 48 GB unified memory
    max_disk_gb: float = 100.0
    max_duration_minutes: int = 60
    max_temperature_c: float | None = None  # None = thermal telemetry unsupported
    max_concurrent_training: int = 1
    smoke_test_max_steps: int = 10
    smoke_test_max_duration_minutes: int = 5
    # Memory pressure: warn at this fraction of unified memory, abort above it
    memory_warn_fraction: float = 0.75   # 36 GB
    memory_abort_fraction: float = 0.85  # 40.8 GB
    # Free disk minimum before starting any experiment
    min_free_disk_gb: float = 20.0
    # Max consecutive failed experiments before scheduler pauses
    max_consecutive_failures: int = 3


@dataclass
class TrainingEnvConfig:
    """Conservative training environment for Apple Silicon MLX.

    These settings are designed to avoid memory swapping, keep the Mac usable,
    and allow frequent recoverable checkpoints.
    """

    base_model_id: str = "mlx-community/Qwen3.6-35B-A3B-4bit"
    base_model_local_path: str | None = (
        "/Users/himnishdukkola/.cache/huggingface/hub/"
        "models--mlx-community--Qwen3.6-35B-A3B-4bit/"
        "snapshots/38740b847e4cb78f352aba30aa41c76e08e6eb46"
    )
    base_model_available_locally: bool = True
    base_model_revision: str = "38740b847e4cb78f352aba30aa41c76e08e6eb46"
    base_model_quantization: str = "4-bit"

    # Fine-tuning
    fine_tune_type: str = "lora"
    lora_rank: int = 8
    lora_layers: int = 2  # Conservative: final two layers only
    max_seq_length: int = 512  # Conservative: half of prior 1024
    batch_size: int = 1  # Microbatch size = 1
    gradient_accumulation_steps: int = 4  # Effective batch = 4
    learning_rate: float = 1e-5
    seed: int = 2026
    grad_checkpoint: bool = True  # Reduce memory at compute cost
    mask_prompt: bool = True  # Only train on assistant responses

    # Checkpointing
    save_every: int = 60  # Checkpoint every N steps
    steps_per_eval: int = 60  # Evaluate every N steps
    max_checkpoints: int = 5  # Avoid uncontrolled accumulation

    # Optimizer
    optimizer: str = "adam"
    weight_decay: float = 0.01

    # Safety
    never_overwrite_checkpoint: bool = True  # New run dirs, never overwrite
    max_consecutive_failures: int = 3
    no_auto_retry: bool = True  # No automatic retry loops after failures


@dataclass
class EvaluationLeakageConfig:
    """Configuration for evaluation/training leakage prevention (Phase 3)."""

    enabled: bool = True
    check_article_id_overlap: bool = True
    check_patient_id_overlap: bool = True
    exclude_training_ids_from_eval: bool = True
    eval_split_must_be_disjoint: bool = True
    forced_exclusion_ids: list[str] = field(default_factory=list)
    observed_training_ids: list[str] = field(default_factory=list)


@dataclass
class ModelConfig:
    """Model configuration.

    References the locally available Qwen3.6-35B-A3B-4bit community conversion.
    The official Qwen/Qwen3.6-35B-A3B is NOT downloaded locally (~67 GiB BF16).
    """

    training_env: TrainingEnvConfig = field(default_factory=TrainingEnvConfig)

    # Legacy fields (kept for compatibility with existing scheduler/evaluator)
    base_model_id: str = "mlx-community/Qwen3.6-35B-A3B-4bit"
    base_model_available_locally: bool = True
    base_model_download_size_gb_4bit: float = 17.5
    base_model_download_size_gb_bf16: float = 70.0
    adapter_path: str | None = None
    training_framework: str = "mlx"
    fine_tune_type: str = "lora"
    lora_rank: int = 8
    lora_layers: int = 2
    max_seq_length: int = 512

    # Local adapters from prior runs (baseline, not for production use)
    local_adapters: dict[str, str] = field(
        default_factory=lambda: {
            "medication-v1-step360": "/Users/himnishdukkola/.codex/.chatgpt-projects/"
            "g-p-6ae2a77388348191821395e8101c3408/model-development/"
            "local-35b-medication-v1/adapter",
            "research-pilot-step5": "/Users/himnishdukkola/.codex/.chatgpt-projects/"
            "g-p-6ae2a77388348191821395e8101c3408/model-development/"
            "local-35b-research/adapter",
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

        # Training env sanity
        if self.model.training_env.max_seq_length > 2048:
            errors.append("max_seq_length should not exceed 2048 on 48 GB unified memory")
        if self.model.training_env.batch_size < 1:
            errors.append("batch_size must be at least 1")
        if self.model.training_env.gradient_accumulation_steps < 1:
            errors.append("gradient_accumulation_steps must be at least 1")

        # Leakage config must be enabled
        if not self.leakage.enabled:
            errors.append("evaluation leakage detection must be enabled")

        return errors


DEFAULT_CONFIG = PipelineConfig()


def load_config(path: str | Path | None = None) -> PipelineConfig:
    """Load configuration. YAML override support is reserved for future use."""
    if path is None:
        return DEFAULT_CONFIG
    raise NotImplementedError("YAML config loading not yet implemented; use code defaults")